import "server-only";
import path from "node:path";
import fs from "node:fs";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SECTION_MAPPINGS } from "./sections-data";
import { normalizeName, normalizePhone } from "./normalize";
import seedStudents from "@/data/seed/students.generated.json";
import seedTimetable from "@/data/seed/timetable.generated.json";

export interface StudentRow {
  id: number;
  name: string;
  mobile: string;
  program: string;
  section: string;
  rollNumber: string;
}

export interface SectionRow {
  sectionCode: string;
  roomNumber: string | null;
  floor: number | null;
  building: string | null;
  campus: string | null;
  mappingStatus: string | null;
  sourceNote: string | null;
  active: number;
}

export interface GroupRow {
  sectionCode: string;
  groupName: string;
  inviteLink: string | null;
  status: string;
  requireApproval: number;
  created: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InviteDelivery {
  id: number;
  mobile10: string;
  sectionCode: string;
  groupName: string | null;
  method: string;
  status: string;
  deliveredAt: string;
}

// ---- backend abstraction -----------------------------------------------

interface Statement {
  all(...params: unknown[]): Promise<Record<string, unknown>[]>;
  get(...params: unknown[]): Promise<Record<string, unknown> | null>;
  run(...params: unknown[]): Promise<{ meta?: { changes?: number } }>;
}

interface Backend {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  batch(ops: Array<{ sql: string; params: unknown[] }>): Promise<void>;
}

/** Local (Node) backend backed by node:sqlite. */
function nodeBackend(): Backend {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const dbPath = (() => {
    if (process.env.CLASSFIND_DB_PATH) return process.env.CLASSFIND_DB_PATH;
    try {
      fs.accessSync(path.join(process.cwd(), "."), fs.constants.W_OK);
      return path.join(process.cwd(), "classfind.db");
    } catch {
      return path.join(process.env.TMPDIR || "/tmp", "classfind.db");
    }
  })();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const p = (a: unknown[]) => a as never[];
      return {
        all: async (...a) => stmt.all(...p(a)) as Record<string, unknown>[],
        get: async (...a) => (stmt.get(...p(a)) as Record<string, unknown> | undefined) ?? null,
        run: async (...a) => {
          stmt.run(...p(a));
          return {};
        },
      };
    },
    exec: async (sql) => db.exec(sql),
    batch: async (ops) => {
      db.exec("BEGIN");
      try {
        for (const op of ops) db.prepare(op.sql).run(...(op.params as never[]));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

/** Cloudflare D1 backend. */
function d1Backend(d1: unknown): Backend {
  const db = d1 as {
    prepare(sql: string): {
      bind(...p: unknown[]): {
        all(): Promise<{ results: Record<string, unknown>[] }>;
        first(): Promise<Record<string, unknown> | null>;
        run(): Promise<unknown>;
      };
      all(): Promise<{ results: Record<string, unknown>[] }>;
      first(): Promise<Record<string, unknown> | null>;
      run(): Promise<unknown>;
    };
    exec(sql: string): Promise<unknown>;
    batch(stmts: Array<{ run(): Promise<unknown> }>): Promise<unknown>;
  };
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        all: async (...p) => (p.length ? (await stmt.bind(...p).all()).results : (await stmt.all()).results),
        get: async (...p) => (p.length ? await stmt.bind(...p).first() : await stmt.first()),
        run: async (...p) => {
          if (p.length) await stmt.bind(...p).run();
          else await stmt.run();
          return {};
        },
      };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
    batch: async (ops) => {
      await db.batch(ops.map((op) => db.prepare(op.sql).bind(...op.params)));
    },
  };
}

async function getBackend(): Promise<Backend> {
  // Cloudflare Workers exposes navigator.userAgent === "Cloudflare-Workers".
  const isCloudflare =
    typeof navigator !== "undefined" && (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers";
  if (isCloudflare) {
    const ctx = await getCloudflareContext({ async: true });
    const env = (ctx.env ?? {}) as { classfind_db?: unknown };
    if (env.classfind_db) return d1Backend(env.classfind_db);
  }
  return nodeBackend();
}

// ---- schema + seeding ----------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  mobile10 TEXT NOT NULL,
  program TEXT NOT NULL,
  section TEXT NOT NULL,
  rollNumber TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_mobile ON students(mobile10);
CREATE INDEX IF NOT EXISTS idx_students_name_mobile ON students(name_norm, mobile10);
CREATE INDEX IF NOT EXISTS idx_students_section ON students(section);

CREATE TABLE IF NOT EXISTS sections (
  sectionCode TEXT PRIMARY KEY,
  roomNumber TEXT,
  floor INTEGER,
  building TEXT,
  campus TEXT,
  mappingStatus TEXT,
  sourceNote TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS whatsapp_groups (
  sectionCode TEXT PRIMARY KEY,
  groupName TEXT NOT NULL,
  inviteLink TEXT,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  requireApproval INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS invite_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile10 TEXT NOT NULL,
  sectionCode TEXT NOT NULL,
  groupName TEXT,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  deliveredAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile10 TEXT NOT NULL,
  section TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT,
  role TEXT NOT NULL DEFAULT 'faculty',
  name TEXT NOT NULL,
  subject TEXT,
  mobile TEXT,
  photo TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_faculty_section ON faculty(section);
CREATE INDEX IF NOT EXISTS idx_faculty_role ON faculty(role);

-- A teaching assignment: one person teaches one subject in one section.
-- This is the source of truth for "who teaches this section". A teacher who
-- covers ten sections is one faculty row with ten teaching rows.
CREATE TABLE IF NOT EXISTS teaching (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faculty_id INTEGER NOT NULL,
  section TEXT NOT NULL,
  subject TEXT,
  subject_code TEXT,
  role TEXT NOT NULL DEFAULT 'subject',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_teaching_section ON teaching(section);
CREATE INDEX IF NOT EXISTS idx_teaching_faculty ON teaching(faculty_id);

-- Weekly timetable: one row per section/day/period. A period can carry two
-- rows when the section splits into lab groups (T1/T2), hence the grp column
-- and a non-unique index rather than one row per cell.
CREATE TABLE IF NOT EXISTS timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  day INTEGER NOT NULL,
  period INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  subject TEXT,
  subject_code TEXT,
  faculty_id INTEGER,
  room TEXT,
  grp TEXT,
  kind TEXT NOT NULL DEFAULT 'lecture',
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_slot_section_day ON timetable_slots(section, day, period);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entityId TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entityId);

-- Rolling snapshot taken before every student import, so a bad sheet is
-- recoverable. Only the most recent few are kept.
CREATE TABLE IF NOT EXISTS students_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  takenAt TEXT NOT NULL,
  count INTEGER NOT NULL,
  data TEXT NOT NULL
);
`;

async function ensureColumn(db: Backend, table: string, column: string, decl: string) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`).run();
  } catch {
    /* column already exists */
  }
}

