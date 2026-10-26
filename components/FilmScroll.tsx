"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FilmLoader from "@/components/FilmLoader";

// Frame counts differ per orientation: the 16:9 master is 15.25s and the 9:16
// master is 15.00s, both at 12fps. See public/film3/manifest.json.
const FRAME_COUNT: Record<string, number> = { d: 183, m: 180 };
// Frames the stage needs before it can scrub, and frames the intro loader waits
// for before handing off. The rest keep streaming in behind the film.
const PRELOAD_FIRST = 1;
const PRELOAD_TARGET = 32;

// Scene windows in scroll progress (0..1), matching the master timeline:
// gate | clouds | student | clouds | classroom
const SCENES = [
  { id: "gate", from: 0.0, to: 0.16 },
  { id: "cloud-a", from: 0.16, to: 0.26 },
  { id: "student", from: 0.26, to: 0.58 },
  { id: "cloud-b", from: 0.58, to: 0.68 },
  { id: "classroom", from: 0.68, to: 1.0 },
];

function fmt(n: number) {
  return String(Math.round(n)).padStart(3, "0") + "%";
}

export default function FilmScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);

  const framesRef = useRef<Array<HTMLImageElement | null>>([]);
  const currentRef = useRef(-1);
  const lastIndexRef = useRef(-1);
  const rafRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [pct, setPct] = useState(0);
  const [scene, setScene] = useState("gate");

  const draw = useCallback((canvas: HTMLCanvasElement | null, img: HTMLImageElement) => {
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // Not laid out yet: report failure so the caller retries after layout.
    if (w < 2 || h < 2) return false;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = w / h;
    let dw: number;
    let dh: number;
    if (cr > ir) {
      dw = w;
      dh = w / ir;
    } else {
      dh = h;
      dw = h * ir;
    }
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return true;
  }, []);

  const paint = useCallback(
    (index: number) => {
      lastIndexRef.current = index;
      if (index === currentRef.current) return;
      const nearest = framesRef.current[index];
      if (!nearest || !nearest.complete || !nearest.naturalWidth) return;
      // Only claim the frame once the pixels actually landed. Committing before
      // the draw meant a zero-sized canvas marked the frame done and the first
      // frame never appeared until a scroll changed the index.
      if (!draw(stageCanvasRef.current, nearest)) return;
      currentRef.current = index;
    },
    [draw],
  );

  useEffect(() => {
    const small = window.matchMedia("(max-width: 767px)").matches;
    const dir = small ? "m" : "d";
    const frames = FRAME_COUNT[dir] ?? 180;
    const list: Array<HTMLImageElement | null> = new Array(frames).fill(null);
    framesRef.current = list;

    let disposed = false;
    let loaded = 0;
    let stageReady = false;

    for (let i = 0; i < frames; i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = `/film3/${dir}/${String(i + 1).padStart(4, "0")}.jpg`;
      img.onload = () => {
        if (disposed) return;
        loaded++;
        if (loaded <= PRELOAD_TARGET) setLoadProgress(loaded / PRELOAD_TARGET);
        if (!stageReady && loaded >= PRELOAD_FIRST) {
          stageReady = true;
          setReady(true);
          paint(0);
        }
        // Any arriving frame may be the one the stage is waiting for.
        const want = lastIndexRef.current;
        if (want >= 0) paint(want);
      };
      list[i] = img;
    }

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const el = sectionRef.current;
        if (!el) return;
        const total = el.offsetHeight - window.innerHeight;
        const rect = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, total > 0 ? -rect.top / total : 0));
        setPct(p * 100);
        const idx = Math.round(p * (frames - 1));
        const found = SCENES.find((s) => p >= s.from && p < s.to);
        if (found) setScene((cur) => (cur === found.id ? cur : found.id));
        // Draw the requested frame; if it is still loading, fall back to the
        // closest ready one so the scrub never shows a blank stage.
        let pick = -1;
        for (let off = 0; off < frames; off++) {
          const a = idx - off;
          const b = idx + off;
          if (a >= 0 && list[a]?.complete) {
            pick = a;
            break;
          }
          if (b < frames && list[b]?.complete) {
            pick = b;
            break;
          }
        }
        if (pick >= 0) paint(pick);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [paint]);

  // Layout can settle after the first frames arrive. Repaint the requested
  // frame whenever the stage is measured, so the gate is never left blank.
  useEffect(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return;
    const repaint = () => {
      const idx = lastIndexRef.current;
      if (idx < 0) return;
      currentRef.current = -1;
      paint(idx);
    };
    const ro = new ResizeObserver(repaint);
    ro.observe(canvas);
    window.addEventListener("resize", repaint);
    const raf = requestAnimationFrame(repaint);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", repaint);
      cancelAnimationFrame(raf);
    };
  }, [paint]);

  // overlay opacity helpers: fade in/out inside each scene window
  const overlayStyle = (from: number, to: number, pad = 0.045) => {
    const p = pct / 100;
    const a = Math.min(1, Math.max(0, (p - from) / pad));
    const b = Math.min(1, Math.max(0, (to - p) / pad));
    const o = Math.min(a, b);
    return {
      opacity: o,
      transform: `translateY(${(1 - o) * 18}px)`,
      pointerEvents: o > 0.6 ? ("auto" as const) : ("none" as const),
    };
  };

  return (
    <>
      <FilmLoader progress={loadProgress} done={loadProgress >= 1} />
      <section
      ref={sectionRef}
      id="film"
      aria-label="GL Bajaj campus film"
      className="paper relative z-10 h-[620vh] w-full sm:h-[700vh]"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-paper">
        {/* the film fills the viewport at every size: 16:9 on desktop, 9:16 on phones */}
        <div className="film-stage absolute inset-0 overflow-hidden">
          <canvas ref={stageCanvasRef} className="h-full w-full" />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center bg-paper">
              <div className="film-loading" />
            </div>
          )}
        </div>



        {/* mobile scrim so copy stays legible over the film */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-56 bg-gradient-to-t from-paper via-paper/75 to-transparent md:hidden"
        />

        {/* scene readout: bottom-left on phones (clears the header), top-left on desktop */}
        <div className="pointer-events-none absolute bottom-6 left-4 z-20 flex items-center gap-2.5 md:bottom-auto md:left-6 md:top-6">
          <span className="h-1.5 w-1.5 rounded-full bg-carbon" />
          <span className="font-mono-nums text-[12px] tracking-[0.22em] text-carbon/85">
            {scene.replace("-", " ").toUpperCase()}
          </span>
        </div>

        {/* counter: bottom-right on phones, top-right on desktop */}
        <div className="pointer-events-none absolute bottom-6 right-4 z-20 font-mono-nums text-[12px] tracking-[0.22em] text-carbon/85 md:bottom-auto md:right-6 md:top-6">
          {fmt(pct)}
        </div>

        {/* copy overlays */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* 1. gate */}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-24 sm:px-10 sm:pb-20 md:bottom-auto md:left-6 md:top-[20%] md:max-w-[430px] md:translate-y-0 md:px-0 md:pb-0">
            <div style={overlayStyle(-1, 0.125)} className="film-copy">
              <p className="film-eyebrow">GL BAJAJ INSTITUTE OF TECHNOLOGY &amp; MANAGEMENT</p>
              <h2 className="film-title">
                Find your class.
                <br />
                <em>Know where to go.</em>
              </h2>
              <p className="film-sub">
                The whole campus, one continuous take. Scroll to walk from the main gate to your
                classroom.
              </p>
            </div>
          </div>

          {/* 2. student */}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-24 sm:px-10 sm:pb-20 md:bottom-auto md:left-6 md:top-[20%] md:max-w-[430px] md:translate-y-0 md:px-0 md:pb-0">
            <div style={overlayStyle(0.28, 0.5)} className="film-copy">
              <p className="film-eyebrow">FIRST YEAR · B.TECH</p>
              <h2 className="film-title">
                Everything you need
                <br />
                <em>before day one.</em>
              </h2>
              <p className="film-sub">
                Your section, roll number, classroom and building, verified against the admission
                records.
              </p>
            </div>
          </div>

          {/* 3. classroom */}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-24 sm:px-10 sm:pb-20 md:bottom-auto md:left-6 md:top-[20%] md:max-w-[430px] md:translate-y-0 md:px-0 md:pb-0">
            <div style={overlayStyle(0.68, 0.93)} className="film-copy">
              <p className="film-eyebrow">FROM THE GATE TO YOUR CLASSROOM</p>
              <h2 className="film-title">
                The right block,
                <br />
                <em>the right floor.</em>
              </h2>
              <p className="film-sub">
                Every first-year section is mapped to its exact classroom — building, floor and
                room — verified against the official records.
              </p>
            </div>
          </div>
        </div>

        {/* scroll hint, only at the very start */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center transition-opacity duration-500 md:bottom-6"
          style={{ opacity: pct < 3 ? 1 : 0 }}
        >
          <span className="font-mono-nums text-[12px] tracking-[0.3em] text-carbon/80">
            SCROLL ↓
          </span>
        </div>
      </div>
    </section>
    </>
  );
}

