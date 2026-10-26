/**
 * Two hero mechanisms, both pure functions.
 *
 * RING  — cards stand on the inside of a cylinder. The loader stacks them at the
 *         front (one card), then deals them around the ring. Opening does not
 *         move the cards to a new scene; it changes the camera (radius, tilt,
 *         roll, perspective) and the cards stay put.
 *
 * WHEEL — cards sit on a full circle around a pivot BELOW the hero, so only the
 *         top of the wheel is ever visible. That reads as a fan but has no ends,
 *         so it can turn forever without a seam. They arrive face-down, flip
 *         face-up mid-flight, then the whole wheel lifts.
 *
 * Both are driven by two numbers only. Keeping the maths pure and separate from
 * the DOM is deliberate: it is the part worth testing on its own.
 */

export const wrap180 = (a: number) => (((a + 180) % 360) + 360) % 360 - 180;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const outCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const span = (v: number, a: number, b: number) => clamp01((v - a) / (b - a || 1));

/* ------------------------------------------------------------------ RING --- */

export const RING_SLOTS = 16;
/** Share of the formation each card spends travelling; the rest is stagger. */
export const RING_DEAL = 0.3;

export interface RingScene {
  radius: number;
  perspective: number;
  tilt: number;
  roll: number;
  scale: number;
}

/** Where the ring sits when the loader is at 0 and the hero at 1. */
export const RING_START: RingScene = {
  radius: 460,
  perspective: 1000,
  tilt: -22,
  roll: -20,
  scale: 0.52,
};
export const RING_END: RingScene = {
  // radius is set so the cards nearest the screen edges land ON those edges:
  // at R=2000 with perspective 450 the ring reaches x = ±viewport/2 around
  // 68 degrees, so everything past that is off-screen and the arc reads as
  // full bleed. scale is raised to keep the apparent card size the same as it
  // was at the smaller radius.
  radius: 2000,
  perspective: 450,
  tilt: 0,
  roll: 0,
  scale: 3.0,
};

export function ringScene(expansion: number, camera = RING_END.perspective): RingScene {
  const e = clamp01(expansion);
  return {
    radius: RING_START.radius + (RING_END.radius - RING_START.radius) * e,
    perspective: RING_START.perspective + (camera - RING_START.perspective) * e,
    tilt: RING_START.tilt * (1 - e),
    roll: RING_START.roll * (1 - e),
    // squared so the cards stay small for the first half and swell at the end,
    // which is what makes it feel like the camera drops into the ring
    scale: RING_START.scale + (RING_END.scale - RING_START.scale) * e * e,
  };
}

export function ringAngle(slot: number, angle: number, slots = RING_SLOTS) {
  return wrap180((slot * 360) / slots + angle);
}

export interface RingPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  appear: number;
}

export function ringPose(angle: number, formation: number, scene: RingScene): RingPose {
  const around = (((angle + 180) % 360) + 360) % 360;
  const order = around / 360;
  const t = span(formation, order * (1 - RING_DEAL), order * (1 - RING_DEAL) + RING_DEAL);
  const dealt = outCubic(t);
  const placed = -180 + around * dealt;
  const r = (placed * Math.PI) / 180;
  const radius = scene.radius - (1 - dealt) * order * 24;
  return {
    x: -Math.sin(r) * radius,
    y: 0,
    z: -Math.cos(r) * radius,
    yaw: placed,
    appear: Math.min(1, t * 2.5),
  };
}

/* ----------------------------------------------------------------- WHEEL --- */

export interface WheelPose {
  transform: string;
  visible: boolean;
  away: number;
  home: number;
  p: number;
}

export function wheelPose(
  i: number,
  n: number,
  spin: number,
  deal: number,
  lift: number,
): WheelPose {
  const step = 360 / n;
  const home = wrap180(i * step - spin);
  const away = Math.abs(home);
  // ordered by distance from the top, so the deal spreads outward from the
  // middle and reads symmetrical
  const order = Math.min(away, 100) / 100;
  const p = outCubic(span(deal, order * 0.6, order * 0.6 + 0.4));

  // a bigger wheel needs a lower pivot to keep the top card in frame
  const radius = 580 + 430 * lift;
  const pivot = 500 + 314 * lift;
  const grow = 1 + 0.35 * lift;

  const transform =
    `translate3d(0, ${pivot.toFixed(1)}px, ${(-away * 0.5).toFixed(1)}px)` +
    ` rotateZ(${(home + (1 - p) * 70).toFixed(2)}deg)` +
    ` translate3d(0, ${(-radius * p + (1 - p) * 140).toFixed(1)}px, 0)` +
    ` rotateY(${((1 - p) * 180).toFixed(1)}deg)` +
    ` scale(${((0.7 + 0.3 * p) * grow).toFixed(3)})`;

  return { transform, visible: p > 0 && away < 105, away, home, p };
}