/** Collapse the legacy one-row-per-(person,section) faculty shape into
 *  people + teaching assignments. Idempotent, guarded by a meta flag. */
async function migrateFacultyModel(db: Backend) {
  await ensureColumn(db, "faculty", "kind", "TEXT NOT NULL DEFAULT 'faculty'");
  await ensureColumn(db, "faculty", "email", "TEXT");
  await ensureColumn(db, "faculty", "name_norm", "TEXT");

  const flag = await db.prepare("SELECT value FROM meta WHERE key = 'faculty_model_v2'").get();
  if (flag?.value) return;

  const legacy = (await db
    .prepare("SELECT id, section, role, name, subject, mobile, photo, sortOrder, active FROM faculty ORDER BY id")
    .all()) as Array<Record<string, unknown>>;

  if (legacy.length) {
    const now = new Date().toISOString();
    const people = new Map<
      string,
      { id: number; name: string; mobile: string | null; photo: string | null; kind: string; sortOrder: number; active: number }
    >();
    const assignments: Array<{ key: string; section: string; subject: string | null; role: string; sortOrder: number }> = [];

    for (const r of legacy) {
      const name = String(r.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let p = people.get(key);
      if (!p) {
        p = {
          id: Number(r.id),
          name,
          mobile: (r.mobile as string) ?? null,
          photo: (r.photo as string) ?? null,
          kind: String(r.role ?? "faculty") === "coordinator" ? "coordinator" : "faculty",
          sortOrder: Number(r.sortOrder ?? 0),
          active: Number(r.active ?? 1),
        };
        people.set(key, p);
      } else {
        if (!p.mobile && r.mobile) p.mobile = r.mobile as string;
        if (!p.photo && r.photo) p.photo = r.photo as string;
        if (String(r.role) === "coordinator") p.kind = "coordinator";
      }
      const section = String(r.section ?? "").trim();
      if (section) {
        assignments.push({
          key,
          section: section.toUpperCase(),
          subject: (r.subject as string) ?? null,
          role: String(r.role) === "coordinator" ? "coordinator" : "subject",
          sortOrder: Number(r.sortOrder ?? 0),
        });
      }
    }

    await db.prepare("DELETE FROM faculty").run();
    for (const p of people.values()) {
      await db
        .prepare(
          "INSERT INTO faculty (id, section, role, name, subject, mobile, photo, sortOrder, active, updatedAt, kind, email, name_norm) VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)",
        )
        .run(
          p.id,
          p.kind === "coordinator" ? "coordinator" : "faculty",
          p.name,
          p.mobile,
          p.photo,
          p.sortOrder,
          p.active,
          now,
          p.kind,
          normalizeName(p.name),
        );
    }
    const idByKey = new Map<string, number>();
    for (const [k, p] of people) idByKey.set(k, p.id);
    for (const a of assignments) {
      const fid = idByKey.get(a.key);
      if (!fid) continue;
      await db
        .prepare(
          "INSERT INTO teaching (faculty_id, section, subject, subject_code, role, sortOrder, updatedAt) VALUES (?, ?, ?, NULL, ?, ?, ?)",
        )
        .run(fid, a.section, a.subject, a.role, a.sortOrder, now);
    }
  }

  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('faculty_model_v2', '1')").run();
}

async function initDb(): Promise<Backend> {
  const db = await getBackend();
  // Execute each schema statement individually via prepare().run() (D1's exec()
  // requires trailing semicolons and rejects multi-statement strings).
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
  await migrateFacultyModel(db);
  await seedIfEmpty(db);
  await seedTimetableIfEmpty(db);
  return db;
}

let dbPromise: Promise<Backend> | null = null;

export function getDb(): Promise<Backend> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function batchChunked(db: Backend, ops: Array<{ sql: string; params: unknown[] }>, chunkSize = 80) {
  for (let i = 0; i < ops.length; i += chunkSize) {
    await db.batch(ops.slice(i, i + chunkSize));
  }
}

async function seedIfEmpty(db: Backend) {
  const count = await db.prepare("SELECT COUNT(*) AS c FROM students").get();
  if ((count?.c as number) > 0) {
    await ensureSections(db);
    await ensureGroups(db);
    return;
  }

  const seed = seedStudents as Array<{
    name: string;
    mobile: string;
    program: string;
    section: string;
    rollNumber: string;
  }>;
  const ops: Array<{ sql: string; params: unknown[] }> = [];
  for (const s of seed) {
    const m = normalizePhone(s.mobile);
    if (!m || !s.name) continue;
    ops.push({
      sql: "INSERT OR IGNORE INTO students (name, name_norm, mobile10, program, section, rollNumber) VALUES (?, ?, ?, ?, ?, ?)",
      params: [s.name, normalizeName(s.name), m, s.program || "", s.section || "", s.rollNumber || ""],
    });
  }
  if (ops.length) await batchChunked(db, ops);

  await ensureSections(db);
  await ensureGroups(db);
}

/** Seed / refresh the timetable from the parser output.
 *  Bump SEED_VERSION whenever the generated JSON changes so an existing
 *  database picks up the corrected rows instead of keeping stale ones. */
const TIMETABLE_SEED_VERSION = "3";

async function seedTimetableIfEmpty(db: Backend) {
  const t = seedTimetable as {
    section: string | null;
    room: string | null;
    slots: Array<{
      day: number;
      period: number;
      start: string;
      end: string;
      subject: string;
      code: string;
      kind: string;
      group: string | null;
    }>;
  };
  if (!t?.section || !Array.isArray(t.slots) || !t.slots.length) return;

  const v = await db.prepare("SELECT value FROM meta WHERE key = 'timetable_seed_version'").get();
  const count = await db
    .prepare("SELECT COUNT(*) AS c FROM timetable_slots WHERE section = ?")
    .get(t.section);
  if (v?.value === TIMETABLE_SEED_VERSION && ((count?.c as number) ?? 0) > 0) return;

  await db.prepare("DELETE FROM timetable_slots WHERE section = ?").run(t.section);
  const now = new Date().toISOString();
  const ops = t.slots.map((s) => ({
    sql: "INSERT INTO timetable_slots (section, day, period, start_time, end_time, subject, subject_code, faculty_id, room, grp, kind, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
    params: [
      t.section,
      s.day,
      s.period,
      s.start,
      s.end,
      s.subject,
      s.code,
      t.room,
      s.group ?? null,
      s.kind ?? "lecture",
      now,
    ],
  }));
  if (ops.length) await batchChunked(db, ops);
  await db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('timetable_seed_version', ?)")
    .run(TIMETABLE_SEED_VERSION);
}

async function ensureSections(db: Backend) {
  const ops = SECTION_MAPPINGS.map((s) => ({
    sql: "INSERT OR IGNORE INTO sections (sectionCode, roomNumber, floor, building, campus, mappingStatus, sourceNote, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    params: [s.sectionCode, s.roomNumber, s.floor, s.building, s.campus, s.mappingStatus, s.sourceNote],
  }));
  if (ops.length) await db.batch(ops);
}

async function ensureGroups(db: Backend) {
  const rows = (await db.prepare("SELECT sectionCode FROM sections").all()) as Array<{ sectionCode: string }>;
  const now = new Date().toISOString();
  const ops = rows.map(({ sectionCode }) => ({
    sql: "INSERT OR IGNORE INTO whatsapp_groups (sectionCode, groupName, inviteLink, status, requireApproval, created, createdAt, updatedAt) VALUES (?, ?, NULL, 'unconfigured', 1, 0, ?, ?)",
    params: [sectionCode, `GL Bajaj — ${sectionCode} Official`, now, now],
  }));
  if (ops.length) await db.batch(ops);
}

export async function ensureSectionsAndGroups() {
  const db = await getDb();
  await ensureSections(db);
  await ensureGroups(db);
}

// ---- queries -------------------------------------------------------------

export async function findStudentByNameAndPhone(name: string, phone: string): Promise<StudentRow[]> {
  const db = await getDb();
  const m = normalizePhone(phone);
  const n = normalizeName(name);
  if (!m || !n) return [];
  return (await db
    .prepare(
      "SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students WHERE mobile10 = ? AND name_norm = ? LIMIT 5",
    )
    .all(m, n)) as unknown as StudentRow[];
}

export async function findStudentByMobile(phone: string): Promise<StudentRow[]> {
  const db = await getDb();
  const m = normalizePhone(phone);
  if (!m) return [];
  return (await db
    .prepare("SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students WHERE mobile10 = ? LIMIT 5")
    .all(m)) as unknown as StudentRow[];
}

export async function getSection(sectionCode: string): Promise<SectionRow | null> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT sectionCode, roomNumber, floor, building, campus, mappingStatus, sourceNote, active FROM sections WHERE sectionCode = ?",
    )
    .get(sectionCode)) as unknown as SectionRow | null;
}

