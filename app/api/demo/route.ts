import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatPhone } from "@/lib/normalize";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Prototype demo utility. Returns ONE sample record from the real dataset so a
 * presenter can run through the full journey. This deliberately exposes a
 * single record (the first G1I student) — NOT the database — and is rate-limited.
 */
export async function GET(req: Request) {
  if (!rateLimit(clientIp(req), 20, 60_000)) {
    return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  }
  const db = await getDb();
  const row = (await db
    .prepare("SELECT name, mobile10, section, rollNumber FROM students WHERE section = 'G1I' ORDER BY id LIMIT 1")
    .get()) as { name: string; mobile10: string; section: string; rollNumber: string } | null;

  if (!row) {
    return NextResponse.json({ status: "error" }, { status: 404 });
  }
  return NextResponse.json({
    status: "ok",
    sample: {
      name: row.name,
      mobile: row.mobile10,
      mobileDisplay: formatPhone(row.mobile10),
      section: row.section,
      rollNumber: row.rollNumber,
    },
  });
}