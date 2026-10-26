import { NextResponse } from "next/server";
import { findStudentByNameAndPhone, getGroup, recordInviteDelivery, ensureConfigSynced, persistConfig } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function maskMobile(mobile10: string): string {
  if (!mobile10 || mobile10.length !== 10) return "";
  return `${mobile10.slice(0, 2)}••••••${mobile10.slice(8)}`;
}

/**
 * Sends the class-group invitation to the STUDENT'S REGISTERED mobile number
 * only — OTP style. The invite link is never exposed to the browser or any
 * requesting device; it is embedded in a WhatsApp message addressed to the
 * verified number.
 *
 * PRODUCTION: replace the simulated delivery below with the WhatsApp Business
 * Cloud API (`POST /{version}/{phone-number-id}/messages`) using a Meta-approved
 * template containing the invite link. Delivery is bound to the verified number,
 * so an impostor cannot receive another student's invite.
 */
export async function POST(req: Request) {
  await ensureConfigSynced();
  if (!rateLimit(clientIp(req), 10, 60_000)) {
    return NextResponse.json(
      { status: "rate_limited", error: "Too many requests. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: { name?: string; mobile?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", error: "Request could not be read." }, { status: 400 });
  }

  const mobile10 = normalizePhone(String(body.mobile ?? ""));
  if (!mobile10) {
    return NextResponse.json({ status: "invalid", error: "Enter a valid registered mobile number." }, { status: 400 });
  }

  if (!rateLimit(`send:${mobile10}`, 3, 60_000)) {
    return NextResponse.json(
      { status: "rate_limited", error: "Too many invites for this number. Wait a minute." },
      { status: 429 },
    );
  }

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

  const student = matches[0];
  const group = await getGroup(student.section);

  if (!group || !group.inviteLink) {
    return NextResponse.json({
      status: "group_not_ready",
      sectionCode: student.section,
      groupName: group?.groupName ?? null,
      error: "Your class group invitation isn't ready yet.",
      hint: "The invite will be sent to your registered number as soon as the group is configured.",
    });
  }

  // ---- simulated delivery (replace with WhatsApp Business Cloud API) ----
  const method = "simulated";
  const deliveredAt = new Date().toISOString();
  const firstName = student.name.split(" ")[0] || student.name;
  const messagePreview = [
    `Hi ${firstName},`,
    "",
    "Your class details have been verified.",
    "",
    `Class: ${student.section}`,
    `Roll No.: ${student.rollNumber}`,
    "",
    "Your official class WhatsApp group:",
    `[Join Group — ${group.groupName}]`,
    "",
    "See you on campus.",
  ].join("\n");

  await recordInviteDelivery({
    mobile10,
    sectionCode: student.section,
    groupName: group.groupName,
    method,
    status: "delivered",
  });
  await persistConfig();

  return NextResponse.json({
    status: "sent",
    maskedNumber: maskMobile(mobile10),
    sectionCode: student.section,
    groupName: group.groupName,
    messagePreview,
    deliveredAt,
    method,
    requireApproval: Boolean(group.requireApproval),
  });
}