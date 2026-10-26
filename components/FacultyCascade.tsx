"use client";

import { useEffect, useRef, useState } from "react";

export interface CascadeFaculty {
  id: number;
  name: string;
  subject: string | null;
  mobile: string | null;
  photo: string | null;
  section: string | null;
  role: string;
}

/**
 * Faculty deck — scroll-driven stack.
 *
 * Model: a continuous `head` runs 0..n-1 with the scroll. Each card reads
 * `t = head - i`:
 *
 *   t < 0  stacked behind — upright, straight, offset up so only a thin edge
 *          of each card shows. This is a hint that more cards exist, not a fan.
 *   t = 0  the front card — centred and perfectly straight, the one being read.
 *   t > 0  leaving — sinks smoothly downward, shrinking and defocusing, rather
 *          than hinging forward.
 *
 * The active card's details animate in on the right each time it changes.
 *
 * Depth is CSS only (transform + filter). No WebGL.
 */

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t: number) =>
  clamp(t) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const DESKTOP = {
  cardSize: 0.28,
  cardRatio: 1.18,
  deckX: 46,
  peek: 0.075,
  stackScale: 0.022,
  stackVisible: 3.4,
  sink: 0.62,
  sinkScale: 0.1,
  scrollPerCard: 24,
};

const MOBILE = {
  cardSize: 0.62,
  cardRatio: 1.24,
  deckX: 50,
  peek: 0.05,
  stackScale: 0.02,
  stackVisible: 3.0,
  // On phones the front card must clear the detail panel below it. A long sink
  // forced the card to shrink to fit; a short one keeps the cards full size and
  // still reads as "sinking away" alongside the fade and blur.
  sink: 0.25,
  sinkScale: 0.1,
  scrollPerCard: 30,
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function FacultyCascade({ items }: { items: CascadeFaculty[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const detailRef = useRef<HTMLDivElement>(null);
  const panelHRef = useRef(0);
  const panelTopRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  const n = items.length;

  useEffect(() => {
    if (!n) return;
    const section = sectionRef.current;
    if (!section) return;
    let raf = 0;
    let head = 0;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const apply = (h: number) => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const mobile = vw < 900;
      const cfg = mobile ? MOBILE : DESKTOP;

      // Detail-panel height and its top edge inside the pinned scene.
      const panelH = panelHRef.current || vh * 0.32;
      const panelTop = panelTopRef.current || vh * 0.88 - panelH;

      let cardW: number;
      let cardH: number;
      let peek: number;
      let stackH: number;
      let totalH: number;
      let originY: number;

      if (mobile) {
        // Keep the cards at full size — shrinking them was the wrong fix. The
        // card is positioned by its BOTTOM edge (originY) and grows upward, so
        // the only thing that has to clear the panel is the sink travel below
        // it. Place the deck as low as that allows, and if the screen is too
        // short for the stack, let the TOP clip rather than shrink the card.
        const topInset = vh * 0.04;
        const gap = Math.max(10, vh * 0.018);
        const sinkFactor = cfg.sink;
        const maxH = vh * 0.52;
        cardW = Math.min(cfg.cardSize * vw, maxH / cfg.cardRatio);
        cardH = cardW * cfg.cardRatio;
        peek = cardH * cfg.peek;
        stackH = peek * Math.min(cfg.stackVisible, 3);
        totalH = cardH + stackH;

        const minOrigin = topInset + totalH;
        const maxOrigin = panelTop - gap - cardH * sinkFactor;
        originY = maxOrigin >= minOrigin ? (minOrigin + maxOrigin) / 2 : maxOrigin;
      } else {
        const maxH = vh * 0.52;
        cardW = Math.min(cfg.cardSize * vw, maxH / cfg.cardRatio);
        cardH = cardW * cfg.cardRatio;
        peek = cardH * cfg.peek;
        stackH = peek * Math.min(cfg.stackVisible, 3);
        totalH = cardH + stackH;
        originY = Math.min(Math.max((vh + totalH) / 2, vh * 0.1 + totalH), vh * 0.94);
      }
      const centerY = originY - cardH / 2;

      section.style.setProperty("--fc-w", `${cardW.toFixed(2)}px`);
      section.style.setProperty("--fc-h", `${cardH.toFixed(2)}px`);
      section.style.setProperty("--fc-deck-x", `${cfg.deckX}%`);
      section.style.setProperty("--fc-origin", `${originY.toFixed(1)}px`);
      section.style.setProperty("--fc-center", `${centerY.toFixed(1)}px`);

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const t = h - i;
        let y: number, z: number, sc: number, op: number, blur: number, rot: number;

        if (t <= 0) {
          // stacked behind: straight, upright, only a thin edge showing.
          // Pushed back in Z so preserve-3d sorts them correctly — coplanar
          // cards fall back to DOM order and the stack renders inside out.
          const d = Math.min(-t, cfg.stackVisible + 1);
          y = -peek * d;
          z = -26 * d;
          sc = 1 - cfg.stackScale * d;
          op = 1 - smoothstep(cfg.stackVisible - 0.8, cfg.stackVisible + 0.6, -t);
          blur = 0;
          rot = 0;
        } else {
          // Leaving: a smooth sink, shrinking and defocusing as it goes.
          // Completes in ~55% of a card step so the outgoing card has cleared
          // before the counter advances — otherwise the counter, the panel and
          // the front card's own index disagree mid-transition.
          const k = clamp(t / 0.55);
          const e = easeInOutCubic(k);
          y = cardH * cfg.sink * e;
          z = -70 * e;
          sc = 1 - cfg.sinkScale * e;
          op = 1 - smoothstep(0.3, 1.0, k);
          blur = 7 * smoothstep(0.15, 0.85, k);
          rot = 4 * e;
        }

        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
        el.style.opacity = op.toFixed(3);
        el.style.zIndex = String(1000 - Math.max(0, Math.round(-t)));
        el.style.visibility = op < 0.004 ? "hidden" : "visible";
        el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
        el.style.pointerEvents = op > 0.92 && Math.abs(t) < 0.5 ? "auto" : "none";
      }

      const idx = Math.round(clamp(h, 0, n - 1));
      const p = n > 1 ? clamp(h / (n - 1)) : 0;
      if (fillRef.current) {
        fillRef.current.style.height = mobile ? "100%" : `${(p * 100).toFixed(2)}%`;
        fillRef.current.style.width = mobile ? `${(p * 100).toFixed(2)}%` : "100%";
      }
      if (dotRef.current && trackRef.current) {
        dotRef.current.style.transform = mobile
          ? `translate(${(p * trackRef.current.clientWidth).toFixed(1)}px, -50%)`
          : `translateY(${(p * trackRef.current.clientHeight).toFixed(1)}px)`;
      }
      setActive((cur) => (cur === idx ? cur : idx));
    };

    const frame = () => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const rect = section.getBoundingClientRect();
      if (rect.bottom < -300 || rect.top > window.innerHeight + 300) return;
      const dist = section.offsetHeight - window.innerHeight;
      const p = clamp(dist > 0 ? -rect.top / dist : 0);
      const target = p * Math.max(1, n - 1);
      head = reduced ? target : head + (target - head) * 0.12;
      if (Math.abs(target - head) < 0.0004) head = target;
      apply(head);
    };

    const onResize = () => apply(head);
    // Run once up front: the card dimensions come from apply(), and the loop
    // below skips work while the deck is off-screen. Without this the cards had
    // no width or height until the deck scrolled into view.
    apply(head);
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [n]);

  // keep the reserved panel height in step with the real element
  useEffect(() => {
    const measure = () => {
      const el = detailRef.current;
      const pin = sectionRef.current?.querySelector(".fc__pin");
      if (!el) return;
      const pr = el.getBoundingClientRect();
      panelHRef.current = pr.height;
      // Panel top measured *inside the pinned scene*. Doing it this way avoids
      // mixing svh (the pin is 100svh) with vh (the panel is offset by 12vh),
      // which is what made the reserve wrong on some Android viewports.
      if (pin) panelTopRef.current = pr.top - pin.getBoundingClientRect().top;
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [active, n]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !n) return;
    const set = () => {
      const vh = window.innerHeight;
      const per = window.innerWidth < 900 ? MOBILE.scrollPerCard : DESKTOP.scrollPerCard;
      section.style.height = `${(vh + Math.max(1, n - 1) * (per / 100) * vh).toFixed(0)}px`;
    };
    set();
    window.addEventListener("resize", set, { passive: true });
    return () => window.removeEventListener("resize", set);
  }, [n]);

  if (!n) return null;
  const f = items[Math.min(active, n - 1)];

  return (
    <section ref={sectionRef} className="fc" aria-label="Faculty">
      <div className="fc__pin">
        <div className="fc__scene">
          <div className="fc__deck">
            {items.map((it, i) => (
              <article
                key={it.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className={`fc-card${active === i ? " is-lead" : ""}`}
                aria-label={`${i + 1} of ${n}: ${it.name}${it.subject ? `, ${it.subject}` : ""}`}
              >
                <div className="fc-card__art">
                  {it.photo && !broken[it.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.photo}
                      alt=""
                      onError={() => setBroken((b) => ({ ...b, [it.id]: true }))}
                    />
                  ) : (
                    <span className="fc-card__initials">{initials(it.name)}</span>
                  )}
                </div>
                <div className="fc-card__strip">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{it.role === "coordinator" ? "Coordinator" : "Faculty"}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* progress, far left so it never fights the detail panel */}
        <aside className="fc__rail" aria-hidden>
          <div className="fc__counter">
            <b>{String(active + 1).padStart(2, "0")}</b>
            <i>/{String(n).padStart(2, "0")}</i>
          </div>
          <div className="fc__track" ref={trackRef}>
            <div className="fc__fill" ref={fillRef} />
            <div className="fc__dot" ref={dotRef} />
          </div>
        </aside>

        {/* details for whichever card is at the front — remounts on change so
            the stagger replays every time */}
        <div className="fc__detail" ref={detailRef}>
          <div className="fc__d-inner" key={f.id}>
            <p className="fc__d-eyebrow">
              {f.role === "coordinator" ? "Class coordinator" : "Faculty"}
            </p>
            <h2 className="fc__d-name">{f.name}</h2>
            <p className="fc__d-subject">{f.subject ?? "Faculty member"}</p>
            <dl className="fc__d-facts">
              <div>
                <dt>Section</dt>
                <dd>{f.section ?? "First year"}</dd>
              </div>
              <div>
                <dt>Block</dt>
                <dd>AB1 · G1</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {f.mobile ? (
                    <a href={`tel:${f.mobile}`} className="fc__d-link">
                      Call
                    </a>
                  ) : (
                    "Via admin"
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
