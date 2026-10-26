/** Human-friendly labels for the program codes found in the workbook. */
const PROGRAM_LABELS: Record<string, string> = {
  "B.TECH.(CSAI)": "B.Tech CSE (AI)",
  "B.TECH.(CSAIML)": "B.Tech CSE (AI & ML)",
  "B.TECH.(CSDS)": "B.Tech CSE (Data Science)",
  "B.TECH.(CSE)": "B.Tech CSE",
  "B.TECH.(CSH)": "B.Tech CSE (Hindi)",
  "B.TECH.(CSIT)": "B.Tech CSE (IT)",
  "B.TECH.(EC)": "B.Tech Electronics & Communication",
  "B.TECH.(ELC)": "B.Tech Electrical & Computer",
  "B.TECH.(ME)": "B.Tech Mechanical",
};

export function formatProgram(code: string): string {
  if (!code) return "";
  const clean = code.trim().toUpperCase();
  return PROGRAM_LABELS[clean] ?? clean.replace(/^B\.TECH\.\(/, "B.Tech ").replace(/\)$/, "");
}

/** Short code shown inside the result, e.g. "CSDS". */
export function programShort(code: string): string {
  const m = code.match(/^B\.TECH\.\(([^)]+)\)$/i);
  return m ? m[1] : code;
}