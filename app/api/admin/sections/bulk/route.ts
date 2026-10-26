import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { bulkAssignRooms, recordAudit } from "@/lib/db";

export const runtime = "nodejs";

interface Item {
  sectionCode: string;
  roomNumber?: string | null;
  floor?: number | null;
  building?: string | null;
}

/**
 * Bulk room assignment. Two modes:
 *  - items: explicit list of { sectionCode, roomNumber, floor, building }
 *  - sequence: assign consecutive room numbers across a list of section codes
 *    starting at roomStart on the given floor/building.
 */
export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  let items: Item[] = [];
  if (Array.isArray(body.items) && body.items.length) {
    items = body.items
      .map((r: Record<string, unknown>) => ({
        sectionCode: String(r.sectionCode ?? "").trim().toUpperCase(),
        roomNumber: r.roomNumber === undefined || r.roomNumber === null ? null : String(r.roomNumber).trim(),
        floor: Number.isFinite(Number(r.floor)) ? Number(r.floor) : null,
        building: r.building === undefined ? null : String(r.building ?? "").trim(),
      }))
      .filter((r: Item) => r.sectionCode);
  } else if (Array.isArray(body.codes) && body.codes.length) {
    const floor = Number.isFinite(Number(body.floor)) ? Number(body.floor) : null;
    const building = body.building ? String(body.building).trim() : "AB1";
    const start = Number(body.roomStart);
    if (!Number.isFinite(start)) {
      return NextResponse.json({ status: "invalid", error: "roomStart is required in sequence mode." }, { status: 400 });
    }
    items = body.codes.map((code: unknown, i: number) => ({
      sectionCode: String(code).trim().toUpperCase(),
      roomNumber: String(start + i),
      floor,
      building,
    }));
  }

  if (!items.length) {
    return NextResponse.json({ status: "invalid", error: "Nothing to assign." }, { status: 400 });
  }

  const updated = await bulkAssignRooms(items);
  await recordAudit({
    action: "bulk-update",
    entity: "section",
    entityId: null,
    detail: { count: updated, sample: items.slice(0, 4).map((i) => `${i.sectionCode}=${i.roomNumber}`) },
  });
  return NextResponse.json({ status: "ok", updated });
}
