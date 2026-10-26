import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { slotsForSection, replaceSlotsForSection, recordAudit, type SlotRow } from "@/lib/db";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const url = new URL(req.url);
  const section = (url.searchParams.get("section") ?? "").trim().toUpperCase();
  if (!section) {
    return NextResponse.json({ status: "invalid", error: "Missing section." }, { status: 400 });
  }
  const slots = await slotsForSection(section);
  return NextResponse.json({ status: "ok", section, slots });
}

export async function PUT(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const section = String(body?.section ?? "").trim().toUpperCase();
  if (!section) {
    return NextResponse.json({ status: "invalid", error: "Missing section." }, { status: 400 });
  }
  const incoming = Array.isArray(body?.slots) ? body.slots : [];
  const slots: Array<Omit<SlotRow, "id" | "section">> = [];
  for (const raw of incoming) {
    const day = Number(raw?.day);
    const period = Number(raw?.period);
    if (!Number.isFinite(day) || !Number.isFinite(period)) continue;
    slots.push({
      day,
      period,
      startTime: raw?.startTime ? String(raw.startTime) : null,
      endTime: raw?.endTime ? String(raw.endTime) : null,
      subject: raw?.subject ? String(raw.subject) : null,
      subjectCode: raw?.subjectCode ? String(raw.subjectCode) : null,
      facultyId: Number.isFinite(Number(raw?.facultyId)) && Number(raw.facultyId) > 0 ? Number(raw.facultyId) : null,
      room: raw?.room ? String(raw.room) : null,
      group: raw?.group ? String(raw.group) : null,
      kind: raw?.kind ? String(raw.kind) : "lecture",
    });
  }
  const count = await replaceSlotsForSection(section, slots);
  await recordAudit({ action: "replace", entity: "timetable", entityId: section, detail: { slots: count } });
  return NextResponse.json({ status: "ok", section, count });
}
