import { NextResponse } from "next/server";
import { findStudentByNameAndPhone, getActiveOtp, createOtp, deleteExpiredOtps, consumeAllOtpsForMobile, ensureOtpsSynced, persistOtps } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { generateOtp, hashOtp, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "@/lib/otp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendOtpEmail, isValidEmail, maskEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Sends a verification code to the student's EMAIL — no SMS, no cost.
 *
 * The student's identity is confirmed against the admission workbook first
 * (name + registered mobile), then a code is emailed to the address they
 * entered. On verify, the group invite is emailed to the same address.
 *
 * Delivery is FREE via Brevo (300 emails/day) or Resend when a key is set;
 * otherwise it is simulated and `demoOtp` is returned for the prototype.
 */
export async function POST(req: Request) {
  if (!rateLimit(clientIp(req), 8, 60_000)) {
    return NextResponse.json({ status: "rate_limited", error: "Too many requests. Wait a minute." }, { status: 429 });
  }

  let body: { name?: string; mobile?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", error: "Request could not be read." }, { status: 400 });
  }

  const mobile10 = normalizePhone(String(body.mobile ?? ""));
  const email = String(body.email ?? "").trim();
  if (!mobile10) {
    return NextResponse.json({ status: "invalid", error: "Enter a valid registered mobile number." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ status: "invalid", error: "Enter a valid email to receive your code." }, { status: 400 });
  }

  if (!rateLimit(`otp:${mobile10}`, 3, 60_000)) {
    return NextResponse.json(
      { status: "rate_limited", error: "Too many codes for this number. Wait a minute." },
      { status: 429 },
    );
  }

  await ensureOtpsSynced();

  const matches = await findStudentByNameAndPhone(String(body.name ?? ""), mobile10);
  if (matches.length === 0) {
    return NextResponse.json({ status: "not_found", error: "Couldn't find your details." }, { status: 404 });
  }
  if (matches.length > 1) {
    return NextResponse.json(
      { status: "ambiguous", error: "Multiple records found. Contact the admission helpdesk." },
      { status: 409 },
    );
  }

  await deleteExpiredOtps();

  const existing = await getActiveOtp(mobile10);
  if (existing && Date.now() - new Date(existing.created_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { status: "cooldown", error: "A code was just sent. Check your email and wait a minute." },
      { status: 429 },
    );
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  await consumeAllOtpsForMobile(mobile10);
  await createOtp({ mobile10, section: matches[0].section, otpHash: hashOtp(otp, mobile10), expiresAt });
  await persistOtps();

  const firstName = matches[0].name.split(" ")[0] || matches[0].name;
  const delivery = await sendOtpEmail(email, firstName, otp);

  const response: Record<string, unknown> = {
    status: "sent",
    maskedEmail: maskEmail(email),
    expiresInSeconds: OTP_TTL_MS / 1000,
    delivery: {
      sent: delivery.sent,
      provider: delivery.provider,
    },
  };
  // Only show the code on-screen when no real email provider is configured.
  if (delivery.provider === "simulated") {
    response.demoOtp = otp;
    response.message = `CLASSFIND: your verification code is ${otp}. It expires in 10 minutes. — GL Bajaj`;
  }
  return NextResponse.json(response);
}