export async function getGroup(sectionCode: string): Promise<GroupRow | null> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT sectionCode, groupName, inviteLink, status, requireApproval, created, createdAt, updatedAt FROM whatsapp_groups WHERE sectionCode = ?",
    )
    .get(sectionCode)) as unknown as GroupRow | null;
}

export async function studentCount(): Promise<number> {
  const db = await getDb();
  const r = await db.prepare("SELECT COUNT(*) AS c FROM students").get();
  return (r?.c as number) ?? 0;
}

export async function sectionCount(): Promise<number> {
  const db = await getDb();
  const r = await db.prepare("SELECT COUNT(*) AS c FROM sections").get();
  return (r?.c as number) ?? 0;
}

export async function allSections(): Promise<SectionRow[]> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT sectionCode, roomNumber, floor, building, campus, mappingStatus, sourceNote, active FROM sections ORDER BY sectionCode",
    )
    .all()) as unknown as SectionRow[];
}

export async function allGroups(): Promise<GroupRow[]> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT sectionCode, groupName, inviteLink, status, requireApproval, created, createdAt, updatedAt FROM whatsapp_groups ORDER BY sectionCode",
    )
    .all()) as unknown as GroupRow[];
}

export interface FacultyRow {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  photo: string | null;
  kind: string;
  active: number;
  sortOrder: number;
  updatedAt: string | null;
  /** subjects / sections this person covers, across every section */
  subjects?: string[];
  sections?: string[];
}

