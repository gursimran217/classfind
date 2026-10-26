"use client";

import { useEffect, useMemo, useState } from "react";

export interface CoverageSection {
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

interface FloorGroup {
  floor: number;
  sections: CoverageSection[];
  students: number;
  mapped: number;
  linked: number;
}
interface BuildingGroup {
  building: string;
  floors: FloorGroup[];
}

type Load = { totals: { sections: number; mapped: number; linked: number; students: number }; buildings: BuildingGroup[] } | null;

/** Coverage state drives the chip colour. */
function stateOf(s: CoverageSection): "ready" | "partial" | "missing" {
  if (!s.active) return "missing";
  if (s.roomNumber && s.hasLink) return "ready";
  if (s.roomNumber) return "partial";
  return "missing";
}

const CHIP: Record<string, string> = {
  ready: "border-acid/45 bg-acid/12 text-acid",
  partial: "border-amber/45 bg-amber/12 text-amber",
  missing: "border-rose/40 bg-rose/10 text-rose",
};

const DOT: Record<string, string> = {
  ready: "bg-acid",
  partial: "bg-amber",
  missing: "bg-rose",
};

export default function CoverageMap() {
  const [data, setData] = useState<Load>(null);
  const [tilt, setTilt] = useState(16);
  const [spread, setSpread] = useState(1);
  const [selected, setSelected] = useState<CoverageSection | null>(null);
  const [building, setBuilding] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/coverage")
      .then((r) => r.json())
      .then((j) => {
        if (!live || j?.status !== "ok") return;
        setData({ totals: j.totals, buildings: j.buildings });
        setBuilding((b) => b ?? j.buildings?.[0]?.building ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const active = useMemo(
    () => data?.buildings.find((b) => b.building === building) ?? data?.buildings[0] ?? null,
    [data, building],
  );

  if (!data) {
    return (
      <div className="grid h-64 place-items-center rounded-2xl border border-line bg-panel/50">
        <p className="pulse-dot font-mono-nums text-[10px] tracking-[0.24em] text-faint">LOADING MAP…</p>
      </div>
    );
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono-nums text-[10px] tracking-[0.24em] text-faint">BLOCK COVERAGE · LIVE</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
            Floors stacked in depth. Click a section to inspect it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {data.buildings.length > 1 && (
            <div className="flex gap-1 rounded-full border border-line p-1">
              {data.buildings.map((b) => (
                <button
                  key={b.building}
                  onClick={() => setBuilding(b.building)}
                  className={`rounded-full px-3 py-1 font-mono-nums text-[10px] tracking-[0.14em] transition-colors ${
                    active?.building === b.building ? "bg-acid text-[#101106]" : "text-smoke hover:text-cream"
                  }`}
                >
                  {b.building.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2">
            <span className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">TILT</span>
            <input
              type="range"
              min={0}
              max={44}
              value={tilt}
              onChange={(e) => setTilt(Number(e.target.value))}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-line-strong accent-[#c9f25a]"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">DEPTH</span>
            <input
              type="range"
              min={0}
              max={2.4}
              step={0.1}
              value={spread}
              onChange={(e) => setSpread(Number(e.target.value))}
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-line-strong accent-[#c9f25a]"
            />
          </label>
        </div>
      </div>

      {/* overall meters */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "SECTIONS", value: data.totals.sections, pct: 100, tone: "bg-cream/70" },
          { label: "ROOM MAPPED", value: data.totals.mapped, pct: pct(data.totals.mapped, data.totals.sections), tone: "bg-acid" },
          { label: "INVITE LINK", value: data.totals.linked, pct: pct(data.totals.linked, data.totals.sections), tone: "bg-azure" },
          { label: "STUDENTS", value: data.totals.students, pct: 100, tone: "bg-cream/70" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-ink-2/40 p-3">
            <p className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">{m.label}</p>
            <p className="mt-1 font-mono-nums text-[20px] leading-none text-cream">{m.value}</p>
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
              <div className={`h-full ${m.tone}`} style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* 3D stack */}
        <div
          className="relative overflow-hidden rounded-xl border border-line bg-[radial-gradient(120%_90%_at_50%_0%,rgba(201,242,90,0.05),transparent_60%)] px-4 py-6"
          style={{ perspective: "1500px" }}
        >
          <div
            className="flex flex-col gap-2.5 transition-transform duration-300 ease-out"
            style={{ transformStyle: "preserve-3d", transform: `rotateX(${tilt}deg)` }}
          >
            {[...(active?.floors ?? [])].reverse().map((f, idx) => {
              const lift = idx * 10 * spread;
              return (
                <div
                  key={f.floor}
                  className="group/floor rounded-lg border border-line bg-ink-2/70 p-3 transition-transform duration-300 ease-out hover:border-line-strong"
                  style={{ transform: `translateZ(${-lift}px) translateY(${-lift * 0.35}px)` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono-nums text-[10px] tracking-[0.16em] text-cream-dim">
                      F{f.floor}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono-nums text-[9px] tracking-[0.14em] text-faint">
                      {f.mapped}/{f.sections.length} MAPPED · {f.students} STU
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {f.sections.map((s) => {
                      const st = stateOf(s);
                      const on = selected?.sectionCode === s.sectionCode;
                      return (
                        <button
                          key={s.sectionCode}
                          onClick={() => setSelected(on ? null : s)}
                          title={`${s.sectionCode} · ${s.roomNumber ?? "no room"} · ${s.students} students`}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono-nums text-[10px] tracking-[0.06em] transition-all duration-200 hover:-translate-y-[2px] ${CHIP[st]} ${
                            on ? "ring-1 ring-cream/50" : ""
                          }`}
                          style={{ transform: `translateZ(${on ? 18 : 0}px)` }}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${DOT[st]}`} />
                          {s.sectionCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!active?.floors.length && (
              <p className="font-mono-nums text-[10px] tracking-[0.18em] text-faint">NO SECTIONS IN THIS BLOCK.</p>
            )}
          </div>
        </div>

        {/* inspector */}
        <div className="rounded-xl border border-line bg-ink-2/40 p-4">
          {selected ? (
            <div className="anim-fadein">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono-nums text-[9px] tracking-[0.2em] text-faint">SECTION</p>
                  <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-cream">
                    {selected.sectionCode}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-md border border-line px-2 py-1 font-mono-nums text-[9px] tracking-[0.12em] text-faint hover:text-cream"
                >
                  CLOSE
                </button>
              </div>

              <dl className="mt-4 space-y-2.5">
                {[
                  ["ROOM", selected.roomNumber ?? "— not set"],
                  ["FLOOR", selected.floor != null ? `F${selected.floor}` : "—"],
                  ["BLOCK", selected.building ?? "—"],
                  ["STUDENTS", String(selected.students)],
                  ["MAPPING", selected.mappingStatus ?? "seed"],
                  ["INVITE LINK", selected.hasLink ? "configured" : "missing"],
                  ["GROUP CREATED", selected.groupCreated ? "yes" : "no"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2">
                    <dt className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">{k}</dt>
                    <dd className="text-right text-[12.5px] text-cream-dim">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex gap-2">
                <a
                  href={`/api/admin/export?kind=sections`}
                  className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-center font-mono-nums text-[10px] tracking-[0.12em] text-smoke transition-colors hover:border-acid/50 hover:text-acid"
                >
                  EXPORT CSV
                </a>
              </div>
              <p className="mt-3 font-mono-nums text-[9px] leading-relaxed tracking-[0.12em] text-faint">
                EDIT THIS SECTION UNDER THE SECTIONS TAB.
              </p>
            </div>
          ) : (
            <div className="flex h-full min-h-[180px] flex-col justify-between">
              <div>
                <p className="font-mono-nums text-[9px] tracking-[0.2em] text-faint">INSPECTOR</p>
                <p className="mt-2 text-[13px] leading-relaxed text-smoke">
                  Select a section chip to see its room, floor, student count and invite state.
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  ["ready", "Room + invite link"],
                  ["partial", "Room only"],
                  ["missing", "Needs work"],
                ].map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
                    <span className="font-mono-nums text-[10px] tracking-[0.12em] text-faint">
                      {label.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
