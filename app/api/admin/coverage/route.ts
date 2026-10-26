import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { sectionsCoverage } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Per-section coverage, grouped for the interactive block map: rooms, student
 * counts, and whether the section has a live WhatsApp invite.
 */
export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const rows = await sectionsCoverage();

  const byBuilding = new Map<string, Map<number, typeof rows>>();
  for (const r of rows) {
    const building = r.building || "Unassigned";
    const floor = Number.isFinite(r.floor as number) ? (r.floor as number) : 0;
    if (!byBuilding.has(building)) byBuilding.set(building, new Map());
    const floors = byBuilding.get(building)!;
    if (!floors.has(floor)) floors.set(floor, []);
    floors.get(floor)!.push(r);
  }

  const buildings = [...byBuilding.entries()].map(([building, floors]) => ({
    building,
    floors: [...floors.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([floor, sections]) => ({
        floor,
        sections: sections.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode)),
        students: sections.reduce((n, s) => n + s.students, 0),
        mapped: sections.filter((s) => s.roomNumber).length,
        linked: sections.filter((s) => s.hasLink).length,
      })),
  }));

  return NextResponse.json({
    status: "ok",
    totals: {
      sections: rows.length,
      mapped: rows.filter((r) => r.roomNumber).length,
      linked: rows.filter((r) => r.hasLink).length,
      students: rows.reduce((n, r) => n + r.students, 0),
    },
    buildings,
    sections: rows,
  });
}