export interface TeachingRow {
  id: number;
  facultyId: number;
  section: string;
  subject: string | null;
  subjectCode: string | null;
  role: string;
  sortOrder: number;
}

/** A teacher as seen from one section: their subjects there and their role. */
export interface TeacherForSection {
  id: number;
  name: string;
  section: string;
  subject: string | null;
  subjects: string[];
  role: string;
  mobile: string | null;
  email: string | null;
  photo: string | null;
  kind: string;
}

const PERSON_COLS = "id, name, mobile, email, photo, kind, active, sortOrder, updatedAt";

function addTo(map: Map<number, Set<string>>, key: number, value: string) {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(value);
}

export async function listPeople(): Promise<FacultyRow[]> {
  const db = await getDb();
  const people = (await db
    .prepare(`SELECT ${PERSON_COLS} FROM faculty ORDER BY kind, sortOrder, name`)
    .all()) as unknown as FacultyRow[];
  if (!people.length) return people;

  const rows = (await db
    .prepare("SELECT faculty_id, section, subject FROM teaching")
    .all()) as unknown as Array<{ faculty_id: number; section: string; subject: string | null }>;
  const subjects = new Map<number, Set<string>>();
  const sections = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.subject) addTo(subjects, r.faculty_id, r.subject);
    if (r.section) addTo(sections, r.faculty_id, r.section);
  }
  for (const p of people) {
    p.subjects = [...(subjects.get(p.id) ?? [])];
    p.sections = [...(sections.get(p.id) ?? [])].sort();
  }
  return people;
}

/** Everyone who teaches one section — the scoping rule lives here. */
export async function teachersForSection(sectionCode: string): Promise<TeacherForSection[]> {
  const db = await getDb();
  const section = sectionCode.trim().toUpperCase();
  if (!section) return [];
  const rows = (await db
    .prepare(
      `SELECT f.id AS id, f.name AS name, f.mobile AS mobile, f.email AS email, f.photo AS photo, f.kind AS kind,
              t.subject AS subject, t.role AS role, t.sortOrder AS sortOrder
       FROM teaching t JOIN faculty f ON f.id = t.faculty_id
       WHERE t.section = ? AND f.active = 1
       ORDER BY t.sortOrder, f.name`,
    )
    .all(section)) as unknown as Array<Record<string, unknown>>;

  const byPerson = new Map<number, TeacherForSection>();
  for (const r of rows) {
    const id = Number(r.id);
    let t = byPerson.get(id);
    if (!t) {
      t = {
        id,
        name: String(r.name),
        section,
        subject: null,
        subjects: [],
        role: "subject",
        mobile: (r.mobile as string) ?? null,
        email: (r.email as string) ?? null,
        photo: (r.photo as string) ?? null,
        kind: String(r.kind ?? "faculty"),
      };
      byPerson.set(id, t);
    }
    const subject = (r.subject as string) ?? null;
    if (subject && !t.subjects.includes(subject)) t.subjects.push(subject);
    if (!t.subject && subject) t.subject = subject;
    if (String(r.role) === "coordinator") t.role = "coordinator";
  }
  return [...byPerson.values()];
}

export async function facultyForSection(
  sectionCode: string,
): Promise<{ coordinator: TeacherForSection | null; faculty: TeacherForSection[] }> {
  const teachers = await teachersForSection(sectionCode);
  // The coordinator usually also teaches a subject in the same section, so they
  // belong BOTH on the coordinator card and in the subject deck. Only the
  // underlying record is shared — the row is never duplicated in the database.
  const coordinator = teachers.find((t) => t.role === "coordinator") ?? null;
  return { coordinator, faculty: teachers };
}

export async function createPerson(row: {
  name: string;
  mobile?: string;
  email?: string;
  photo?: string;
  kind?: string;
  sortOrder?: number;
  active?: number;
}): Promise<FacultyRow> {
  const db = await getDb();
  const now = new Date().toISOString();
  const name = row.name.trim();
  await db
    .prepare(
      "INSERT INTO faculty (section, role, name, subject, mobile, photo, sortOrder, active, updatedAt, kind, email, name_norm) VALUES (NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      row.kind ?? "faculty",
      name,
      (row.mobile ?? "").trim() || null,
      (row.photo ?? "").trim() || null,
      row.sortOrder ?? 0,
      row.active === undefined ? 1 : row.active,
      now,
      row.kind ?? "faculty",
      (row.email ?? "").trim() || null,
      normalizeName(name),
    );
  return (await db
    .prepare(`SELECT ${PERSON_COLS} FROM faculty WHERE id = (SELECT MAX(id) FROM faculty)`)
    .get()) as unknown as FacultyRow;
}

