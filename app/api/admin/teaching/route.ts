import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { listAssignments, createAssignment, deleteAssignment, recordAudit } from "@/lib/db";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const url = new URL(req.url);
  const section = url.searchParams.get("section") ?? "";
  const assignments = await listAssignments(section);
  return NextResponse.json({ status: "ok", assignments });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const facultyId = Number(body?.facultyId);
  const section = String(body?.section ?? "").trim();
  if (!Number.isFinite(facultyId) || facultyId <= 0) {
    return NextResponse.json({ status: "invalid", error: "Pick a faculty member." }, { status: 400 });
  }
  if (!section) {
    return NextResponse.json({ status: "invalid", error: "Pick a section." }, { status: 400 });
  }
  const row = await createAssignment({
    facultyId,
    section,
    subject: String(body?.subject ?? ""),
    subjectCode: String(body?.subjectCode ?? ""),
    role: String(body?.role ?? "subject"),
    sortOrder: Number(body?.sortOrder ?? 0) || 0,
  });
  if (!row) {
    return NextResponse.json({ status: "invalid", error: "Could not create the assignment." }, { status: 400 });
  }
  await recordAudit({ action: "assign", entity: "teaching", entityId: String(row.id), detail: { section, subject: row.subject } });
  return NextResponse.json({ status: "ok", assignment: row });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ status: "invalid", error: "Missing assignment id." }, { status: 400 });
  }
  await deleteAssignment(id);
  await recordAudit({ action: "unassign", entity: "teaching", entityId: String(id) });
  return NextResponse.json({ status: "ok" });
}
