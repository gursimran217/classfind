import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { parseWorkbook } from "@/lib/importer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ status: "invalid", error: "Attach an .xlsx file." }, { status: 400 });
  }

  const name = file.name || "upload.xlsx";
  if (!name.toLowerCase().endsWith(".xlsx") && !name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json(
      { status: "invalid", error: "Please upload an Excel workbook (.xlsx / .xls)." },
      { status: 400 },
    );
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    return NextResponse.json({ status: "invalid", error: "The uploaded file is empty." }, { status: 400 });
  }

  try {
    const stats = await parseWorkbook(buffer);
    return NextResponse.json({ status: "ok", stats });
  } catch (e) {
    console.error("Import failed", e);
    return NextResponse.json(
      { status: "error", error: "Could not read that workbook. Is it a valid Excel file?" },
      { status: 400 },
    );
  }
}