export async function updatePerson(
  id: number,
  patch: Partial<Pick<FacultyRow, "name" | "mobile" | "email" | "photo" | "kind" | "sortOrder" | "active">>,
): Promise<FacultyRow | null> {
  const db = await getDb();
  const current = (await db.prepare(`SELECT ${PERSON_COLS} FROM faculty WHERE id = ?`).get(id)) as unknown as FacultyRow | null;
  if (!current) return null;
  const name = patch.name !== undefined ? patch.name.trim() : current.name;
  await db
    .prepare("UPDATE faculty SET name = ?, name_norm = ?, mobile = ?, email = ?, photo = ?, kind = ?, sortOrder = ?, active = ?, updatedAt = ? WHERE id = ?")
    .run(
      name,
      normalizeName(name),
      patch.mobile !== undefined ? (patch.mobile ?? "").trim() || null : current.mobile,
      patch.email !== undefined ? (patch.email ?? "").trim() || null : current.email,
      patch.photo !== undefined ? (patch.photo ?? "").trim() || null : current.photo,
      patch.kind ?? current.kind,
      patch.sortOrder ?? current.sortOrder,
      patch.active ?? current.active,
      new Date().toISOString(),
      id,
    );
  return (await db.prepare(`SELECT ${PERSON_COLS} FROM faculty WHERE id = ?`).get(id)) as unknown as FacultyRow | null;
}

/** Removing a person also removes every assignment that referenced them. */
export async function deletePerson(id: number): Promise<boolean> {
  const db = await getDb();
  await db.prepare("DELETE FROM teaching WHERE faculty_id = ?").run(id);
  await db.prepare("DELETE FROM timetable_slots WHERE faculty_id = ?").run(id);
  const r = await db.prepare("DELETE FROM faculty WHERE id = ?").run(id);
  const changes =
    (r as unknown as { changes?: number }).changes ??
    (r as unknown as { meta?: { changes?: number } }).meta?.changes ??
    0;
  return changes > 0;
}

export async function listAssignments(section?: string): Promise<Array<TeachingRow & { name: string }>> {
  const db = await getDb();
  const s = (section ?? "").trim().toUpperCase();
  const sql = `SELECT t.id AS id, t.faculty_id AS facultyId, t.section AS section, t.subject AS subject,
                      t.subject_code AS subjectCode, t.role AS role, t.sortOrder AS sortOrder, f.name AS name
               FROM teaching t JOIN faculty f ON f.id = t.faculty_id
               ${s ? "WHERE t.section = ?" : ""}
               ORDER BY t.section, t.sortOrder, f.name`;
  return (await db.prepare(sql).all(...(s ? [s] : []))) as unknown as Array<TeachingRow & { name: string }>;
}

export async function createAssignment(row: {
  facultyId: number;
  section: string;
  subject?: string;
  subjectCode?: string;
  role?: string;
  sortOrder?: number;
}): Promise<TeachingRow | null> {
  const db = await getDb();
  const section = row.section.trim().toUpperCase();
  if (!section || !Number.isFinite(row.facultyId)) return null;
  await db
    .prepare(
      "INSERT INTO teaching (faculty_id, section, subject, subject_code, role, sortOrder, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      row.facultyId,
      section,
      (row.subject ?? "").trim() || null,
      (row.subjectCode ?? "").trim() || null,
      row.role ?? "subject",
      row.sortOrder ?? 0,
      new Date().toISOString(),
    );
  return (await db
    .prepare("SELECT id, faculty_id AS facultyId, section, subject, subject_code AS subjectCode, role, sortOrder FROM teaching WHERE id = (SELECT MAX(id) FROM teaching)")
    .get()) as unknown as TeachingRow | null;
}

export async function deleteAssignment(id: number): Promise<boolean> {
  const db = await getDb();
  const r = await db.prepare("DELETE FROM teaching WHERE id = ?").run(id);
  const changes =
    (r as unknown as { changes?: number }).changes ??
    (r as unknown as { meta?: { changes?: number } }).meta?.changes ??
    0;
  return changes > 0;
}

export async function sectionsForFaculty(facultyId: number): Promise<string[]> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT DISTINCT section FROM teaching WHERE faculty_id = ? ORDER BY section")
    .all(facultyId)) as unknown as Array<{ section: string }>;
  return rows.map((r) => r.section);
}

// ---- timetable ----------------------------------------------------------

export interface SlotRow {
  id: number;
  section: string;
  day: number;
  period: number;
  startTime: string | null;
  endTime: string | null;
  subject: string | null;
  subjectCode: string | null;
  facultyId: number | null;
  room: string | null;
  group: string | null;
  kind: string;
}

export async function slotsForSection(sectionCode: string): Promise<SlotRow[]> {
  const db = await getDb();
  const section = sectionCode.trim().toUpperCase();
  if (!section) return [];
  return (await db
    .prepare(
      "SELECT id, section, day, period, start_time AS startTime, end_time AS endTime, subject, subject_code AS subjectCode, faculty_id AS facultyId, room, grp AS \"group\", kind FROM timetable_slots WHERE section = ? ORDER BY day, period",
    )
    .all(section)) as unknown as SlotRow[];
}

/** Replace a section's whole week in one batch. */
export async function replaceSlotsForSection(
  sectionCode: string,
  slots: Array<Omit<SlotRow, "id" | "section">>,
): Promise<number> {
  const db = await getDb();
  const section = sectionCode.trim().toUpperCase();
  const now = new Date().toISOString();
  const ops: Array<{ sql: string; params: unknown[] }> = [
    { sql: "DELETE FROM timetable_slots WHERE section = ?", params: [section] },
  ];
  for (const s of slots) {
    ops.push({
      sql: "INSERT INTO timetable_slots (section, day, period, start_time, end_time, subject, subject_code, faculty_id, room, grp, kind, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        section,
        s.day,
        s.period,
        s.startTime ?? null,
        s.endTime ?? null,
        s.subject ?? null,
        s.subjectCode ?? null,
        s.facultyId ?? null,
        s.room ?? null,
        s.group ?? null,
        s.kind ?? "lecture",
        now,
      ],
    });
  }
  await batchChunked(db, ops);
  return slots.length;
}

