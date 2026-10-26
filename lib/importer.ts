import "server-only";
import * as XLSX from "xlsx";
import { clearStudents, insertStudentBatch, ensureSectionsAndGroups, setMeta, snapshotStudents } from "./db";
import { normalizeName, normalizePhone, cleanName } from "./normalize";

export interface ImportStats {
  recordsRead: number;
  validExported: number;
  invalidMobile: number;
  duplicatePairs: number;
  missingSection: number;
  sections: string[];
}

interface RawRecord {
  name: string;
  mobile: string;
  program: string;
  section: string;
  rollNumber: string;
}

function normHeader(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Locate the header row and column index map for a sheet. */
function detectColumns(sheet: XLSX.WorkSheet): { startRow: number; col: Record<string, number> } | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const maxCol = Math.min(range.e.c, 30);
  for (let r = range.s.r; r <= Math.min(range.e.r, 8); r++) {
    const col: Record<string, number> = {};
    for (let c = 0; c <= maxCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const h = normHeader(cell.v);
      if (h) col[h] = c;
    }
    if (col["student name"] !== undefined && col["mobile"] !== undefined && col["sec"] !== undefined) {
      return { startRow: r + 1, col };
    }
  }
  return null;
}

function extractSheet(sheet: XLSX.WorkSheet, col: Record<string, number>): RawRecord[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  const out: RawRecord[] = [];
  const idx = (key: string) => col[key];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const name = cleanName(String(row[idx("student name")] ?? ""));
    if (!name) continue;
    out.push({
      name,
      mobile: String(row[idx("mobile")] ?? ""),
      program: String(row[idx("program")] ?? "").toUpperCase(),
      section: String(row[idx("sec")] ?? "").trim().toUpperCase(),
      rollNumber: String(row[idx("sec roll no")] ?? "").trim(),
    });
  }
  return out;
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ImportStats> {
  const wb = XLSX.read(buffer, { type: "array" });

  let raw: RawRecord[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const detected = detectColumns(sheet);
    if (!detected) continue;
    raw = raw.concat(extractSheet(sheet, detected.col));
  }

  // ---- validate ---------------------------------------------------------
  const seen = new Set<string>();
  const valid: Array<Pick<RawRecord, "name" | "mobile" | "program" | "section" | "rollNumber">> = [];
  let invalidMobile = 0;
  let duplicatePairs = 0;
  let missingSection = 0;

  for (const r of raw) {
    const m = normalizePhone(r.mobile);
    if (!m) {
      invalidMobile++;
      continue;
    }
    if (!r.section) missingSection++;
    const key = `${m}:${r.name.toLowerCase()}`;
    if (seen.has(key)) duplicatePairs++;
    else seen.add(key);
    valid.push({ name: r.name, mobile: m, program: r.program, section: r.section, rollNumber: r.rollNumber });
  }

  const sections = Array.from(new Set(valid.map((r) => r.section).filter(Boolean))).sort();

  // Snapshot before wiping: an import is a full replace, so keep a way back.
  const backedUp = await snapshotStudents();
  await clearStudents();
  await insertStudentBatch(valid);
  await ensureSectionsAndGroups();

  const stats: ImportStats = {
    recordsRead: raw.length,
    validExported: valid.length,
    invalidMobile,
    duplicatePairs,
    missingSection,
    sections,
  };
  await setMeta("last_import", JSON.stringify({ ...stats, backedUp, at: new Date().toISOString() }));
  return stats;
}