"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Row {
  id: number;
  name: string;
  mobile: string;
  program: string;
  section: string;
  rollNumber: string;
}

const PAGE = 40;

export default function StudentsTable({ sections }: { sections: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  const load = useCallback(
    async (nextOffset = offset) => {
      setBusy(true);
      try {
        const params = new URLSearchParams({
          q,
          section,
          limit: String(PAGE),
          offset: String(nextOffset),
        });
        const res = await fetch(`/api/admin/students?${params}`);
        const json = await res.json();
        if (json?.status === "ok") {
          setRows(json.students);
          setTotal(json.total);
          setOffset(json.offset);
        }
      } finally {
        setBusy(false);
      }
    },
    [q, section, offset],
  );

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, section]);

  const onSearch = (value: string) => {
    setQ(value);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setOffset(0), 320);
  };

  const save = async (row: Row) => {
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, ...draft }),
    });
    const json = await res.json();
    if (json?.status === "ok") {
      setRows((prev) => prev.map((r) => (r.id === row.id ? json.student : r)));
      setEditing(null);
      setDraft({});
      flash(`Saved ${json.student.name || row.name}.`);
    } else {
      flash(json?.error ?? "Could not save.");
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm(`Delete ${row.name} (${row.section} · ${row.rollNumber || "no roll"} )? This cannot be undone.`)) return;
    const res = await fetch("/api/admin/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    const json = await res.json();
    if (json?.status === "ok") {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      flash(`Deleted ${row.name}.`);
    } else {
      flash(json?.error ?? "Could not delete.");
    }
  };

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3200);
  };

  const range = useMemo(() => {
    if (total === 0) return "0";
    return `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}`;
  }, [offset, total]);

  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Student records</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-smoke">
            Edit a row to correct a name, number, section or roll. Changes are logged.
          </p>
        </div>
        <a
          href="/api/admin/export?kind=students"
          className="rounded-full border border-line-strong px-4 py-2 font-mono-nums text-[10px] tracking-[0.14em] text-smoke transition-colors hover:border-acid/50 hover:text-acid"
        >
          EXPORT CSV
        </a>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Name, mobile, roll or section…"
          className="w-full max-w-xs rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-[13px] text-cream placeholder:text-faint/70 focus:border-acid/60"
        />
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 font-mono-nums text-[12px] text-cream focus:border-acid/60"
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {busy && <span className="pulse-dot font-mono-nums text-[9px] tracking-[0.2em] text-acid">SYNC</span>}
          <span className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">{range}</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-line font-mono-nums text-[9px] tracking-[0.16em] text-faint">
              <th className="pb-3 pr-4 font-normal">NAME</th>
              <th className="pb-3 pr-4 font-normal">MOBILE</th>
              <th className="pb-3 pr-4 font-normal">SECTION</th>
              <th className="pb-3 pr-4 font-normal">ROLL</th>
              <th className="pb-3 pr-4 font-normal">PROGRAM</th>
              <th className="pb-3 font-normal text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editing === r.id;
              const cell = "py-2.5 pr-4 text-[13px] text-cream";
              const input =
                "w-full rounded-md border border-line bg-ink px-2 py-1.5 text-[12.5px] text-cream focus:border-acid/60";
              return (
                <tr key={r.id} className={`border-b border-line/60 ${isEditing ? "bg-acid/[0.04]" : ""}`}>
                  <td className={cell}>
                    {isEditing ? (
                      <input
                        className={input}
                        value={draft.name ?? r.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className={`${cell} font-mono-nums text-smoke`}>
                    {isEditing ? (
                      <input
                        className={input}
                        value={draft.mobile ?? r.mobile}
                        onChange={(e) => setDraft((d) => ({ ...d, mobile: e.target.value }))}
                      />
                    ) : (
                      r.mobile
                    )}
                  </td>
                  <td className={`${cell} font-mono-nums text-acid`}>
                    {isEditing ? (
                      <input
                        className={input}
                        value={draft.section ?? r.section}
                        onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value.toUpperCase() }))}
                      />
                    ) : (
                      r.section
                    )}
                  </td>
                  <td className={`${cell} font-mono-nums text-cream-dim`}>
                    {isEditing ? (
                      <input
                        className={input}
                        value={draft.rollNumber ?? r.rollNumber}
                        onChange={(e) => setDraft((d) => ({ ...d, rollNumber: e.target.value }))}
                      />
                    ) : (
                      r.rollNumber || "—"
                    )}
                  </td>
                  <td className={`${cell} text-smoke`}>
                    {isEditing ? (
                      <input
                        className={input}
                        value={draft.program ?? r.program}
                        onChange={(e) => setDraft((d) => ({ ...d, program: e.target.value }))}
                      />
                    ) : (
                      r.program || "—"
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => save(r)}
                            className="rounded-md border border-acid/50 bg-acid/10 px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.12em] text-acid"
                          >
                            SAVE
                          </button>
                          <button
                            onClick={() => {
                              setEditing(null);
                              setDraft({});
                            }}
                            className="rounded-md border border-line px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.12em] text-faint hover:text-cream"
                          >
                            CANCEL
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditing(r.id);
                              setDraft({});
                            }}
                            className="rounded-md border border-line px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.12em] text-smoke hover:border-line-strong hover:text-cream"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => remove(r)}
                            className="rounded-md border border-line px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.12em] text-faint hover:border-rose/50 hover:text-rose"
                          >
                            DELETE
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center font-mono-nums text-[10px] tracking-[0.18em] text-faint">
                  {busy ? "LOADING…" : "NO RECORDS MATCH THIS FILTER."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => load(Math.max(0, offset - PAGE))}
          disabled={offset === 0 || busy}
          className="rounded-lg border border-line px-3.5 py-2 font-mono-nums text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-line-strong hover:text-cream disabled:opacity-40"
        >
          ← PREV
        </button>
        <span className="font-mono-nums text-[10px] tracking-[0.14em] text-faint">
          PAGE {page} / {pages}
        </span>
        <button
          onClick={() => load(offset + PAGE)}
          disabled={offset + PAGE >= total || busy}
          className="rounded-lg border border-line px-3.5 py-2 font-mono-nums text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-line-strong hover:text-cream disabled:opacity-40"
        >
          NEXT →
        </button>
      </div>

      {msg && <p className="mt-3 font-mono-nums text-[10px] tracking-[0.12em] text-acid">{msg.toUpperCase()}</p>}
    </div>
  );
}