export async function timetableSectionCount(): Promise<number> {
  const db = await getDb();
  const r = (await db.prepare("SELECT COUNT(DISTINCT section) AS c FROM timetable_slots").get()) as { c: number };
  return r?.c ?? 0;
}

export async function updateSection(
  sectionCode: string,
  data: Partial<Pick<SectionRow, "roomNumber" | "floor" | "building" | "mappingStatus" | "sourceNote" | "active">>,
) {
  const db = await getDb();
  const current = await getSection(sectionCode);
  if (!current) return;
  await db
    .prepare(
      "UPDATE sections SET roomNumber = ?, floor = ?, building = ?, mappingStatus = ?, sourceNote = ?, active = ? WHERE sectionCode = ?",
    )
    .run(
      data.roomNumber ?? current.roomNumber,
      data.floor ?? current.floor,
      data.building ?? current.building,
      data.mappingStatus ?? current.mappingStatus,
      data.sourceNote ?? current.sourceNote,
      data.active ?? current.active,
      sectionCode,
    );
}

export async function updateGroupLink(sectionCode: string, inviteLink: string | null) {
  const db = await getDb();
  const status = inviteLink ? "active" : "unconfigured";
  await db
    .prepare("UPDATE whatsapp_groups SET inviteLink = ?, status = ?, updatedAt = ? WHERE sectionCode = ?")
    .run(inviteLink, status, new Date().toISOString(), sectionCode);
}

export async function setGroupCreated(sectionCode: string, created: boolean) {
  const db = await getDb();
  await db
    .prepare("UPDATE whatsapp_groups SET created = ?, updatedAt = ? WHERE sectionCode = ?")
    .run(created ? 1 : 0, new Date().toISOString(), sectionCode);
}

export async function setGroupApproval(sectionCode: string, on: boolean) {
  const db = await getDb();
  await db
    .prepare("UPDATE whatsapp_groups SET requireApproval = ?, updatedAt = ? WHERE sectionCode = ?")
    .run(on ? 1 : 0, new Date().toISOString(), sectionCode);
}

export async function recordInviteDelivery(d: {
  mobile10: string;
  sectionCode: string;
  groupName: string | null;
  method: string;
  status: string;
}) {
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO invite_deliveries (mobile10, sectionCode, groupName, method, status, deliveredAt) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(d.mobile10, d.sectionCode, d.groupName, d.method, d.status, new Date().toISOString());
}

export async function listInviteDeliveries(limit = 25): Promise<InviteDelivery[]> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT id, mobile10, sectionCode, groupName, method, status, deliveredAt FROM invite_deliveries ORDER BY id DESC LIMIT ?",
    )
    .all(limit)) as unknown as InviteDelivery[];
}

export async function deliveriesCount(): Promise<number> {
  const db = await getDb();
  const r = await db.prepare("SELECT COUNT(*) AS c FROM invite_deliveries").get();
  return (r?.c as number) ?? 0;
}

export async function groupsCreatedCount(): Promise<number> {
  const db = await getDb();
  const r = await db.prepare("SELECT COUNT(*) AS c FROM whatsapp_groups WHERE created = 1").get();
  return (r?.c as number) ?? 0;
}

export async function clearStudents() {
  const db = await getDb();
  await db.prepare("DELETE FROM students").run();
}

/** Snapshot the current student list before a destructive import. */
export async function snapshotStudents(): Promise<number> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT name, mobile10, program, section, rollNumber FROM students")
    .all()) as unknown as Array<Record<string, unknown>>;
  if (!rows.length) return 0;
  await db
    .prepare("INSERT INTO students_backup (takenAt, count, data) VALUES (?, ?, ?)")
    .run(new Date().toISOString(), rows.length, JSON.stringify(rows));
  // keep the five most recent snapshots
  await db
    .prepare("DELETE FROM students_backup WHERE id NOT IN (SELECT id FROM students_backup ORDER BY id DESC LIMIT 5)")
    .run();
  return rows.length;
}

export async function listStudentBackups(): Promise<Array<{ id: number; takenAt: string; count: number }>> {
  const db = await getDb();
  return (await db
    .prepare("SELECT id, takenAt, count FROM students_backup ORDER BY id DESC")
    .all()) as unknown as Array<{ id: number; takenAt: string; count: number }>;
}

export async function insertStudentBatch(rows: Array<Pick<StudentRow, "name" | "mobile" | "program" | "section" | "rollNumber">>) {
  const db = await getDb();
  const ops: Array<{ sql: string; params: unknown[] }> = [];
  for (const r of rows) {
    const m = normalizePhone(r.mobile);
    if (!m || !r.name) continue;
    ops.push({
      sql: "INSERT OR IGNORE INTO students (name, name_norm, mobile10, program, section, rollNumber) VALUES (?, ?, ?, ?, ?, ?)",
      params: [r.name, normalizeName(r.name), m, r.program || "", r.section || "", r.rollNumber || ""],
    });
  }
  if (ops.length) await db.batch(ops);
}

