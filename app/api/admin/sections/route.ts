import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import {
  getSection,
  updateSection,
  createSection,
  deleteSection,
  recordAudit,
  type SectionRow,
} from "@/lib/db";

export const runtime = "nodejs";

const CODE_RE = /^[A-Z]{1,4}\d{1,3}[A-Z]?$/;

function unauthorized() {
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const sectionCode = String(body.sectionCode ?? "").trim().toUpperCase();
  if (!CODE_RE.test(sectionCode)) {
    return NextResponse.json(
      { status: "invalid", error: "Section code must look like G1A or G2W." },
      { status: 400 },
    );
  }
  if (await getSection(sectionCode)) {
    return NextResponse.json({ status: "invalid", error: `${sectionCode} already exists.` }, { status: 409 });
  }
  const floorRaw = Number(body.floor);
  const section = await createSection({
    sectionCode,
    roomNumber: body.roomNumber ? String(body.roomNumber).trim() : null,
    floor: Number.isFinite(floorRaw) ? floorRaw : null,
    building: body.building ? String(body.building).trim() : "AB1",
    campus: body.campus ? String(body.campus).trim() : "AB1",
  });
  await recordAudit({ action: "create", entity: "section", entityId: sectionCode, detail: { roomNumber: section?.roomNumber ?? null } });
  return NextResponse.json({ status: "ok", section });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const sectionCode = String(body.sectionCode ?? "").trim().toUpperCase();
  const existing = await getSection(sectionCode);
  if (!existing) {
    return NextResponse.json({ status: "invalid", error: "Unknown section." }, { status: 404 });
  }

  const patch: Partial<Pick<SectionRow, "roomNumber" | "floor" | "building" | "mappingStatus" | "sourceNote" | "active">> = {};
  if (body.roomNumber !== undefined) patch.roomNumber = String(body.roomNumber ?? "").trim();
  if (body.floor !== undefined) {
    const f = Number(body.floor);
    patch.floor = Number.isFinite(f) ? f : existing.floor;
  }
  if (body.building !== undefined) patch.building = String(body.building ?? "").trim();
  if (body.mappingStatus !== undefined) patch.mappingStatus = String(body.mappingStatus ?? "");
  if (body.sourceNote !== undefined) patch.sourceNote = String(body.sourceNote ?? "");
  if (body.active !== undefined) patch.active = body.active ? 1 : 0;

  if (!patch.roomNumber) {
    return NextResponse.json({ status: "invalid", error: "Room number is required." }, { status: 400 });
  }

  await updateSection(sectionCode, { ...patch, mappingStatus: patch.mappingStatus ?? "admin_verified" });
  await recordAudit({
    action: "update",
    entity: "section",
    entityId: sectionCode,
    detail: { from: { roomNumber: existing.roomNumber, floor: existing.floor }, to: { roomNumber: patch.roomNumber, floor: patch.floor ?? existing.floor } },
  });
  return NextResponse.json({ status: "ok", section: await getSection(sectionCode) });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const sectionCode = String(body.sectionCode ?? "").trim().toUpperCase();
  if (!sectionCode) {
    return NextResponse.json({ status: "invalid", error: "Missing section code." }, { status: 400 });
  }
  const removed = await deleteSection(sectionCode);
  if (!removed) {
    return NextResponse.json(
      { status: "invalid", error: "Section has students assigned, or does not exist. Move the students first." },
      { status: 409 },
    );
  }
  await recordAudit({ action: "delete", entity: "section", entityId: sectionCode });
  return NextResponse.json({ status: "ok" });
}
