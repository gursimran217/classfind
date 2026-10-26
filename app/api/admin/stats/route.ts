import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { getDb, getMeta, listInviteDeliveries, deliveriesCount, groupsCreatedCount } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();

  const totalStudents = ((await db.prepare("SELECT COUNT(*) AS c FROM students").get()) as { c: number }).c;
  const totalSections = ((await db.prepare("SELECT COUNT(*) AS c FROM sections").get()) as { c: number }).c;
  const mappedSections = (
    (await db
      .prepare("SELECT COUNT(*) AS c FROM sections WHERE roomNumber IS NOT NULL AND roomNumber != '' AND active = 1")
      .get()) as { c: number }
  ).c;
  const missingClassroom = (
    (await db
      .prepare("SELECT COUNT(*) AS c FROM sections WHERE roomNumber IS NULL OR roomNumber = '' OR active = 0")
      .get()) as { c: number }
  ).c;
  const groupsActive = (
    (await db.prepare("SELECT COUNT(*) AS c FROM whatsapp_groups WHERE inviteLink IS NOT NULL").get()) as { c: number }
  ).c;
  const missingLinks = (
    (await db.prepare("SELECT COUNT(*) AS c FROM whatsapp_groups WHERE inviteLink IS NULL").get()) as { c: number }
  ).c;
  const groupsCreated = await groupsCreatedCount();
  const invitesSent = await deliveriesCount();

  const sectionStats = (await db
    .prepare(
      `SELECT s.sectionCode,
              s.roomNumber, s.floor, s.building, s.mappingStatus, s.active,
              w.status AS groupStatus, w.inviteLink, w.created AS groupCreated, w.requireApproval,
              (SELECT COUNT(*) FROM students st WHERE st.section = s.sectionCode) AS students
       FROM sections s LEFT JOIN whatsapp_groups w ON w.sectionCode = s.sectionCode
       ORDER BY s.sectionCode`,
    )
    .all()) as unknown as Array<Record<string, unknown>>;

  const lastImportRaw = await getMeta("last_import");
  const lastImport = lastImportRaw ? JSON.parse(lastImportRaw) : null;

  return NextResponse.json({
    status: "ok",
    stats: {
      totalStudents,
      totalSections,
      mappedSections,
      missingClassroom,
      groupsActive,
      missingLinks,
      groupsCreated,
      invitesSent,
      lastImport,
    },
    sectionStats,
    lastDeliveries: await listInviteDeliveries(12),
  });
}