"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import SiteHeader from "@/components/SiteHeader";
import PaperBackdrop from "@/components/PaperBackdrop";
import CoverageMap from "@/components/admin/CoverageMap";
import StudentsTable from "@/components/admin/StudentsTable";
import ActivityFeed from "@/components/admin/ActivityFeed";

type TabId = "overview" | "students" | "sections" | "groups" | "faculty" | "assignments" | "timetable" | "activity";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "students", label: "Students" },
  { id: "sections", label: "Sections" },
  { id: "groups", label: "Groups" },
  { id: "faculty", label: "Faculty" },
  { id: "assignments", label: "Assignments" },
  { id: "timetable", label: "Timetable" },
  { id: "activity", label: "Activity" },
];

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface SectionRow {
  sectionCode: string;
  roomNumber: string | null;
  floor: number | null;
  building: string | null;
  mappingStatus: string | null;
  active: number;
  groupStatus: string | null;
  inviteLink: string | null;
  groupCreated: number | null;
  requireApproval: number | null;
  students: number;
}

interface GroupRow {
  sectionCode: string;
  groupName: string;
  inviteLink: string | null;
  status: string;
  requireApproval: number;
  created: number;
}

interface StudentRow {
  id: number;
  name: string;
  mobile: string;
  program: string;
  section: string;
  rollNumber: string;
}

interface DeliveryRow {
  id: number;
  mobile10: string;
  sectionCode: string;
  groupName: string | null;
  method: string;
  status: string;
  deliveredAt: string;
}

interface FacultyAdminRow {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  photo: string | null;
  kind: string;
  sortOrder: number;
  active: number;
  subjects?: string[];
  sections?: string[];
}

interface TeachingAdminRow {
  id: number;
  facultyId: number;
  section: string;
  subject: string | null;
  subjectCode: string | null;
  role: string;
  sortOrder: number;
  name: string;
}

interface SlotAdminRow {
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
  kind: string;
}

interface Stats {
  totalStudents: number;
  totalSections: number;
  mappedSections: number;
  missingClassroom: number;
  groupsActive: number;
  missingLinks: number;
  groupsCreated: number;
  invitesSent: number;
  lastImport: { recordsRead: number; validExported: number; invalidMobile: number; duplicatePairs: number; missingSection: number; sections: string[]; at: string } | null;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/60 p-5">
      <p className="mb-2 font-mono-nums text-[9.5px] tracking-[0.18em] text-faint">{label}</p>
      <p className={`font-mono-nums text-[26px] font-semibold tracking-tight ${accent ? "text-acid" : "text-cream"}`}>
        {value}
      </p>
    </div>
  );
}

