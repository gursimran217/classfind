"use client";

import { useEffect, useRef, useState } from "react";
import { LOADER_PLATE_TALL, LOADER_PLATE_WIDE } from "@/lib/loader-plates";

const HOLD_MS = 520;
const HARD_CAP_MS = 7000;

/**
 * Full-bleed dot-matrix intro. The main gate is resolved into a light drawing
 * of dots on near-black that prints itself in — straight, edge to edge — while
 * a tabular counter tracks real asset progress. Two tuned variants: the wide
 * plate on desktop, the tall plate on phones, each covering its viewport
 * exactly so nothing is letterboxed or cropped.
 */
export default function FilmLoader({ progress, done }: { progress: number; done: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plateRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const verticalRef = useRef(false);
  const [phase, setPhase] = useState<"draw" | "fade" | "gone">("draw");
  const [pct, setPct] = useState(0);
  const [plateFailed, setPlateFailed] = useState(false);

  targetRef.current = Math.max(0, Math.min(1, progress));

  // 1. Build the dot plate. The source is inlined as a data URI, so the intro
  //    can never be starved by the frame requests it is covering.
  useEffect(() => {
    let cancelled = false;

    const build = async () => {
      try {
        const vertical = window.innerHeight > window.innerWidth;
        verticalRef.current = vertical;
        const img = new Image();
        img.src = vertical ? LOADER_PLATE_TALL : LOADER_PLATE_WIDE;
        await img.decode();
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Cell size drives dot density; the source only needs to be sampled at
        // roughly this resolution, which is why a small inline plate is enough.
        const cell = Math.max(5, Math.round(Math.min(vw, vh) / 78));
        const cols = Math.max(48, Math.floor(vw / cell));
        const rows = Math.max(48, Math.floor(vh / cell));

        const probe = document.createElement("canvas");
        probe.width = cols;
        probe.height = rows;
        const pctx = probe.getContext("2d");
        if (!pctx) throw new Error("probe context unavailable");
        // Cover the viewport: sample the same crop the final draw will use.
        const cover = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
        const sw = vw / cover;
        const sh = vh / cover;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        pctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
        const data = pctx.getImageData(0, 0, cols, rows).data;

        const plate = document.createElement("canvas");
        plate.width = Math.ceil(vw * dpr);
        plate.height = Math.ceil(vh * dpr);
        const ctx = plate.getContext("2d");
        if (!ctx) throw new Error("plate context unavailable");
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#f4f1ea";
        const base = cell * 0.34;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = (y * cols + x) * 4;
            const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
            // Dark structure becomes dense dots; the sky stays as negative space.
            const density = Math.pow(1 - lum, 0.8);
            if (density < 0.05) continue;
            ctx.globalAlpha = Math.min(0.92, density * 1.15);
            ctx.beginPath();
            ctx.arc(x * cell + cell / 2, y * cell + cell / 2, base * (0.5 + density * 0.75), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        plateRef.current = plate;
      } catch {
        if (!cancelled) setPlateFailed(true);
      }
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Draw loop: straight, axis-aligned print-in.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    let lastInt = -1;

    const frame = () => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      shownRef.current += (targetRef.current - shownRef.current) * 0.075;
      if (targetRef.current >= 1 && shownRef.current > 0.994) shownRef.current = 1;
      const t = shownRef.current;

      const asInt = Math.round(t * 100);
      if (asInt !== lastInt) {
        lastInt = asInt;
        setPct(asInt);
      }

      const plate = plateRef.current;
      if (plate && plate.width > 0) {
        const pw = plate.width / dpr;
        const ph = plate.height / dpr;
        const vertical = verticalRef.current;
        const span = vertical ? ph : pw;
        const soft = Math.max(40, span * 0.09);
        const travel = t * (span + soft);

        // solid pass
        ctx.save();
        ctx.beginPath();
        if (vertical) ctx.rect(0, 0, w, travel);
        else ctx.rect(0, 0, travel, h);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.drawImage(plate, 0, 0, pw, ph);
        ctx.restore();

        // soft leading edge
        ctx.save();
        ctx.beginPath();
        if (vertical) ctx.rect(0, travel - soft, w, soft);
        else ctx.rect(travel - soft, 0, soft, h);
        ctx.clip();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(plate, 0, 0, pw, ph);
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // 3. Dismissal is timeout-driven so it can never stall inside the draw loop.
  useEffect(() => {
    const id = window.setTimeout(() => setPhase((p) => (p === "draw" ? "fade" : p)), HARD_CAP_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setPhase((p) => (p === "draw" ? "fade" : p)), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [done]);

  useEffect(() => {
    if (phase !== "fade") return;
    const id = window.setTimeout(() => setPhase("gone"), 820);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[90] bg-[#0a0a0b] transition-opacity duration-700 ease-out ${
        phase === "fade" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* edge gradients so the crest and the counter stay legible over the dots */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0a0a0b] via-[#0a0a0b]/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/75 to-transparent" />

      {plateFailed && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="font-display text-[clamp(1.8rem,6vw,3.4rem)] tracking-[-0.02em] text-cream">
            G. L. Bajaj
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-5 pt-6 sm:px-10 sm:pt-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center border border-cream/25">
            <span className="font-display text-[15px] leading-none text-cream">GB</span>
          </span>
          <span className="text-[14px] font-semibold leading-[1.15] tracking-[-0.01em] text-cream">
            G.L. Bajaj
            <small className="mt-0.5 block font-mono-nums text-[9px] font-normal tracking-[0.2em] text-cream/50">
              INSTITUTIONS
            </small>
          </span>
        </div>
        <span className="hidden font-mono-nums text-[10px] tracking-[0.22em] text-cream/45 sm:block">
          KNOWLEDGE PARK III · GREATER NOIDA
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-10 sm:pb-8">
        <div className="flex items-end justify-between gap-4 border-t border-cream/15 pt-4">
          <span className="font-mono-nums text-[10px] tracking-[0.24em] text-cream/55">
            DRAWING THE CAMPUS
          </span>
          <span className="font-mono-nums text-[clamp(22px,3.2vw,40px)] leading-none tracking-[0.02em] text-cream">
            {String(pct).padStart(3, "0")}%
          </span>
        </div>
      </div>
    </div>
  );
}
