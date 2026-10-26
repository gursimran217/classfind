import "server-only";
import crypto from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Hash an OTP so plaintext codes are never stored. */
export function hashOtp(otp: string, mobile10: string): string {
  return crypto.createHmac("sha256", otp).update(mobile10).digest("hex");
}

export function otpMatches(otp: string, mobile10: string, hash: string): boolean {
  const candidate = hashOtp(otp, mobile10);
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}