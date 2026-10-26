import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { sectionsCoverage, listStudents } from "@/lib/db";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly; CRLF per RFC 4180.
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "sections").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  let csv = "";
  let filename = `classfind-${kind}-${stamp}.csv`;

  if (kind === "students") {
    const all = await listStudents({ limit: 200, offset: 0 });
    csv = toCsv(
      ["section", "rollNumber", "name", "mobile", "program"],
      all.map((s) => [s.section, s.rollNumber, s.name, s.mobile, s.program]),
    );
  } else if (kind === "sections") {
    const rows = await sectionsCoverage();
    csv = toCsv(
      ["sectionCode", "roomNumber", "floor", "building", "mappingStatus", "active", "students", "hasInviteLink", "groupCreated"],
      rows.map((r) => [
        r.sectionCode,
        r.roomNumber,
        r.floor,
        r.building,
        r.mappingStatus,
        r.active ? "yes" : "no",
        r.students,
        r.hasLink ? "yes" : "no",
        r.groupCreated ? "yes" : "no",
      ]),
    );
  } else {
    return NextResponse.json({ status: "invalid", error: "Unknown export kind." }, { status: 400 });
  }

  filename = `classfind-${kind}-${stamp}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
