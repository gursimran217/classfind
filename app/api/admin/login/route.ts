import { NextResponse } from "next/server";
import { adminPassword, setSessionCookie } from "@/lib/auth";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplied = String(body.password ?? "");

  const expected = adminPassword();
  const a = crypto.createHash("sha256").update(supplied).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ status: "invalid", error: "Incorrect password." }, { status: 401 });
  }

  await setSessionCookie();
  return NextResponse.json({ status: "ok" });
}