import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import {
  listStudents,
  studentsFilteredCount,
  updateStudent,
  deleteStudent,
  recordAudit,
} from "@/lib/db";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const url = new URL(req.url);
  const filter = {
    q: url.searchParams.get("q") ?? "",
    section: url.searchParams.get("section") ?? "",
    program: url.searchParams.get("program") ?? "",
    limit: Number(url.searchParams.get("limit") ?? 50) || 50,
    offset: Number(url.searchParams.get("offset") ?? 0) || 0,
  };
  const [students, total] = await Promise.all([listStudents(filter), studentsFilteredCount(filter)]);
  return NextResponse.json({ status: "ok", students, total, offset: filter.offset, limit: filter.limit });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ status: "invalid", error: "Missing student id." }, { status: 400 });
  }
  const patch: Record<string, string> = {};
  for (const k of ["name", "mobile", "program", "section", "rollNumber"] as const) {
    if (body[k] !== undefined) patch[k] = String(body[k] ?? "");
  }
  const updated = await updateStudent(id, patch);
  if (!updated) {
    return NextResponse.json({ status: "invalid", error: "Student not found." }, { status: 404 });
  }
  await recordAudit({ action: "update", entity: "student", entityId: String(id), detail: { fields: Object.keys(patch) } });
  return NextResponse.json({ status: "ok", student: updated });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ status: "invalid", error: "Missing student id." }, { status: 400 });
  }
  const ok = await deleteStudent(id);
  if (!ok) {
    return NextResponse.json({ status: "invalid", error: "Student not found." }, { status: 404 });
  }
  await recordAudit({ action: "delete", entity: "student", entityId: String(id) });
  return NextResponse.json({ status: "ok" });
}
