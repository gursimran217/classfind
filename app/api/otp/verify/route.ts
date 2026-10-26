import { NextResponse } from "next/server";
import {
  findStudentByMobile,
  getActiveOtps,
  markOtpConsumed,
  consumeAllOtpsForMobile,
  incrementOtpAttempts,
  deleteExpiredOtps,
  getGroup,
  recordInviteDelivery,
  ensureOtpsSynced,
  persistConfig,
  persistOtps,
} from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { otpMatches, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendInviteEmail, isValidEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Verifies the OTP. On success the invite link for the student's section is
 * SENT TO THE STUDENT'S EMAIL (never returned to the browser). The link is
 * only released after the person proves possession of the registered mobile.
 */
export async function POST(req: Request) {
  if (!rateLimit(clientIp(req), 10, 60_000)) {
    return NextResponse.json({ status: "rate_limited", error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  let body: { name?: string; mobile?: string; otp?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", error: "Request could not be read." }, { status: 400 });
  }

  const mobile10 = normalizePhone(String(body.mobile ?? ""));
  const otp = String(body.otp ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!mobile10 || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ status: "invalid", error: "Enter the 6-digit code." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "invalid", error: "Enter a valid email to receive your invite." }, { status: 400 });
  }

  if (!rateLimit(`otpverify:${mobile10}`, 10, 60_000)) {
    return NextResponse.json(
      { status: "rate_limited", error: "Too many attempts. Wait a minute." },
      { status: 429 },
    );
  }

  await ensureOtpsSynced();
  await deleteExpiredOtps();

  let records = await getActiveOtps(mobile10);
  // Cloudflare D1 / Netlify are eventually consistent — retry once if a send
  // just landed so the first verify attempt right after send doesn't fail.
  if (records.length === 0) {
    await new Promise((r) => setTimeout(r, 800));
    await ensureOtpsSynced();
    await deleteExpiredOtps();
    records = await getActiveOtps(mobile10);
  }
  if (records.length === 0) {
    return NextResponse.json(
      { status: "expired", error: "No active code for this number.", hint: "Request a new code." },
      { status: 400 },
    );
  }

  // Match the entered code against ANY active code for this number.
  const now = Date.now();
  const candidate = records.find((r) => r.expires_at > now && r.attempts < OTP_MAX_ATTEMPTS);
  if (!candidate) {
    return NextResponse.json(
      { status: "expired", error: "This code has expired or too many wrong attempts.", hint: "Request a new code." },
      { status: 400 },
    );
  }

  if (!otpMatches(otp, mobile10, candidate.otp_hash)) {
    await incrementOtpAttempts(candidate.id);
    await persistConfig();
    return NextResponse.json(
      { status: "incorrect", error: "That code isn't right. Check the code on your registered number." },
      { status: 400 },
    );
  }

  await markOtpConsumed(candidate.id);
  await consumeAllOtpsForMobile(mobile10);
  await persistConfig();

  // The code belonged to a verified record — resolve the student + invite.
  const matches = await findStudentByMobile(mobile10);
  if (matches.length === 0) {
    return NextResponse.json({ status: "error", error: "Record not found." }, { status: 404 });
  }
  const student = matches[0];
  const group = await getGroup(student.section);

  const response: Record<string, unknown> = {
    status: "ok",
    verified: true,
    student: {
      name: student.name,
      section: student.section,
      rollNumber: student.rollNumber,
      program: student.program,
    },
  };

  if (!group || !group.inviteLink) {
    response.groupName = group?.groupName ?? `GL Bajaj — ${student.section} Official`;
    response.email = null;
    return NextResponse.json(response);
  }

  const emailResult = await sendInviteEmail({
    to: email,
    name: student.name.split(" ")[0] || student.name,
    section: student.section,
    rollNumber: student.rollNumber,
    groupName: group.groupName,
    inviteLink: group.inviteLink,
  });

  await recordInviteDelivery({
    mobile10,
    sectionCode: student.section,
    groupName: group.groupName,
    method: "otp_verified",
    status: "delivered",
  });
  await persistConfig();

  response.email = emailResult;
  // Security: the invite link itself is never returned to the browser — it is
  // delivered to the verified student's email address only.
  return NextResponse.json(response);
}