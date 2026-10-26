import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { listPeople, createPerson, updatePerson, deletePerson, recordAudit, type FacultyRow } from "@/lib/db";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}

export async function GET() {
  if (!(await assertAdmin())) return unauthorized();
  const people = await listPeople();
  return NextResponse.json({ status: "ok", faculty: people });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ status: "invalid", error: "Name is required." }, { status: 400 });
  }
  const person = await createPerson({
    name,
    mobile: String(body?.mobile ?? ""),
    email: String(body?.email ?? ""),
    photo: String(body?.photo ?? ""),
    kind: String(body?.kind ?? "faculty"),
    sortOrder: Number(body?.sortOrder ?? 0) || 0,
    active: body?.active === undefined ? 1 : body.active ? 1 : 0,
  });
  await recordAudit({ action: "create", entity: "faculty", entityId: String(person.id), detail: { name: person.name } });
  return NextResponse.json({ status: "ok", faculty: person });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ status: "invalid", error: "Missing faculty id." }, { status: 400 });
  }
  const patch: Partial<Pick<FacultyRow, "name" | "mobile" | "email" | "photo" | "kind" | "sortOrder" | "active">> = {};
  for (const k of ["name", "mobile", "email", "photo", "kind"] as const) {
    if (body[k] !== undefined) patch[k] = String(body[k] ?? "");
  }
  if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder) || 0;
  if (body.active !== undefined) patch.active = body.active ? 1 : 0;

  const updated = await updatePerson(id, patch);
  if (!updated) {
    return NextResponse.json({ status: "invalid", error: "Faculty record not found." }, { status: 404 });
  }
  await recordAudit({ action: "update", entity: "faculty", entityId: String(id), detail: { fields: Object.keys(patch) } });
  return NextResponse.json({ status: "ok", faculty: updated });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ status: "invalid", error: "Missing faculty id." }, { status: 400 });
  }
  await deletePerson(id);
  await recordAudit({ action: "delete", entity: "faculty", entityId: String(id) });
  return NextResponse.json({ status: "ok" });
}
