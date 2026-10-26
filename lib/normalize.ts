/**
 * Normalization helpers for student identity matching.
 * Shared by the verify API and the import pipeline.
 */

const DIACRITICS = /[\u0300-\u036f]/g;
const WS = /\s+/g;

/** Lowercase, strip diacritics, trim, collapse internal whitespace. */
export function normalizeName(raw: string): string {
  return (
    (raw || "")
      .normalize("NFKD")
      .replace(DIACRITICS, "")
      .toLowerCase()
      .replace(WS, " ")
      .trim()
  );
}

/** Collapse whitespace, preserve display casing. */
export function cleanName(raw: string): string {
  return (raw || "").replace(WS, " ").trim();
}

/**
 * Normalize an Indian mobile number to a bare 10-digit string.
 * Handles +91 / 91 / leading 0 / embedded spaces & dashes.
 * Returns "" for anything that is not a valid 10-digit number.
 */
export function normalizePhone(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length > 10 && digits.endsWith(digits.slice(-10)) && digits.startsWith("91")) {
    return digits.slice(-10);
  }
  if (digits.length === 10) return digits;
  return "";
}

/** Format a 10-digit number for display, e.g. "92587 05104". */
export function formatPhone(mobile10: string): string {
  if (!mobile10 || mobile10.length !== 10) return mobile10;
  return `${mobile10.slice(0, 5)} ${mobile10.slice(5)}`;
}