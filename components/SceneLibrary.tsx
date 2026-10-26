"use client";

import { useMemo, useState } from "react";

export type Scene = {
  slug: string;
  title: string;
  tag: string;
  category: "overview" | "entry" | "academic" | "campus";
  text: string;
};

const TABS: Array<{ id: "all" | Scene["category"]; label: string }> = [
  { id: "all", label: "All scenes" },
  { id: "overview", label: "Overview" },
  { id: "entry", label: "Entry" },
  { id: "academic", label: "Academic" },
  { id: "campus", label: "Campus life" },
];

export default function SceneLibrary({ scenes }: { scenes: Scene[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const visible = useMemo(
    () => (tab === "all" ? scenes : scenes.filter((s) => s.category === tab)),
    [scenes, tab],
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label="Scene categories"
        className="scene-tabs mb-8 flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((t) => {
          const count = t.id === "all" ? scenes.length : scenes.filter((s) => s.category === t.id).length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`scene-chip shrink-0 rounded-full border px-4 py-2 font-mono-nums text-[11px] tracking-[0.14em] transition-colors ${
                active
                  ? "border-acid bg-acid text-[#101106]"
                  : "border-line-strong text-smoke hover:border-acid-line hover:text-cream"
              }`}
            >
              {t.label.toUpperCase()}
              <span className={`ml-2 ${active ? "text-[#101106]/70" : "text-faint"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s, i) => (
          <article
            key={s.slug}
            className="scene-card anim-rise group overflow-hidden rounded-2xl border border-line bg-panel/60 transition-colors hover:border-acid-line"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-panel-2">
              <img
                src={`/scenes/${s.slug}.webp`}
                alt={`${s.title} — GL Bajaj campus scene`}
                loading="lazy"
                decoding="async"
                className="scene-img h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />
              <span className="absolute left-4 top-4 rounded-full border border-cream/20 bg-ink/60 px-2.5 py-1 font-mono-nums text-[10px] tracking-[0.16em] text-cream backdrop-blur">
                {s.tag.toUpperCase()}
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-cream">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-smoke">{s.text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
