import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { listAudit, auditCount } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 60) || 60, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const [events, total] = await Promise.all([listAudit(limit, offset), auditCount()]);
  return NextResponse.json({ status: "ok", events, total, limit, offset });
}
