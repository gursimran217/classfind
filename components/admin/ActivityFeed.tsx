"use client";

import { useCallback, useEffect, useState } from "react";

interface Event {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
}

const TONE: Record<string, string> = {
  create: "border-acid/45 bg-acid/10 text-acid",
  update: "border-azure/45 bg-azure/10 text-azure",
  "bulk-update": "border-amber/45 bg-amber/10 text-amber",
  delete: "border-rose/45 bg-rose/10 text-rose",
};

function summarise(e: Event): string {
  if (!e.detail) return "";
  try {
    const d = JSON.parse(e.detail) as Record<string, unknown>;
    if (Array.isArray(d.fields)) return (d.fields as string[]).join(", ");
    if (typeof d.count === "number") return `${d.count} rows`;
    if (d.link) return `link ${d.link}`;
    if (d.name) return String(d.name);
    if (d.from && d.to) {
      const from = d.from as Record<string, unknown>;
      const to = d.to as Record<string, unknown>;
      return `${from.roomNumber ?? "—"} → ${to.roomNumber ?? "—"}`;
    }
    if (typeof d.roomNumber === "string") return d.roomNumber;
    return Object.keys(d).join(", ");
  } catch {
    return "";
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/audit?limit=80");
      const json = await res.json();
      if (json?.status === "ok") {
        setEvents(json.events);
        setTotal(json.total);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-cream">Activity</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-smoke">
            Every configuration change, newest first. {total} event{total === 1 ? "" : "s"} recorded.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="rounded-full border border-line-strong px-4 py-2 font-mono-nums text-[10px] tracking-[0.14em] text-smoke transition-colors hover:border-acid/50 hover:text-acid disabled:opacity-50"
        >
          {busy ? "REFRESHING…" : "REFRESH"}
        </button>
      </div>

      <ol className="mt-5 space-y-1.5">
        {events.map((e) => {
          const extra = summarise(e);
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-ink-2/40 px-3.5 py-2.5"
            >
              <span
                className={`rounded-md border px-2 py-0.5 font-mono-nums text-[9px] tracking-[0.12em] ${
                  TONE[e.action] ?? "border-line text-faint"
                }`}
              >
                {e.action.toUpperCase()}
              </span>
              <span className="text-[13px] text-cream">{e.entity}</span>
              {e.entityId && (
                <span className="font-mono-nums text-[12px] text-acid">{e.entityId}</span>
              )}
              {extra && (
                <span className="truncate font-mono-nums text-[11px] text-smoke">{extra}</span>
              )}
              <span className="ml-auto font-mono-nums text-[10px] tracking-[0.1em] text-faint">
                {new Date(e.at).toLocaleString()}
              </span>
            </li>
          );
        })}
        {!events.length && (
          <li className="py-8 text-center font-mono-nums text-[10px] tracking-[0.18em] text-faint">
            {busy ? "LOADING…" : "NO ACTIVITY YET. CHANGES YOU MAKE WILL APPEAR HERE."}
          </li>
        )}
      </ol>
    </div>
  );
}
