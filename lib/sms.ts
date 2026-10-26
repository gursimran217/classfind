import "server-only";

export interface SmsResult {
  sent: boolean;
  provider: "fast2sms" | "msg91" | "twilio" | "simulated";
  route?: string;
}

/**
 * Sends the verification code to the student's mobile via a real SMS gateway.
 *
 * Configure ONE provider (see .env.example). Providers auto-detect when the
 * corresponding key is present:
 *   FAST2SMS_API_KEY  → Fast2SMS Quick SMS route (works WITHOUT DLT registration)
 *   MSG91_AUTH_KEY + MSG91_TEMPLATE_ID → MSG91 OTP API
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM → Twilio
 * When no provider is configured the send is simulated so the prototype still
 * runs end to end — and `demoOtp` is returned to the caller in that case only.
 */
export async function sendOtpSms(mobile10: string, otp: string): Promise<SmsResult> {
  let provider = process.env.SMS_PROVIDER;
  if (!provider) {
    if (process.env.FAST2SMS_API_KEY) provider = "fast2sms";
    else if (process.env.MSG91_AUTH_KEY) provider = "msg91";
    else if (process.env.TWILIO_ACCOUNT_SID) provider = "twilio";
  }
  if (!provider) return { sent: false, provider: "simulated" };

  const phone = `91${mobile10}`;
  const text = `CLASSFIND: your verification code is ${otp}. It is valid for 10 minutes. - GL Bajaj`;

  try {
    if (provider === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM;
      if (!sid || !token || !from) return { sent: false, provider: "simulated" };
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `+${phone}`, From: from, Body: text }),
      });
      return { sent: res.ok, provider: "twilio" };
    }

    if (provider === "fast2sms") {
      const key = process.env.FAST2SMS_API_KEY;
      if (!key) return { sent: false, provider: "simulated" };
      const otpId = process.env.FAST2SMS_OTP_ID;
      if (otpId) {
        // Smart OTP — WhatsApp primary (₹0.25/msg, no DLT). Fast2SMS sends the
        // code we pass and bills per delivered message from the wallet.
        const res = await fetch("https://www.fast2sms.com/dev/otp/send", {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({ otp_id: otpId, mobile: mobile10, otp, otp_expiry: 10 }),
        });
        const data = (await res.json().catch(() => ({}))) as { return?: boolean; message?: string };
        return { sent: res.ok && data.return !== false, provider: "fast2sms", route: "smart-otp" };
      }
      const sender = process.env.FAST2SMS_SENDER;
      const template = process.env.FAST2SMS_TEMPLATE_ID;
      // DLT route (~₹0.25/SMS) once the entity + template are approved — set
      // FAST2SMS_SENDER + FAST2SMS_TEMPLATE_ID. Until then, Quick SMS (₹5/SMS,
      // no DLT) keeps the prototype working.
      const url =
        sender && template
          ? `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(
              key,
            )}&route=dlt&sender=${encodeURIComponent(sender)}&message=${encodeURIComponent(
              text,
            )}&language=english&flash=0&numbers=${encodeURIComponent(phone)}&template_id=${encodeURIComponent(template)}`
          : `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(
              key,
            )}&route=q&message=${encodeURIComponent(text)}&language=english&flash=0&numbers=${encodeURIComponent(phone)}`;
      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as { return?: boolean };
      return {
        sent: res.ok && data.return !== false,
        provider: "fast2sms",
        route: sender && template ? "dlt" : "quick",
      };
    }

    if (provider === "msg91") {
      const key = process.env.MSG91_AUTH_KEY;
      const template = process.env.MSG91_TEMPLATE_ID;
      if (!key || !template) return { sent: false, provider: "simulated" };
      const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(
        template,
      )}&mobile=${encodeURIComponent(phone)}&authkey=${encodeURIComponent(key)}&otp=${encodeURIComponent(otp)}`;
      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as { type?: string };
      return { sent: res.ok && data.type === "success", provider: "msg91" };
    }
  } catch {
    // Provider configured but the call failed — report the attempted provider.
    return { sent: false, provider: provider as SmsResult["provider"] };
  }

  return { sent: false, provider: "simulated" };
}