function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onAuthed();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5">
      <form onSubmit={submit} className="anim-scalein w-full max-w-sm rounded-3xl border border-line bg-panel/70 p-8">
        <p className="mb-2 font-mono-nums text-[10px] tracking-[0.2em] text-faint">ADMIN ACCESS</p>
        <h2 className="mb-6 text-xl font-semibold tracking-[-0.02em] text-cream">Prototype control panel</h2>
        <label htmlFor="adminpass" className="mb-2 block font-mono-nums text-[10px] tracking-[0.18em] text-smoke">
          PASSWORD
        </label>
        <input
          id="adminpass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          aria-invalid={error}
          className={`w-full rounded-xl border bg-ink-2 px-4 py-3.5 text-[15px] text-cream transition-colors focus:border-acid/60 ${
            error ? "border-rose/60" : "border-line"
          }`}
        />
        {error && <p className="mt-2 font-mono-nums text-[10px] tracking-[0.12em] text-rose">INCORRECT PASSWORD</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 w-full rounded-xl bg-acid px-5 py-3.5 text-[14px] font-semibold text-[#101106] transition-colors hover:bg-cream disabled:opacity-40"
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

function SectionEditor({ row, onChange }: { row: SectionRow; onChange: (code: string, patch: Partial<SectionRow>) => void }) {
  const [room, setRoom] = useState(row.roomNumber ?? "");
  const [floor, setFloor] = useState(row.floor ?? 1);
  const [building, setBuilding] = useState(row.building ?? "");
  const [status, setStatus] = useState(row.mappingStatus ?? "inferred_seed");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRoom(row.roomNumber ?? "");
    setFloor(row.floor ?? 1);
    setBuilding(row.building ?? "");
    setStatus(row.mappingStatus ?? "inferred_seed");
  }, [row]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionCode: row.sectionCode, roomNumber: room, floor, building, mappingStatus: status }),
      });
      if (res.ok) {
        setSaved(true);
        onChange(row.sectionCode, { roomNumber: room, floor, building, mappingStatus: status });
        setTimeout(() => setSaved(false), 1600);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-ink-2/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ROOM" mono value={room} onChange={setRoom} placeholder="e.g. 416" />
        <Field label="FLOOR" mono value={String(floor)} onChange={(v) => setFloor(Number(v) || 1)} placeholder="e.g. 4" />
        <Field label="BUILDING" value={building} onChange={setBuilding} placeholder="Academic Block-1" />
        <div>
          <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">STATUS</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 font-mono-nums text-[12px] text-cream focus:border-acid/60"
          >
            {["user_confirmed", "research_seed", "inferred_seed", "admin_verified"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-acid px-4 py-2 text-[12px] font-semibold text-[#101106] transition-colors hover:bg-cream disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save mapping"}
        </button>
        {saved && <span className="font-mono-nums text-[10px] tracking-[0.14em] text-acid">SAVED ✓</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">{label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[13px] text-cream focus:border-acid/60 ${
          mono ? "font-mono-nums" : ""
        }`}
      />
    </div>
  );
}

function resizeImage(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no ctx"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

function FacultyEditor({
  row,
  onCancel,
  onSave,
  onDelete,
  saving,
}: {
  row: FacultyAdminRow;
  onCancel: () => void;
  onSave: (draft: FacultyAdminRow) => void;
  onDelete: (id: number) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<FacultyAdminRow>(row);
  const set = (k: keyof FacultyAdminRow, v: string | number) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <div className="rounded-xl border border-line bg-ink-2/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="NAME *" value={draft.name} onChange={(v) => set("name", v)} />
        <div>
          <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">KIND</p>
          <select
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 font-mono-nums text-[12px] text-cream focus:border-acid/60"
          >
            <option value="coordinator">CLASS COORDINATOR</option>
            <option value="faculty">FACULTY</option>
            <option value="hod">HOD</option>
            <option value="staff">STAFF</option>
          </select>
        </div>
        <Field label="MOBILE" mono value={draft.mobile ?? ""} onChange={(v) => set("mobile", v)} />
        <Field label="EMAIL" value={draft.email ?? ""} onChange={(v) => set("email", v)} />
        <div>
          <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">PHOTO</p>
          <div className="flex items-center gap-3">
            {draft.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.photo} alt="photo preview" className="h-12 w-12 rounded-full border border-line object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel font-mono-nums text-[10px] text-faint">
                —
              </div>
            )}
            <label className="cursor-pointer rounded-lg border border-line-strong px-3 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-smoke transition-colors hover:border-acid/50 hover:text-acid">
              UPLOAD / TAKE PHOTO
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    try {
                      const dataUrl = await resizeImage(f);
                      set("photo", dataUrl);
                    } catch {
                      /* ignore bad file */
                    }
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {draft.photo && (
              <button
                type="button"
                onClick={() => set("photo", "")}
                className="font-mono-nums text-[10px] tracking-[0.1em] text-faint transition-colors hover:text-rose"
              >
                REMOVE
              </button>
            )}
          </div>
          <p className="mt-1.5 font-mono-nums text-[8.5px] tracking-[0.1em] text-faint/70">
            ON MOBILE PICK CAMERA OR GALLERY — PHOTO IS RESIZED AUTOMATICALLY.
          </p>
        </div>
        <Field label="SORT ORDER" mono value={String(draft.sortOrder ?? 0)} onChange={(v) => set("sortOrder", Number(v) || 0)} />
        <div>
          <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">VISIBLE ON RESULT</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.active === 1}
              onChange={(e) => set("active", e.target.checked ? 1 : 0)}
              className="h-4 w-4 accent-[#c9f25a]"
            />
            <span className="text-[12px] text-cream">Show on student result page</span>
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !draft.name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-acid px-4 py-2 text-[12px] font-semibold text-[#101106] transition-colors hover:bg-cream disabled:opacity-50"
        >
          {saving ? "Saving…" : draft.id ? "Update" : "Add"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-line-strong px-4 py-2 text-[12px] text-smoke transition-colors hover:text-cream"
        >
          Cancel
        </button>
        {Boolean(draft.id) && (
          <button
            onClick={() => onDelete(draft.id)}
            className="ml-auto rounded-lg px-3 py-2 font-mono-nums text-[11px] tracking-[0.1em] text-faint transition-colors hover:text-rose"
          >
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminClient() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<Stats["lastImport"] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [faculty, setFaculty] = useState<FacultyAdminRow[]>([]);
  const [editingFaculty, setEditingFaculty] = useState<FacultyAdminRow | null>(null);
  const [facultySaving, setFacultySaving] = useState(false);
  const [facultyMsg, setFacultyMsg] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TeachingAdminRow[]>([]);
  const [assignSection, setAssignSection] = useState("");
  const [assignFacultyId, setAssignFacultyId] = useState("");
  const [assignSubject, setAssignSubject] = useState("");
  const [assignRole, setAssignRole] = useState("subject");
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [ttSection, setTtSection] = useState("");
  const [ttSlots, setTtSlots] = useState<SlotAdminRow[]>([]);
  const [ttLoading, setTtLoading] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      const payload = await res.json();
      setAuthed(true);
      setStats(payload.stats);
      setSections(payload.sectionStats);
      setDeliveries(payload.lastDeliveries ?? []);
      setImportReport(payload.stats.lastImport);
      const g = await fetch("/api/admin/groups").then((r) => r.json());
      setGroups(g.groups ?? []);
      const f = await fetch("/api/admin/faculty").then((r) => r.json());
      setFaculty(f.faculty ?? []);
      const t = await fetch("/api/admin/teaching").then((r) => r.json());
      setAssignments(t.assignments ?? []);
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/students?q=${encodeURIComponent(q)}`);
      const p = await res.json();
      setResults(p.students ?? []);
    } finally {
      setSearching(false);
    }
  };

  const doImport = async (file: File) => {
    setImporting(true);
    setImportError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const p = await res.json();
      if (p.status === "ok") {
        setImportReport(p.stats);
        load();
      } else {
        setImportError(p.error ?? "Import failed.");
      }
    } catch {
      setImportError("Could not upload the file.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveLink = async (code: string) => {
    setSavingLink(code);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionCode: code, inviteLink: linkDrafts[code] ?? null }),
      });
      if (res.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.sectionCode === code ? { ...g, inviteLink: linkDrafts[code] ?? null, status: linkDrafts[code] ? "active" : "unconfigured" } : g,
          ),
        );
      }
    } finally {
      setSavingLink(null);
    }
  };

  const toggleGroupFlag = async (code: string, field: "created" | "requireApproval", value: boolean) => {
    try {
      const res = await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionCode: code, [field]: value }),
      });
      if (res.ok) {
        setGroups((prev) => prev.map((g) => (g.sectionCode === code ? { ...g, [field]: value ? 1 : 0 } : g)));
      }
    } catch {
      /* ignore */
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin");
  };

  const saveFaculty = async (draft: FacultyAdminRow) => {
    setFacultySaving(true);
    setFacultyMsg(null);
    try {
      const isEdit = Boolean(draft.id);
      const res = await fetch("/api/admin/faculty", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const p = await res.json();
      if (p.status === "ok") {
        setFaculty((prev) =>
          isEdit ? prev.map((x) => (x.id === draft.id ? p.faculty : x)) : [...prev, p.faculty],
        );
        setEditingFaculty(null);
        setFacultyMsg(isEdit ? "FACULTY UPDATED ✓" : "FACULTY ADDED ✓");
        setTimeout(() => setFacultyMsg(null), 2000);
      } else {
        setFacultyMsg(p.error ?? "FAILED TO SAVE");
      }
    } finally {
      setFacultySaving(false);
    }
  };

  const deleteFaculty = async (id: number) => {
    try {
      const res = await fetch("/api/admin/faculty", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setFaculty((prev) => prev.filter((x) => x.id !== id));
        setEditingFaculty(null);
      }
    } catch {
      /* ignore */
    }
  };

  const sectionPatch = (code: string, patch: Partial<SectionRow>) => {
    setSections((prev) => prev.map((s) => (s.sectionCode === code ? { ...s, ...patch } : s)));
  };

  const addAssignment = async () => {
    const facultyId = Number(assignFacultyId);
    if (!facultyId || !assignSection.trim()) {
      setAssignMsg("PICK A PERSON AND A SECTION");
      return;
    }
    setAssignMsg(null);
    try {
      const res = await fetch("/api/admin/teaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facultyId, section: assignSection, subject: assignSubject, role: assignRole }),
      });
      const p = await res.json();
      if (p.status === "ok") {
        const name = faculty.find((f) => f.id === facultyId)?.name ?? "";
        setAssignments((prev) => [...prev, { ...p.assignment, name }]);
        setAssignSubject("");
        setAssignMsg("ASSIGNED ✓");
        setTimeout(() => setAssignMsg(null), 2000);
      } else {
        setAssignMsg(p.error ?? "FAILED");
      }
    } catch {
      setAssignMsg("FAILED");
    }
  };

  const removeAssignment = async (id: number) => {
    try {
      const res = await fetch("/api/admin/teaching", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* ignore */
    }
  };

  const showQr = async (sectionCode: string, link: string) => {
    if (!link) return;
    try {
      const url = await QRCode.toDataURL(link, {
        width: 640,
        margin: 2,
        color: { dark: "#20180d", light: "#ede4d7" },
      });
      setQrFor(sectionCode);
      setQrData(url);
    } catch {
      /* ignore a bad link */
    }
  };

  const loadTimetable = async (section: string) => {
    setTtSection(section);
    setTtSlots([]);
    if (!section) return;
    setTtLoading(true);
    try {
      const j = await fetch(`/api/admin/timetable?section=${encodeURIComponent(section)}`).then((r) => r.json());
      setTtSlots(j.slots ?? []);
    } catch {
      /* ignore */
    } finally {
      setTtLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="pulse-dot font-mono-nums text-[11px] tracking-[0.24em] text-faint">LOADING…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="sunset relative min-h-dvh">
        <PaperBackdrop />
        <div className="relative z-10">
        <SiteHeader />
        <LoginGate onAuthed={() => { setAuthed(true); load(); }} />
        </div>
      </div>
    );
  }

  const missingClassroomSections = sections.filter((s) => !s.roomNumber || !s.active);
  const missingLinkSections = sections.filter((s) => !s.inviteLink);

  return (
    <div className="relative min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono-nums text-[11px] tracking-[0.3em] text-acid">ADMIN / PROTOTYPE</p>
            <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold tracking-[-0.03em] text-cream">
              Data & configuration
            </h1>
          </div>
          <button
            onClick={logout}
            className="rounded-full border border-line px-5 py-2.5 font-mono-nums text-[11px] tracking-[0.14em] text-smoke transition-colors hover:border-line-strong hover:text-cream"
          >
            LOG OUT
          </button>
        </div>

        {/* tabs */}
        <div className="mt-7 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 font-mono-nums text-[11px] tracking-[0.14em] transition-colors ${
                tab === t.id
                  ? "border-acid text-acid"
                  : "border-transparent text-faint hover:text-cream"
              }`}
            >
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
        {/* stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
          <StatCard label="STUDENTS" value={stats?.totalStudents ?? 0} accent />
          <StatCard label="SECTIONS" value={stats?.totalSections ?? 0} />
          <StatCard label="MAPPED ROOMS" value={stats?.mappedSections ?? 0} />
          <StatCard label="MISSING ROOMS" value={stats?.missingClassroom ?? 0} />
          <StatCard label="GROUPS WITH LINK" value={stats?.groupsActive ?? 0} />
          <StatCard label="LINKS PENDING" value={stats?.missingLinks ?? 0} />
          <StatCard label="GROUPS CREATED" value={stats?.groupsCreated ?? 0} />
          <StatCard label="INVITES SENT" value={stats?.invitesSent ?? 0} accent />
        </div>

        {importReport && (
          <div className="anim-fadein mt-4 rounded-2xl border border-line bg-panel/60 p-5 font-mono-nums text-[10px] tracking-[0.12em] text-smoke">
            <span className="text-acid">LAST IMPORT</span> · {importReport.recordsRead} READ ·{" "}
            {importReport.validExported} VALID · {importReport.invalidMobile} INVALID MOBILE ·{" "}
            {importReport.duplicatePairs} DUPLICATE PAIR{importReport.duplicatePairs === 1 ? "" : "S"} ·{" "}
            {importReport.sections.length} SECTIONS · {new Date(importReport.at).toLocaleString()}
          </div>
        )}

        <div className="mt-5">
          <CoverageMap />
        </div>
          </>
        )}

        {tab === "students" && (
          <>
        {/* import */}
        <section className="mt-12 rounded-3xl border border-line bg-panel/60 p-7">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Import student dataset</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
            Upload the admission workbook (.xlsx). Only the name, mobile, program, section and roll
            number fields are stored — no family details, marks or admission metadata.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
              }}
              className="block w-full max-w-md cursor-pointer rounded-xl border border-line bg-ink-2 px-4 py-3 text-[13px] text-smoke file:mr-4 file:rounded-lg file:border-0 file:bg-acid file:px-4 file:py-2 file:text-[12px] file:font-semibold file:text-[#101106] hover:file:bg-cream"
            />
            {importing && <span className="pulse-dot font-mono-nums text-[10px] tracking-[0.2em] text-acid">IMPORTING…</span>}
          </div>
          {importError && <p className="mt-3 font-mono-nums text-[10px] tracking-[0.12em] text-rose">{importError.toUpperCase()}</p>}
        </section>

        {/* student search */}
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Search students</h2>
          <input
            type="search"
            value={query}
            onChange={(e) => doSearch(e.target.value)}
            placeholder="Name, mobile or section…"
            className="mt-4 w-full max-w-md rounded-xl border border-line bg-ink-2 px-4 py-3 text-[14px] text-cream placeholder:text-faint/70 focus:border-acid/60"
          />
          {searching && <p className="mt-3 font-mono-nums text-[10px] tracking-[0.2em] text-faint">SEARCHING…</p>}
          {results.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-line font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                    <th className="pb-3 pr-4 font-normal">NAME</th>
                    <th className="pb-3 pr-4 font-normal">MOBILE</th>
                    <th className="pb-3 pr-4 font-normal">PROGRAM</th>
                    <th className="pb-3 pr-4 font-normal">SECTION</th>
                    <th className="pb-3 font-normal">ROLL</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-3 pr-4 text-[13px] text-cream">{r.name}</td>
                      <td className="py-3 pr-4 font-mono-nums text-[12px] text-smoke">{r.mobile}</td>
                      <td className="py-3 pr-4 text-[12px] text-smoke">{r.program}</td>
                      <td className="py-3 pr-4 font-mono-nums text-[12px] text-acid">{r.section}</td>
                      <td className="py-3 font-mono-nums text-[12px] text-cream-dim">{r.rollNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-8">
          <StudentsTable sections={sections.map((s) => s.sectionCode)} />
        </div>
          </>
        )}

        {tab === "sections" && (
          <>
        {/* sections */}
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Classroom mappings</h2>
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">
              {missingClassroomSections.length} SECTIONS MISSING ROOM DATA
            </p>
          </div>
          <div className="mt-5 grid gap-2">
            {sections.map((s) => (
              <div key={s.sectionCode} className="overflow-hidden rounded-xl border border-line bg-ink-2/40">
                <button
                  onClick={() => setEditingSection(editingSection === s.sectionCode ? null : s.sectionCode)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono-nums text-[13px] font-semibold text-cream">{s.sectionCode}</span>
                    <span className="font-mono-nums text-[12px] text-smoke">
                      {s.roomNumber ? `RM ${s.roomNumber} · F${s.floor ?? "?"}` : "NO ROOM"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-0.5 font-mono-nums text-[9px] tracking-[0.12em] ${
                      s.roomNumber ? "border-acid/30 bg-acid/5 text-acid" : "border-amber/40 bg-amber/10 text-amber"
                    }`}>
                      {s.roomNumber ? s.mappingStatus ?? "seed" : "MISSING"}
                    </span>
                    <span className="font-mono-nums text-[12px] text-faint">{s.students}</span>
                    <span className="font-mono-nums text-[14px] text-faint transition-transform duration-200">
                      {editingSection === s.sectionCode ? "−" : "+"}
                    </span>
                  </span>
                </button>
                {editingSection === s.sectionCode && (
                  <div className="border-t border-line p-4">
                    <SectionEditor row={s} onChange={sectionPatch} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

          </>
        )}

        {tab === "groups" && (
          <>
        {/* whatsapp groups */}
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">WhatsApp groups</h2>
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">
              {missingLinkSections.length} GROUPS WITHOUT INVITE LINK
            </p>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                  <th className="pb-3 pr-4 font-normal">SECTION</th>
                  <th className="pb-3 pr-4 font-normal">GROUP NAME</th>
                  <th className="pb-3 pr-4 font-normal">INVITE LINK</th>
                  <th className="pb-3 pr-4 font-normal">CREATED</th>
                  <th className="pb-3 pr-4 font-normal">APPROVAL</th>
                  <th className="pb-3 font-normal">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.sectionCode} className="border-b border-line/60">
                    <td className="py-3 pr-4 font-mono-nums text-[12px] text-acid">{g.sectionCode}</td>
                    <td className="py-3 pr-4 text-[13px] text-cream">{g.groupName}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={linkDrafts[g.sectionCode] ?? g.inviteLink ?? ""}
                          placeholder="https://chat.whatsapp.com/…"
                          onChange={(e) => setLinkDrafts((d) => ({ ...d, [g.sectionCode]: e.target.value }))}
                          className="w-full max-w-[220px] rounded-lg border border-line bg-ink-2 px-3 py-2 font-mono-nums text-[11px] text-cream focus:border-acid/60"
                        />
                        <button
                          onClick={() => saveLink(g.sectionCode)}
                          disabled={savingLink === g.sectionCode}
                          className="rounded-lg border border-line-strong px-3 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-smoke transition-colors hover:border-acid/50 hover:text-acid disabled:opacity-50"
                        >
                          {savingLink === g.sectionCode ? "SAVING…" : "SAVE"}
                        </button>
                        {(linkDrafts[g.sectionCode] ?? g.inviteLink) && (
                          <button
                            onClick={() => showQr(g.sectionCode, linkDrafts[g.sectionCode] ?? g.inviteLink ?? "")}
                            className="rounded-lg border border-line-strong px-3 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-smoke transition-colors hover:border-acid/50 hover:text-acid"
                          >
                            QR
                          </button>
                        )}
                        {(linkDrafts[g.sectionCode] ?? g.inviteLink) && (
                          <button
                            onClick={() => {
                              setLinkDrafts((d) => ({ ...d, [g.sectionCode]: "" }));
                              setSavingLink(g.sectionCode);
                              fetch("/api/admin/groups", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ sectionCode: g.sectionCode, inviteLink: null }),
                              }).then(() => {
                                setGroups((prev) =>
                                  prev.map((x) =>
                                    x.sectionCode === g.sectionCode ? { ...x, inviteLink: null, status: "unconfigured" } : x,
                                  ),
                                );
                              }).finally(() => setSavingLink(null));
                            }}
                            className="rounded-lg px-2 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-faint transition-colors hover:text-rose"
                          >
                            CLEAR
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => toggleGroupFlag(g.sectionCode, "created", g.created !== 1)}
                        aria-pressed={g.created === 1}
                        className={`rounded-full border px-3 py-1 font-mono-nums text-[9px] tracking-[0.12em] transition-colors ${
                          g.created === 1
                            ? "border-acid/40 bg-acid/10 text-acid"
                            : "border-line text-faint hover:text-cream"
                        }`}
                      >
                        {g.created === 1 ? "CREATED ✓" : "MARK CREATED"}
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => toggleGroupFlag(g.sectionCode, "requireApproval", g.requireApproval !== 1)}
                        aria-pressed={g.requireApproval === 1}
                        className={`rounded-full border px-3 py-1 font-mono-nums text-[9px] tracking-[0.12em] transition-colors ${
                          g.requireApproval === 1
                            ? "border-acid/40 bg-acid/10 text-acid"
                            : "border-line text-faint hover:text-cream"
                        }`}
                      >
                        {g.requireApproval === 1 ? "ON ✓" : "OFF"}
                      </button>
                    </td>
                    <td className="py-3">
                      <span className={`font-mono-nums text-[10px] tracking-[0.12em] ${
                        g.status === "active" ? "text-acid" : "text-amber"
                      }`}>
                        {g.status === "active" ? "ACTIVE" : "UNCONFIGURED"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {qrFor && qrData && (
            <div className="mt-5 flex flex-col items-start gap-5 rounded-2xl border border-line bg-ink-2/50 p-5 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrData}
                alt={`Group QR for ${qrFor}`}
                className="h-44 w-44 shrink-0 rounded-xl border border-line"
              />
              <div>
                <p className="font-mono-nums text-[10px] tracking-[0.16em] text-acid">SCAN TO JOIN · {qrFor}</p>
                <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-smoke">
                  Generated in your browser from the pasted link — nothing is sent anywhere. Project it on the
                  classroom screen or print it; students scan to join directly. The link is still delivered to
                  verified numbers, so nobody is stuck if they cannot scan.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={qrData}
                    download={`classfind-${qrFor}-qr.png`}
                    className="rounded-lg bg-acid px-3 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-[#101106] transition-colors hover:bg-cream"
                  >
                    DOWNLOAD PNG
                  </a>
                  <button
                    onClick={() => {
                      setQrFor(null);
                      setQrData(null);
                    }}
                    className="rounded-lg border border-line-strong px-3 py-2 font-mono-nums text-[10px] tracking-[0.1em] text-smoke transition-colors hover:text-cream"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="mt-4 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
            EVERY SECTION HAS ITS OWN GROUP. THE INVITE LINK IS NEVER SHOWN TO STUDENTS — IT IS DELIVERED TO
            THE VERIFIED MOBILE NUMBER ONLY. NEW MEMBERS ARE APPROVED BY THE GROUP ADMIN.
          </p>
        </section>

          </>
        )}

        {tab === "faculty" && (
          <>
        {/* people */}
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">People</h2>
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">
              {faculty.length} PEOPLE · {assignments.length} ASSIGNMENTS
            </p>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
            A teacher is added here <strong className="text-cream-dim">once</strong>. Which sections and subjects they
            cover is set in the <span className="text-acid">Assignments</span> tab, so the same person teaching ten
            sections stays a single record.
          </p>
          <div className="mt-5 grid gap-2">
            {faculty.map((f) => (
              <div key={f.id} className="overflow-hidden rounded-xl border border-line bg-ink-2/40">
                <button
                  onClick={() => setEditingFaculty(editingFaculty?.id === f.id ? null : f)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="truncate text-[13px] font-semibold text-cream">{f.name}</span>
                    <span className="hidden truncate font-mono-nums text-[11px] text-smoke sm:inline">
                      {(f.subjects ?? []).slice(0, 3).join(" · ") || "—"}
                      {(f.sections ?? []).length ? `  @  ${(f.sections ?? []).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-mono-nums text-[9px] tracking-[0.12em] ${
                        f.kind === "coordinator"
                          ? "border-acid/40 bg-acid/10 text-acid"
                          : "border-azure/40 bg-azure/10 text-azure"
                      }`}
                    >
                      {f.kind === "coordinator" ? "COORDINATOR" : f.kind.toUpperCase()}
                    </span>
                    {f.active ? (
                      <span className="font-mono-nums text-[12px] text-acid">✓</span>
                    ) : (
                      <span className="font-mono-nums text-[12px] text-faint">·</span>
                    )}
                    <span className="font-mono-nums text-[14px] text-faint transition-transform duration-200">
                      {editingFaculty?.id === f.id ? "−" : "+"}
                    </span>
                  </span>
                </button>
                {editingFaculty?.id === f.id && (
                  <div className="border-t border-line p-4">
                    <FacultyEditor
                      row={f}
                      saving={facultySaving}
                      onCancel={() => setEditingFaculty(null)}
                      onSave={saveFaculty}
                      onDelete={deleteFaculty}
                    />
                  </div>
                )}
              </div>
            ))}
            {!editingFaculty && (
              <button
                onClick={() =>
                  setEditingFaculty({
                    id: 0,
                    kind: "faculty",
                    name: "",
                    mobile: "",
                    email: "",
                    photo: "",
                    sortOrder: 0,
                    active: 1,
                  })
                }
                className="rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-left font-mono-nums text-[11px] tracking-[0.14em] text-smoke transition-colors hover:border-acid/50 hover:text-acid"
              >
                + ADD PERSON
              </button>
            )}
            {editingFaculty && !editingFaculty.id && (
              <div className="overflow-hidden rounded-xl border border-line bg-ink-2/40">
                <div className="border-t border-line p-4">
                  <FacultyEditor
                    row={editingFaculty}
                    saving={facultySaving}
                    onCancel={() => setEditingFaculty(null)}
                    onSave={saveFaculty}
                    onDelete={deleteFaculty}
                  />
                </div>
              </div>
            )}
          </div>
          {facultyMsg && (
            <p className="mt-3 font-mono-nums text-[10px] tracking-[0.14em] text-acid">{facultyMsg}</p>
          )}
        </section>

          </>
        )}

        {tab === "assignments" && (
          <>
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Teaching assignments</h2>
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">{assignments.length} ROWS</p>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
            One row means this person teaches this subject in this section. A student only ever sees the rows for their
            own section. Physics in G1I and G1J is two rows, one person.
          </p>

          <div className="mt-5 grid gap-3 rounded-xl border border-line bg-ink-2/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">SECTION</p>
              <select
                value={assignSection}
                onChange={(e) => setAssignSection(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 font-mono-nums text-[12px] text-cream focus:border-acid/60"
              >
                <option value="">— pick —</option>
                {sections.map((s) => (
                  <option key={s.sectionCode} value={s.sectionCode}>
                    {s.sectionCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">TEACHER</p>
              <select
                value={assignFacultyId}
                onChange={(e) => setAssignFacultyId(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[12px] text-cream focus:border-acid/60"
              >
                <option value="">— pick —</option>
                {faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <Field label="SUBJECT" value={assignSubject} onChange={setAssignSubject} placeholder="e.g. Physics" />
            <div>
              <p className="mb-1.5 font-mono-nums text-[9px] tracking-[0.16em] text-faint">ROLE</p>
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 font-mono-nums text-[12px] text-cream focus:border-acid/60"
              >
                <option value="subject">SUBJECT TEACHER</option>
                <option value="coordinator">CLASS COORDINATOR</option>
                <option value="mentor">MENTOR</option>
                <option value="lab">LAB</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={addAssignment}
                className="w-full rounded-lg bg-acid px-4 py-2.5 text-[12px] font-semibold text-[#101106] transition-colors hover:bg-cream"
              >
                Assign
              </button>
            </div>
          </div>
          {assignMsg && <p className="mt-3 font-mono-nums text-[10px] tracking-[0.14em] text-acid">{assignMsg}</p>}

          <div className="mt-5 grid gap-2">
            {assignments.length === 0 && (
              <p className="font-mono-nums text-[11px] tracking-[0.12em] text-faint">NO ASSIGNMENTS YET</p>
            )}
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-2/40 px-4 py-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono-nums text-[11px] text-acid">{a.section}</span>
                  <span className="truncate text-[13px] font-semibold text-cream">{a.name}</span>
                  <span className="truncate font-mono-nums text-[11px] text-smoke">{a.subject ?? "—"}</span>
                  {a.role !== "subject" && (
                    <span className="rounded-full border border-azure/40 bg-azure/10 px-2 py-0.5 font-mono-nums text-[9px] tracking-[0.12em] text-azure">
                      {a.role.toUpperCase()}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => removeAssignment(a.id)}
                  className="shrink-0 rounded-lg px-3 py-1.5 font-mono-nums text-[10px] tracking-[0.1em] text-faint transition-colors hover:text-rose"
                >
                  REMOVE
                </button>
              </div>
            ))}
          </div>
        </section>
          </>
        )}

        {tab === "timetable" && (
          <>
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Timetable</h2>
            <select
              value={ttSection}
              onChange={(e) => loadTimetable(e.target.value)}
              className="rounded-lg border border-line bg-panel px-3 py-2 font-mono-nums text-[12px] text-cream focus:border-acid/60"
            >
              <option value="">— pick section —</option>
              {sections.map((s) => (
                <option key={s.sectionCode} value={s.sectionCode}>
                  {s.sectionCode}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
            The weekly grid for one section. Seeded from the official timetable PDF; a student sees only their own
            section&apos;s grid.
          </p>
          {ttLoading && <p className="mt-4 font-mono-nums text-[11px] tracking-[0.14em] text-faint">LOADING…</p>}
          {!ttLoading && ttSection && ttSlots.length === 0 && (
            <p className="mt-4 font-mono-nums text-[11px] tracking-[0.14em] text-faint">
              NO TIMETABLE SEEDED FOR {ttSection}
            </p>
          )}
          {!ttLoading && ttSlots.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="border-b border-line px-3 py-2 font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                      DAY
                    </th>
                    {Array.from(new Set(ttSlots.map((s) => s.period)))
                      .sort((a, b) => a - b)
                      .map((p) => (
                        <th key={p} className="border-b border-line px-3 py-2 font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                          P{p}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4, 5].map((d) => (
                    <tr key={d}>
                      <td className="border-b border-line px-3 py-2 font-mono-nums text-[10px] text-acid">{DAYS[d]}</td>
                      {Array.from(new Set(ttSlots.map((s) => s.period)))
                        .sort((a, b) => a - b)
                        .map((p) => {
                          const slot = ttSlots.find((s) => s.day === d && s.period === p);
                          return (
                            <td key={p} className="border-b border-line px-3 py-2 text-[11px] text-cream">
                              {slot ? slot.subject ?? slot.subjectCode ?? "—" : <span className="text-faint">·</span>}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        )}

        {tab === "activity" && (
          <>
        {/* deliveries */}
        <section className="mt-8 rounded-3xl border border-line bg-panel/60 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Invite deliveries</h2>
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">
              {stats?.invitesSent ?? 0} TOTAL · OTP-STYLE DELIVERY LOG
            </p>
          </div>
          {deliveries.length === 0 ? (
            <p className="mt-4 font-mono-nums text-[10px] tracking-[0.14em] text-faint">
              NO INVITES SENT YET. THEY APPEAR HERE AFTER A STUDENT REQUESTS THEIR INVITATION.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-line font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                    <th className="pb-3 pr-4 font-normal">WHEN</th>
                    <th className="pb-3 pr-4 font-normal">NUMBER</th>
                    <th className="pb-3 pr-4 font-normal">SECTION</th>
                    <th className="pb-3 pr-4 font-normal">GROUP</th>
                    <th className="pb-3 font-normal">METHOD / STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-line/60">
                      <td className="py-3 pr-4 font-mono-nums text-[11px] text-smoke">
                        {new Date(d.deliveredAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 font-mono-nums text-[12px] text-cream">
                        +91 {d.mobile10.slice(0, 2)}••••••{d.mobile10.slice(8)}
                      </td>
                      <td className="py-3 pr-4 font-mono-nums text-[12px] text-acid">{d.sectionCode}</td>
                      <td className="py-3 pr-4 text-[12px] text-cream-dim">{d.groupName}</td>
                      <td className="py-3 font-mono-nums text-[10px] tracking-[0.1em]">
                        <span className={d.status === "delivered" ? "text-acid" : "text-amber"}>
                          {d.method.toUpperCase()} · {d.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-8">
          <ActivityFeed />
        </div>
          </>
        )}

        <p className="mt-10 font-mono-nums text-[10px] leading-relaxed tracking-[0.14em] text-faint">
          SEEDED ROOM DATA IS CONFIGURABLE AND NOT CLAIMED AS OFFICIAL 2026-27 ALLOCATIONS. WHEN THE
          FINAL TIMETABLE IS SUPPLIED, UPDATE RECORDS HERE.
        </p>
      </main>
    </div>
  );
}