export async function searchStudents(query: string, limit = 20): Promise<StudentRow[]> {
  const db = await getDb();
  const q = `%${normalizeName(query)}%`;
  return (await db
    .prepare(
      "SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students WHERE name_norm LIKE ? OR mobile10 LIKE ? OR section LIKE ? ORDER BY section, rollNumber LIMIT ?",
    )
    .all(q, q, q, limit)) as unknown as StudentRow[];
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return (r?.value as string | undefined) ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}

// ---- OTP ---------------------------------------------------------------

export interface OtpRow {
  id: number;
  mobile10: string;
  section: string;
  otp_hash: string;
  expires_at: number;
  attempts: number;
  consumed: number;
  created_at: string;
}

export async function createOtp(d: { mobile10: string; section: string; otpHash: string; expiresAt: number }) {
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO otps (mobile10, section, otp_hash, expires_at, attempts, consumed, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
    )
    .run(d.mobile10, d.section, d.otpHash, d.expiresAt, new Date().toISOString());
}

export async function getActiveOtp(mobile10: string): Promise<OtpRow | null> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT id, mobile10, section, otp_hash, expires_at, attempts, consumed, created_at FROM otps WHERE mobile10 = ? AND consumed = 0 ORDER BY id DESC LIMIT 1",
    )
    .get(mobile10)) as unknown as OtpRow | null;
}

export async function getActiveOtps(mobile10: string): Promise<OtpRow[]> {
  const db = await getDb();
  return (await db
    .prepare(
      "SELECT id, mobile10, section, otp_hash, expires_at, attempts, consumed, created_at FROM otps WHERE mobile10 = ? AND consumed = 0 ORDER BY id ASC LIMIT 10",
    )
    .all(mobile10)) as unknown as OtpRow[];
}

export async function consumeAllOtpsForMobile(mobile10: string) {
  const db = await getDb();
  await db.prepare("UPDATE otps SET consumed = 1 WHERE mobile10 = ? AND consumed = 0").run(mobile10);
}

export async function markOtpConsumed(id: number) {
  const db = await getDb();
  await db.prepare("UPDATE otps SET consumed = 1 WHERE id = ?").run(id);
}

export async function incrementOtpAttempts(id: number) {
  const db = await getDb();
  await db.prepare("UPDATE otps SET attempts = attempts + 1 WHERE id = ?").run(id);
}

export async function deleteExpiredOtps() {
  const db = await getDb();
  await db.prepare("DELETE FROM otps WHERE expires_at < ?").run(Date.now());
}

// ---- admin: audit trail --------------------------------------------------

export interface AuditRow {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
}

export async function recordAudit(d: { action: string; entity: string; entityId?: string | null; detail?: unknown }) {
  const db = await getDb();
  await db
    .prepare("INSERT INTO audit_log (at, action, entity, entityId, detail) VALUES (?, ?, ?, ?, ?)")
    .run(
      new Date().toISOString(),
      d.action,
      d.entity,
      d.entityId ?? null,
      d.detail === undefined ? null : JSON.stringify(d.detail),
    );
}

export async function listAudit(limit = 60, offset = 0): Promise<AuditRow[]> {
  const db = await getDb();
  return (await db
    .prepare("SELECT id, at, action, entity, entityId, detail FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, offset)) as unknown as AuditRow[];
}

export async function auditCount(): Promise<number> {
  const db = await getDb();
  const r = await db.prepare("SELECT COUNT(*) AS c FROM audit_log").get();
  return (r?.c as number) ?? 0;
}

// ---- admin: sections ----------------------------------------------------

export async function createSection(row: {
  sectionCode: string;
  roomNumber?: string | null;
  floor?: number | null;
  building?: string | null;
  campus?: string | null;
}): Promise<SectionRow | null> {
  const db = await getDb();
  const code = row.sectionCode.trim().toUpperCase();
  await db
    .prepare(
      "INSERT OR IGNORE INTO sections (sectionCode, roomNumber, floor, building, campus, mappingStatus, sourceNote, active) VALUES (?, ?, ?, ?, ?, 'admin_created', NULL, 1)",
    )
    .run(code, row.roomNumber ?? null, row.floor ?? null, row.building ?? null, row.campus ?? "AB1");
  // a section always needs a group row so the invite flow can resolve one
  await db
    .prepare(
      "INSERT OR IGNORE INTO whatsapp_groups (sectionCode, groupName, inviteLink, status, requireApproval, created, createdAt, updatedAt) VALUES (?, ?, NULL, 'unconfigured', 1, 0, ?, ?)",
    )
    .run(code, `GL Bajaj — ${code} Official`, new Date().toISOString(), new Date().toISOString());
  return getSection(code);
}

export async function deleteSection(sectionCode: string): Promise<boolean> {
  const db = await getDb();
  const code = sectionCode.trim().toUpperCase();
  const inUse = (await db.prepare("SELECT COUNT(*) AS c FROM students WHERE section = ?").get(code)) as { c: number };
  if ((inUse?.c ?? 0) > 0) return false;
  await db.prepare("DELETE FROM whatsapp_groups WHERE sectionCode = ?").run(code);
  const r = await db.prepare("DELETE FROM sections WHERE sectionCode = ?").run(code);
  const changes =
    (r as unknown as { changes?: number }).changes ??
    (r as unknown as { meta?: { changes?: number } }).meta?.changes ??
    0;
  return changes > 0;
}

/** Bulk room assignment, e.g. G1A..G1W -> 401.., used for seeding a block. */
export async function bulkAssignRooms(
  rows: Array<{ sectionCode: string; roomNumber?: string | null; floor?: number | null; building?: string | null }>,
): Promise<number> {
  const db = await getDb();
  const ops = rows.map((r) => ({
    sql: "UPDATE sections SET roomNumber = ?, floor = ?, building = ?, mappingStatus = 'admin_verified' WHERE sectionCode = ?",
    params: [r.roomNumber ?? null, r.floor ?? null, r.building ?? null, r.sectionCode.trim().toUpperCase()],
  }));
  if (ops.length) await batchChunked(db, ops);
  return ops.length;
}

// ---- admin: students ----------------------------------------------------

export interface StudentFilter {
  q?: string;
  section?: string;
  program?: string;
  limit?: number;
  offset?: number;
}

export async function listStudents(f: StudentFilter): Promise<StudentRow[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q?.trim()) {
    where.push("(name_norm LIKE ? OR mobile10 LIKE ? OR rollNumber LIKE ? OR section LIKE ?)");
    const q = `%${normalizeName(f.q)}%`;
    params.push(q, q, `%${f.q.trim()}%`, `%${f.q.trim().toUpperCase()}%`);
  }
  if (f.section?.trim()) {
    where.push("section = ?");
    params.push(f.section.trim().toUpperCase());
  }
  if (f.program?.trim()) {
    where.push("program = ?");
    params.push(f.program.trim());
  }
  const sql =
    "SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY section, rollNumber, name LIMIT ? OFFSET ?";
  params.push(Math.min(Math.max(f.limit ?? 50, 1), 200), Math.max(f.offset ?? 0, 0));
  return (await db.prepare(sql).all(...params)) as unknown as StudentRow[];
}

export async function studentsFilteredCount(f: StudentFilter): Promise<number> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q?.trim()) {
    where.push("(name_norm LIKE ? OR mobile10 LIKE ? OR rollNumber LIKE ? OR section LIKE ?)");
    const q = `%${normalizeName(f.q)}%`;
    params.push(q, q, `%${f.q.trim()}%`, `%${f.q.trim().toUpperCase()}%`);
  }
  if (f.section?.trim()) {
    where.push("section = ?");
    params.push(f.section.trim().toUpperCase());
  }
  if (f.program?.trim()) {
    where.push("program = ?");
    params.push(f.program.trim());
  }
  const r = (await db
    .prepare(`SELECT COUNT(*) AS c FROM students${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`)
    .get(...params)) as { c: number };
  return r?.c ?? 0;
}

