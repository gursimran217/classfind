import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/** Public, minimal group registry — group names only, never exposes invite links. */
export async function GET() {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT sectionCode, groupName, status FROM whatsapp_groups ORDER BY sectionCode`,
    )
    .all()) as unknown as Array<{ sectionCode: string; groupName: string; status: string }>;
  return NextResponse.json({
    status: "ok",
    groups: rows.map((r) => ({
      sectionCode: r.sectionCode,
      groupName: r.groupName,
      inviteReady: r.status === "active",
    })),
  });
}