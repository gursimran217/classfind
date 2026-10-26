"use client";

import { useEffect, useRef, useState } from "react";
import {
  RING_SLOTS,
  clamp01,
  ringAngle,
  ringPose,
  ringScene,
  wheelPose,
  wrap180,
} from "@/lib/deck-pose";

const FORM_MS = 2600;
const OPEN_MS = 1900;
const SPIN_DEG_PER_SEC = 7;

/**
 * One hero, two mechanisms. Same cover set in both so the comparison is fair.
 *
 * mode="ring"  loader stacks the cards into one, deals them around a cylinder,
 *              then opens the camera out. Cards never move to a second scene.
 * mode="deal"  cards arrive face-down, flip face-up into a fan that is really a
 *              wheel, then the whole wheel lifts and starts turning.
 *
 * Two numbers drive everything: formation and expansion. Drag and wheel only
 * move a target angle; the visible angle chases it so it never snaps.
 */
export default function DeckHero({
  mode,
  covers,
  title,
  blurb,
  embedded = false,
}: {
  mode: "ring" | "deal";
  covers: string[];
  title?: string;
  blurb?: string;
  embedded?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const written = useRef(new Map<string, string>());

  const [pct, setPct] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const n = covers.length;
  const slots = mode === "ring" ? RING_SLOTS : n;

  // motion values live in refs; nothing here re-renders
  const mv = useRef({ formation: 0, expansion: 0, angle: 0, target: 0, dragging: false, px: 0 });

  /* ---- real asset progress: decode every cover before the deal starts ---- */
  useEffect(() => {
    let live = true;
    let done = 0;
    let cancelled = false;
    covers.forEach((src) => {
      const img = new Image();
      img.src = src;
      const tick = () => {
        if (!live) return;
        done += 1;
        setPct(Math.round((done / covers.length) * 100));
        if (done >= covers.length) setAssetsReady(true);
      };
      img.decode().then(tick).catch(tick);
    });
    const safety = window.setTimeout(() => {
      if (live) {
        cancelled = true;
        setAssetsReady(true);
      }
    }, 6000);
    return () => {
      live = false;
      window.clearTimeout(safety);
      void cancelled;
    };
  }, [covers]);

  /* ---- reduced motion / skip ---- */
  const finish = () => {
    mv.current.formation = 1;
    mv.current.expansion = 1;
    mv.current.target = mv.current.angle;
    setSkipped(true);
    setPct(100);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") finish();
    };
    window.addEventListener("keydown", onKey);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- drag / wheel: they only move a target angle ---- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      mv.current.dragging = true;
      mv.current.px = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!mv.current.dragging) return;
      const dx = e.clientX - mv.current.px;
      mv.current.px = e.clientX;
      mv.current.target += dx * 0.35;
    };
    const onUp = () => {
      mv.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      mv.current.target += e.deltaY * 0.25;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  /* ---- the single frame loop ---- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let t0 = performance.now();
    let opened = false;
    let disposed = false;

    const write = (key: string, value: string, el: HTMLElement | null, prop: string) => {
      if (!el) return;
      if (written.current.get(key) === value) return;
      written.current.set(key, value);
      el.style.setProperty(prop, value);
    };

    const frame = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const stage = stageRef.current;
      const ring = ringRef.current;
      if (!stage || !ring) return;

      // formation always runs its full length, so the loader never flashes by
      mv.current.formation = clamp01((now - t0) / FORM_MS);
      if (mv.current.formation >= 1 && assetsReady && !opened) {
        opened = true;
        setOpen(true);
        t0 = now;
      }
      if (opened) {
        mv.current.expansion = clamp01((now - t0) / OPEN_MS);
        if (mv.current.expansion >= 1) {
          mv.current.target += SPIN_DEG_PER_SEC * dt * mv.current.expansion;
        }
      }
      // exponential follow, frame-rate independent
      mv.current.angle += (mv.current.target - mv.current.angle) * (1 - Math.exp(-dt * 9));

      const formation = mv.current.formation;
      const expansion = mv.current.expansion;
      const angle = mv.current.angle;

      if (mode === "ring") {
        const scene = ringScene(expansion);
        write("--dh-persp", `${scene.perspective.toFixed(0)}px`, stage, "--dh-persp");
        write("--dh-tilt", `${scene.tilt.toFixed(2)}deg`, stage, "--dh-tilt");
        write("--dh-roll", `${scene.roll.toFixed(2)}deg`, stage, "--dh-roll");
        for (let i = 0; i < n; i++) {
          const el = cardRefs.current[i];
          if (!el) continue;
          const a = ringAngle(i % slots, angle, slots);
          const p = ringPose(a, formation, scene);
          const t =
            `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, ${p.z.toFixed(1)}px)` +
            ` rotateY(${p.yaw.toFixed(2)}deg) scale(${scene.scale.toFixed(3)})`;
          write(`${i}-t`, t, el, "transform");
          write(`${i}-o`, p.appear.toFixed(3), el, "opacity");
          write(`${i}-v`, p.appear < 0.02 ? "hidden" : "visible", el, "visibility");
        }
      } else {
        const lift = expansion;
        write(
          "--dh-stage",
          `translateY(${(60 - 10 * lift).toFixed(1)}px) rotateX(${(12 * lift).toFixed(2)}deg) scale(${(1 + 0.14 * lift).toFixed(3)})`,
          stage,
          "--dh-stage",
        );
        for (let i = 0; i < n; i++) {
          const el = cardRefs.current[i];
          if (!el) continue;
          const p = wheelPose(i, slots, angle, formation, lift);
          write(`${i}-t`, p.transform, el, "transform");
          write(`${i}-v`, p.visible ? "visible" : "hidden", el, "visibility");
          write(`${i}-o`, p.p >= 1 ? "1" : "0.999", el, "opacity");
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [mode, n, slots, assetsReady]);

  return (
    <div className="dh" data-mode={mode} data-open={open ? "1" : "0"} data-embed={embedded ? "1" : "0"}>
      <div className="dh__stage" ref={stageRef}>
        <div className="dh__ring" ref={ringRef}>
          {covers.map((src, i) => (
            <a
              key={src + i}
              href="#"
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="dh__card"
              aria-label={`Campus scene ${i + 1} of ${n}`}
              onClick={(e) => e.preventDefault()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
              <span className="dh__back" aria-hidden>
                <span>CF</span>
              </span>
            </a>
          ))}
        </div>
      </div>

      {!embedded && (
        <div className="dh__chrome">
          <span className="dh__brand">CLASSFIND</span>
          <div className="dh__copy">
            <p className="dh__eyebrow">GL Bajaj · campus reel</p>
            <h1 className="dh__title">{title}</h1>
            <p className="dh__blurb">{blurb}</p>
          </div>
        </div>
      )}

      <div className="dh__hud" hidden={skipped && open}>
        <span className="dh__caption">Loading reels</span>
        <span className="dh__counter">
          <b>{String(pct).padStart(3, "0")}</b>%
        </span>
        <button type="button" className="dh__skip" onClick={finish}>
          Skip
        </button>
      </div>
    </div>
  );
}

export { wrap180 };
