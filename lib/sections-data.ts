/**
 * Section → classroom mapping configuration.
 *
 * This is the configurable "data layer" that admins can correct from the
 * admin panel without touching application code. Values marked with
 * `mappingStatus: "inferred_seed"` are prototype seed data, NOT official
 * 2026-27 allocations.
 *
 * Sources:
 *  - user_confirmed : current student confirmed their own class
 *  - research_seed  : observed in a GL Bajaj B.Tech I Year 2025-26 schedule
 *  - inferred_seed  : sequential prototype fill so no section has a null room
 */

export type MappingStatus = "user_confirmed" | "research_seed" | "inferred_seed" | "admin_verified";

export interface SectionMapping {
  sectionCode: string;
  roomNumber: string;
  floor: number;
  building: string;
  campus: string;
  mappingStatus: MappingStatus;
  sourceNote: string;
}

export const CAMPUS_NAME = "GL Bajaj Institute of Technology & Management, Greater Noida";
export const DEFAULT_BUILDING = "Academic Block-1";

const researchNote =
  "Observed in a GL Bajaj B.Tech I Year 2025-26 remedial-class schedule (not an official 2026-27 allocation).";

const inferredNote =
  "Prototype seed — no public room assignment found. Sequential fill; verify from the official timetable.";

const b1 = DEFAULT_BUILDING;
const campus = CAMPUS_NAME;

function g1(code: string, room: string, status: MappingStatus, note: string): SectionMapping {
  return { sectionCode: code, roomNumber: room, floor: 4, building: b1, campus, mappingStatus: status, sourceNote: note };
}

function g2(code: string, room: string, floor: number, status: MappingStatus, note: string): SectionMapping {
  return { sectionCode: code, roomNumber: room, floor, building: b1, campus, mappingStatus: status, sourceNote: note };
}

export const SECTION_MAPPINGS: SectionMapping[] = [
  // ---- GROUP 1 — 4th Floor, Academic Block-1 ----
  g1("G1A", "401", "inferred_seed", inferredNote),
  g1("G1B", "402", "inferred_seed", inferredNote),
  g1("G1C", "403", "inferred_seed", inferredNote),
  g1("G1D", "404", "inferred_seed", inferredNote),
  g1("G1E", "405", "inferred_seed", inferredNote),
  g1("G1F", "406", "inferred_seed", inferredNote),
  g1("G1G", "408", "inferred_seed", inferredNote),
  g1("G1H", "412", "research_seed", researchNote),
  g1(
    "G1I",
    "416",
    "user_confirmed",
    "Current student-confirmed mapping; research also found G1I(416) in the 2025-26 first-year schedule.",
  ),
  g1("G1J", "417", "research_seed", researchNote),
  g1("G1K", "418", "research_seed", researchNote),
  g1("G1L", "422", "research_seed", researchNote),
  g1("G1M", "423", "research_seed", researchNote),
  g1("G1N", "426", "inferred_seed", inferredNote),
  g1("G1O", "424", "research_seed", researchNote),
  g1("G1P", "425", "research_seed", researchNote),
  g1("G1Q", "427", "research_seed", researchNote),
  g1("G1R", "428", "inferred_seed", inferredNote),
  g1("G1S", "429", "inferred_seed", inferredNote),
  g1("G1T", "430", "inferred_seed", inferredNote),
  g1("G1U", "431", "inferred_seed", inferredNote),
  g1("G1V", "432", "inferred_seed", inferredNote),
  g1("G1W", "433", "inferred_seed", inferredNote),

  // ---- GROUP 2 — Academic Block-1 ----
  g2("G2A", "307", 3, "research_seed", researchNote),
  g2("G2B", "312", 3, "research_seed", researchNote),
  g2("G2C", "313", 3, "research_seed", researchNote),
  g2("G2D", "314", 3, "research_seed", researchNote),
  g2("G2E", "318", 3, "research_seed", researchNote),
  g2("G2F", "319", 3, "research_seed", researchNote),
  g2("G2G", "320", 3, "research_seed", researchNote),
  g2("G2H", "321", 3, "research_seed", researchNote),
  g2("G2I", "324", 3, "research_seed", researchNote),
  g2("G2J", "224", 2, "research_seed", researchNote),
  g2("G2K", "225", 2, "research_seed", researchNote),
  g2("G2L", "226", 2, "research_seed", researchNote),
  g2("G2M", "227", 2, "inferred_seed", inferredNote),
  g2("G2N", "228", 2, "inferred_seed", inferredNote),
  g2("G2O", "229", 2, "inferred_seed", inferredNote),
  g2("G2P", "222", 2, "research_seed", researchNote),
  g2("G2Q", "302", 3, "research_seed", researchNote),
  g2("G2R", "305", 3, "research_seed", researchNote),
  g2("G2S", "306", 3, "research_seed", researchNote),
  g2("G2T", "303", 3, "research_seed", researchNote),
  g2("G2U", "308", 3, "inferred_seed", inferredNote),
  g2("G2V", "309", 3, "inferred_seed", inferredNote),
  g2("G2W", "310", 3, "inferred_seed", inferredNote),
];

export const SECTION_MAP: Record<string, SectionMapping> = Object.fromEntries(
  SECTION_MAPPINGS.map((s) => [s.sectionCode, s]),
);

export function floorLabel(floor: number): string {
  const n = Number(floor);
  if (!Number.isFinite(n)) return "";
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix} Floor`;
}