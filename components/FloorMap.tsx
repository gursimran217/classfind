"use client";

import type { ClassroomInfo } from "@/lib/types";

/**
 * Designed schematic route map — Campus → Building → Floor → Room.
 * Not a real geographic map; explicitly labeled as a schematic.
 */
export default function FloorMap({ classroom }: { classroom: ClassroomInfo }) {
  const steps = [
    { label: "Campus", detail: "GL Bajaj · Greater Noida", mark: "GLB" },
    { label: classroom.building ?? "Building", detail: "Academic building", mark: "B1" },
    { label: classroom.floorLabel ?? `${classroom.floor}F`, detail: "Take the stairs / lift", mark: `${classroom.floor}F` },
    { label: `Room ${classroom.roomNumber}`, detail: "Your classroom", mark: classroom.roomNumber ?? "—", isRoom: true },
  ];

  return (
    <div className="bg-grid-dense relative overflow-hidden rounded-2xl border border-line bg-ink-2/70 p-6">
      <div aria-hidden className="pointer-events-none absolute right-4 top-4 font-mono-nums text-[9px] tracking-[0.18em] text-faint/60">
        SCHEMATIC · NOT TO SCALE
      </div>

      <div className="relative flex flex-col gap-0">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border font-mono-nums text-[11px] font-semibold ${
                  s.isRoom
                    ? "border-acid/50 bg-acid text-[#101106]"
                    : "border-line-strong bg-panel text-cream"
                }`}
              >
                {s.mark}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden className="my-1 h-9 w-px bg-line-strong/70" />
              )}
            </div>
            <div className="pt-2.5">
              <p className={`text-[14px] font-semibold ${s.isRoom ? "text-acid" : "text-cream"}`}>
                {s.label}
              </p>
              <p className="text-[12px] text-smoke">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden className="relative mt-8">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div className="relative flex justify-between">
          {["N", "E", "S", "W"].map((d) => (
            <span key={d} className="font-mono-nums text-[9px] tracking-[0.2em] text-faint/60">
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}