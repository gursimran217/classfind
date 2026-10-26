import "server-only";

export interface InviteEmail {
  to: string;
  name: string;
  section: string;
  rollNumber: string;
  groupName: string;
  inviteLink: string;
}

export interface EmailMessage {
  to: string;
  name?: string;
  subject: string;
  text: string;
}

export interface EmailResult {
  to: string;
  sent: boolean;
  provider: "resend" | "brevo" | "simulated";
  messageId?: string;
  subject: string;
  preview: string;
}

export function buildInviteEmail(opts: InviteEmail): { subject: string; text: string } {
  const subject = `Your GL Bajaj class group invite — ${opts.section}`;
  const text = [
    `Hi ${opts.name},`,
    "",
    "Your class details have been verified.",
    "",
    `Class: ${opts.section}`,
    `Roll No.: ${opts.rollNumber}`,
    "",
    `Your official class WhatsApp group: ${opts.groupName}`,
    `Join the group here: ${opts.inviteLink}`,
    "",
    "See you on campus.",
    "",
    "— CLASSFIND · GL Bajaj Institute of Technology & Management",
  ].join("\n");
  return { subject, text };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const first = user.slice(0, 2);
  return `${first}•••@${domain}`;
}

/**
 * FREE email providers (no SMS, no GST/DLT/WhatsApp required):
 *   - Brevo: 300 emails/day free forever, no domain needed — verify a sender
 *     address once, then send to ANY recipient. BREVO_API_KEY + EMAIL_FROM.
 *   - Resend: 3,000 emails/month free (free tier only sends to the account
 *     owner's address until a sending domain is verified). RESEND_API_KEY.
 * When no provider is configured the send is simulated so the prototype still
 * demonstrates the full flow.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (process.env.BREVO_API_KEY) {
    return sendBrevo(msg);
  }
  if (process.env.RESEND_API_KEY) {
    return sendResend(msg);
  }
  return { to: msg.to, sent: false, provider: "simulated", subject: msg.subject, preview: msg.text };
}

export function sendInviteEmail(opts: InviteEmail): Promise<EmailResult> {
  const { subject, text } = buildInviteEmail(opts);
  return sendEmail({ to: opts.to, name: opts.name, subject, text });
}

export function sendOtpEmail(to: string, name: string, otp: string): Promise<EmailResult> {
  const subject = "Your CLASSFIND verification code";
  const text = [
    `Hi ${name},`,
    "",
    `Your verification code is ${otp}.`,
    "",
    "It expires in 10 minutes.",
    "",
    "Use it to unlock your class group invite.",
    "",
    "— CLASSFIND · GL Bajaj Institute of Technology & Management",
  ].join("\n");
  return sendEmail({ to, name, subject, text });
}

async function sendResend(msg: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "CLASSFIND <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) {
      return { to: msg.to, sent: false, provider: "resend", subject: msg.subject, preview: msg.text };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { to: msg.to, sent: true, provider: "resend", messageId: data.id, subject: msg.subject, preview: msg.text };
  } catch {
    return { to: msg.to, sent: false, provider: "resend", subject: msg.subject, preview: msg.text };
  }
}

async function sendBrevo(msg: EmailMessage): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY!;
  const fromEmail = process.env.EMAIL_FROM || "";
  const fromName = process.env.EMAIL_FROM_NAME || "CLASSFIND";
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: msg.to, name: msg.name }],
        subject: msg.subject,
        textContent: msg.text,
      }),
    });
    if (!res.ok) {
      return { to: msg.to, sent: false, provider: "brevo", subject: msg.subject, preview: msg.text };
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { to: msg.to, sent: true, provider: "brevo", messageId: data.messageId, subject: msg.subject, preview: msg.text };
  } catch {
    return { to: msg.to, sent: false, provider: "brevo", subject: msg.subject, preview: msg.text };
  }
}