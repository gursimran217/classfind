import { NextResponse } from "next/server";
import { facultyForSection, slotsForSection } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const section = (searchParams.get("section") ?? "").trim().toUpperCase();
  if (!section) {
    return NextResponse.json({ coordinator: null, faculty: [], timetable: [] });
  }
  const [{ coordinator, faculty }, timetable] = await Promise.all([
    facultyForSection(section),
    slotsForSection(section),
  ]);
  return NextResponse.json({ coordinator, faculty, timetable });
}