export async function updateStudent(
  id: number,
  patch: Partial<Pick<StudentRow, "name" | "mobile" | "program" | "section" | "rollNumber">>,
): Promise<StudentRow | null> {
  const db = await getDb();
  const current = (await db
    .prepare("SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students WHERE id = ?")
    .get(id)) as unknown as StudentRow | null;
  if (!current) return null;
  const name = (patch.name ?? current.name).trim();
  const mobileRaw = patch.mobile ?? current.mobile;
  const mobile = normalizePhone(mobileRaw) || current.mobile;
  await db
    .prepare("UPDATE students SET name = ?, name_norm = ?, mobile10 = ?, program = ?, section = ?, rollNumber = ? WHERE id = ?")
    .run(
      name,
      normalizeName(name),
      mobile,
      (patch.program ?? current.program) || "",
      (patch.section ?? current.section).trim().toUpperCase(),
      (patch.rollNumber ?? current.rollNumber) || "",
      id,
    );
  return (await db
    .prepare("SELECT id, name, mobile10 AS mobile, program, section, rollNumber FROM students WHERE id = ?")
    .get(id)) as unknown as StudentRow | null;
}

export async function deleteStudent(id: number): Promise<boolean> {
  const db = await getDb();
  const r = await db.prepare("DELETE FROM students WHERE id = ?").run(id);
  const changes =
    (r as unknown as { changes?: number }).changes ??
    (r as unknown as { meta?: { changes?: number } }).meta?.changes ??
    0;
  return changes > 0;
}

export async function distinctPrograms(): Promise<string[]> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT DISTINCT program FROM students WHERE program != '' ORDER BY program")
    .all()) as Array<{ program: string }>;
  return rows.map((r) => r.program);
}

// ---- admin: coverage (drives the interactive map) -----------------------

export interface CoverageRow {
  sectionCode: string;
  roomNumber: string | null;
  floor: number | null;
  building: string | null;
  mappingStatus: string | null;
  active: number;
  students: number;
  hasLink: number;
  groupCreated: number | null;
}

export async function sectionsCoverage(): Promise<CoverageRow[]> {
  const db = await getDb();
  return (await db
    .prepare(
      `SELECT s.sectionCode, s.roomNumber, s.floor, s.building, s.mappingStatus, s.active,
              (SELECT COUNT(*) FROM students st WHERE st.section = s.sectionCode) AS students,
              CASE WHEN w.inviteLink IS NOT NULL AND w.inviteLink != '' THEN 1 ELSE 0 END AS hasLink,
              w.created AS groupCreated
       FROM sections s LEFT JOIN whatsapp_groups w ON w.sectionCode = s.sectionCode
       ORDER BY s.building, s.floor, s.sectionCode`,
    )
    .all()) as unknown as CoverageRow[];
}

// ---- persistence (no-op on Cloudflare — D1 is persistent) ---------------

export async function ensureConfigSynced() {
  /* D1 is the single source of truth — nothing to sync. */
}

export async function persistConfig() {
  /* no-op on Cloudflare; local SQLite already persists. */
}

export async function ensureOtpsSynced() {
  /* D1 is the single source of truth — nothing to sync. */
}

export async function persistOtps() {
  /* no-op on Cloudflare; local SQLite already persists. */
}