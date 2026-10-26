"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

export interface Campus3DProps {
  roomNumber: string | null;
  floor: number | null;
  building: string | null;
  section: string;
  onExit?: () => void;
}

const MODEL_URL = "/model.glb";
const DRACO_DECODER = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";
const NUM_FLOORS = 4;
const TEAL = 0x00c2a8;

// Diagnostic: detect whether the page is reloading (iOS tab-kill = full reload)
// vs navigating, and log the exact moment the browser unloads.
if (typeof window !== "undefined") {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as { type?: string } | undefined;
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.(
      "[3d] nav type: " + (nav?.type ?? "n/a"),
    );
  } catch {
    /* ignore */
  }
}

function makeLabel(text: string, color: string, size = 64, bg?: string, border = false): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    // roundRect isn't supported on older mobile Safari/WebView — fall back to a plain rect.
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(8, 8, 624, 144, 26);
    } else {
      ctx.rect(8, 8, 624, 144);
    }
    ctx.fill();
    if (border) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(8, 8, 624, 144, 26);
      } else {
        ctx.rect(8, 8, 624, 144);
      }
      ctx.stroke();
    }
  }
  ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 320, 82);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  return sp;
}

function matchObjects(root: THREE.Object3D, re: RegExp): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (re.test(o.name)) out.push(o);
  });
  return out;
}

function bboxOf(objs: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const o of objs) {
    o.updateWorldMatrix(true, true);
    box.expandByObject(o);
  }
  return box;
}

// For areas made of several spread-out objects (hostel blocks, basketball
// courts), frame the LARGEST single object instead of the whole spread so the
// camera zooms into an actual building rather than empty space between them.
function largestBox(objs: THREE.Object3D[]): THREE.Box3 {
  let best = new THREE.Box3();
  let bestVol = -1;
  for (const o of objs) {
    const b = bboxOf([o]);
    const s = b.getSize(new THREE.Vector3());
    const v = s.x * s.y * s.z;
    if (v > bestVol) {
      bestVol = v;
      best = b;
    }
  }
  return best;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Bright, real-looking procedural sky (blue zenith -> warm horizon, clouds, sun).
function makeSky(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#315f90");
  grad.addColorStop(0.42, "#86aacb");
  grad.addColorStop(0.6, "#f7dfb2");
  grad.addColorStop(0.66, "#f3d49a");
  grad.addColorStop(0.72, "#9fb084");
  grad.addColorStop(1, "#61745c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // soft clouds
  ctx.globalAlpha = 0.5;
  ctx.filter = "blur(26px)";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, h * (0.15 + Math.random() * 0.3), 120 + Math.random() * 180, 24 + Math.random() * 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // sun glow at the horizon
  ctx.globalAlpha = 0.9;
  ctx.filter = "blur(44px)";
  ctx.fillStyle = "#ffe2a4";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.6, 110, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function Campus3DMap({ roomNumber, floor, building, section, onExit }: Campus3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<() => void>(() => {});
  const fullscreenRef = useRef(false);
  const navRef = useRef<(i: number) => void>(() => {});
  const zoomRef = useRef<(factor: number) => void>(() => {});
  const landmarksRef = useRef<Array<{ name: string; box: THREE.Box3 }>>([]);
  const autoRotateRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("LOADING 3D CAMPUS…");
  const [progress, setProgress] = useState(0);
  const [webglOk, setWebglOk] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [landmarks, setLandmarks] = useState<Array<{ name: string }>>([]);
  const [activeNav, setActiveNav] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const targetFloor = Math.min(Math.max(floor ?? 1, 1), NUM_FLOORS);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const test = document.createElement("canvas");
      if (!test.getContext("webgl2") && !test.getContext("webgl")) throw new Error("no webgl");
    } catch {
      setWebglOk(false);
      return;
    }

    const isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent);
    // Quality is identical on every platform. This flag is diagnostic only.
    try {
      sessionStorage.setItem("__cf_tour", "1");
    } catch {
      /* ignore */
    }
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.(`[3d] mount ${isIOS ? "iOS" : "web"}`);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] renderer created");
    // Full-quality sampling everywhere, capped at 2x for all platforms equally:
    // a 3x buffer costs 9x the fill rate for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", () =>
      (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] CONTEXT LOST"),
    );

    const scene = new THREE.Scene();

    // Bright, real full sky as the background (procedural) — always visible.
    scene.background = makeSky();
    scene.backgroundBlurriness = 0;
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] procedural sky ready");

    // HDR sky environment — the same sky.exr the reference uses, to light the
    // PBR materials (scene.environment). sky.exr is an OpenEXR file, so it needs
    // EXRLoader: RGBELoader cannot parse it and was silently falling back to
    // plain lights on every device.
    let pmrem: THREE.PMREMGenerator | null = null;
    const envFallback = () => {
      scene.add(new THREE.HemisphereLight(0xfff2e0, 0x9db4c8, 1.4));
      const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
      sun.position.set(160, 300, 200);
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    };
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      new EXRLoader().load(
        "/sky.exr",
        (exr) => {
          try {
            scene.environment = pmrem!.fromEquirectangular(exr).texture;
            scene.environmentIntensity = 1.15;
            (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] HDR environment applied");
          } catch {
            envFallback();
          }
          exr.dispose();
        },
        undefined,
        () => envFallback(),
      );
    } catch {
      envFallback();
    }

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 550);
    camera.position.set(230, 55, 95);

    // Pause the full-screen FlowWave background while the 3D map is active,
    // so the 22MB model + wave never compete for GPU memory on mobile.
    try {
      (window as unknown as { __flowPaused?: boolean }).__flowPaused = true;
    } catch {
      /* ignore */
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setStatus("RESTORING 3D VIEW…");
    };
    const onContextRestored = () => {
      // three.js re-uploads all GPU resources automatically on restore; do NOT
      // flip ready=false or the loader would show forever with no reload.
      setStatus("3D VIEW RESTORED");
      setTimeout(() => setStatus("LOADED"), 600);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    const controls = new OrbitControls(camera, renderer.domElement);
    // Reference-style orbit, but zoom ENABLED and tilt allowed within a safe
    // range (never below the horizon, so no empty void is ever revealed).
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.9;
    controls.autoRotate = true;
    controls.autoRotateSpeed = -0.9;
    controls.minDistance = 10;
    controls.maxDistance = 480;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.4; // ~75°, then LOCKED after load so it never tilts down
    controls.target.set(0, 0, 0);
    controls.update();
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] camera and controls ready");
    // If the user starts dragging, cancel any in-progress camera fly so the
    // two never fight each other.
    controls.addEventListener("start", () => {
      tween = null;
    });

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    window.addEventListener("resize", onResize);

    let cancelled = false;
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER);
    loader.setDRACOLoader(draco);
    let lastProgressCheckpoint = 0;

    // smooth "home" reset
    let tween: {
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromTgt: THREE.Vector3;
      toTgt: THREE.Vector3;
      t: number;
      dur: number;
    } | null = null;
    let colliderBoxes: THREE.Box3[] = [];
    homeRef.current = () => {
      // "Home" = take me back: leave fullscreen first, then exit the 3D view.
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      if (fullscreenRef.current) {
        setFullscreen(false);
        fullscreenRef.current = false;
        return;
      }
      onExit?.();
    };
    zoomRef.current = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const len = offset.length() || 1;
      const next = Math.max(controls.minDistance, Math.min(controls.maxDistance, len * factor));
      offset.setLength(next);
      camera.position.copy(controls.target).add(offset);
    };
    navRef.current = (i: number) => {
      const n = landmarksRef.current[i];
      if (!n) return;
      const sphere = n.box.getBoundingSphere(new THREE.Sphere());
      const r = Math.max(sphere.radius, 6);
      const target = sphere.center.clone();
      target.y = n.box.min.y + (n.box.max.y - n.box.min.y) * 0.5;
      // Closeup framing: distance so the whole building fills the view (fov 55).
      const dist = r * 1.55 + 5;
      // Keep the current viewing direction (nice elevated 3/4 angle).
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6 || !Number.isFinite(dir.x)) dir.set(0.62, 0.32, 0.9);
      dir.normalize();
      const camPos = target.clone().addScaledVector(dir, dist);
      tween = {
        fromPos: camera.position.clone(),
        toPos: camPos,
        fromTgt: controls.target.clone(),
        toTgt: target,
        t: 0,
        dur: 1.3,
      };
    };

    setStatus("LOADING 3D CAMPUS…");
    (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] starting GLB load");
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        scene.add(root);

        const gateObjs = matchObjects(root, /^Gate/i);
        const ab1Objs = matchObjects(root, /^AB1/i);
        const ab2Objs = matchObjects(root, /^AB2/i);

        const gateBox = gateObjs.length ? bboxOf(gateObjs) : new THREE.Box3(new THREE.Vector3(90, 0, 40), new THREE.Vector3(106, 8, 50));
        const ab1Box = ab1Objs.length ? bboxOf(ab1Objs) : new THREE.Box3(new THREE.Vector3(68, 0, -95), new THREE.Vector3(131, 26, -8));
        const ab2Box = ab2Objs.length ? bboxOf(ab2Objs) : null;

        const gateC = gateBox.getCenter(new THREE.Vector3());
        const ab1C = ab1Box.getCenter(new THREE.Vector3());
        const facadeZ = ab1Box.max.z;
        const floorH = (ab1Box.max.y - ab1Box.min.y) / NUM_FLOORS;

        controls.target.set(ab1C.x, ab1C.y, ab1C.z);
        controls.update();

        // ---- static glowing entry path: Main Gate -> AB1 entrance ----
        const pathPts = [
          new THREE.Vector3(gateC.x, 1.1, gateBox.max.z + 8),
          new THREE.Vector3(gateC.x, 1.1, (gateBox.max.z + 8 + facadeZ) / 2),
          new THREE.Vector3(ab1C.x, 1.1, facadeZ + 6),
          new THREE.Vector3(ab1C.x, 1.1, facadeZ + 2),
        ];
        const curve = new THREE.CatmullRomCurve3(pathPts, false, "catmullrom", 0.2);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 96, 0.34, 8, false),
          new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.9 }),
        );
        scene.add(tube);

        // ---- gate beacon ----
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 16, 16),
          new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.9 }),
        );
        beacon.position.set(gateC.x, 3.2, gateC.z);
        scene.add(beacon);

        // ---- stairs marker at AB1 entrance ----
        const stairMat = new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.9 });
        const steps = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 1.1), stairMat);
          s.position.set(ab1C.x, 0.25 + i * 0.4, facadeZ + 2.4 - i * 1.1);
          steps.add(s);
        }
        scene.add(steps);

        // ---- floor level bands on AB1 (glowing) ----
        const bandW = ab1Box.max.x - ab1Box.min.x + 5;
        for (let f = 1; f <= NUM_FLOORS; f++) {
          const bandY = ab1Box.min.y + (f - 0.5) * floorH;
          const isTarget = f === targetFloor;
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(bandW, 0.16, 0.26),
            new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: isTarget ? 0.95 : 0.28 }),
          );
          band.position.set(ab1C.x, bandY, facadeZ + 1.7);
          scene.add(band);
        }

        // ---- labels (premium glass tags) ----
        const labels: Array<[string, string, THREE.Vector3, number]> = [
          ["MAIN GATE", "#ffffff", new THREE.Vector3(gateC.x, gateBox.max.y + 6, gateC.z), 8.5],
          ["ACADEMIC BLOCK-2", "#ffffff", new THREE.Vector3(ab1C.x, (ab2Box?.max.y ?? 20) + 6, ab2Box ? ab2Box.getCenter(new THREE.Vector3()).z : 20), 8],
          ["ACADEMIC BLOCK-1", "#ffffff", new THREE.Vector3(ab1C.x, ab1Box.max.y + 7, ab1C.z), 10],
          ["ENTRANCE · STAIRS ↑", "#ffe2a4", new THREE.Vector3(ab1C.x, 3.6, facadeZ + 4), 6.5],
          [`FLOOR ${targetFloor}`, "#ffffff", new THREE.Vector3(ab1C.x, ab1Box.min.y + (targetFloor - 0.5) * floorH + 2.4, facadeZ + 2.6), 6],
        ];
        for (const [text, color, pos, scale] of labels) {
          const sp = makeLabel(text, color, 64, "rgba(8,14,18,0.6)", true);
          sp.position.copy(pos);
          sp.scale.set(scale, scale * 0.25, 1);
          scene.add(sp);
        }

        // extra landmark labels (keeps the map readable despite the model's gaps)
        const addLandmark = (re: RegExp, text: string, dy: number) => {
          const objs = matchObjects(root, re);
          if (!objs.length) return;
          const b = bboxOf(objs);
          const c = b.getCenter(new THREE.Vector3());
          const sp = makeLabel(text, "#ffffff", 56, "rgba(8,14,18,0.55)", true);
          sp.position.set(c.x, b.max.y + dy, c.z);
          sp.scale.set(6.5, 1.6, 1);
          scene.add(sp);
        };
        addLandmark(/Hostel/i, "HOSTELS", 6);
        addLandmark(/SHD/i, "SHD AUDITORIUM", 6);
        addLandmark(/Building/i, "BUILDING C", 6);
        addLandmark(/Basketball/i, "SPORTS · BASKETBALL", 4);
        addLandmark(/^Tree/i, "CAMPUS GREENS", 4);

        // ---- building navigator (left rail + numbered 3D chips) ----
        const navList: Array<{ name: string; box: THREE.Box3 }> = [
          { name: "MAIN GATE", box: gateBox },
          { name: "ACADEMIC BLOCK-1", box: ab1Box },
        ];
        if (ab2Box) navList.push({ name: "ACADEMIC BLOCK-2", box: ab2Box });
        const navFrom = (re: RegExp, name: string, single = false) => {
          const objs = matchObjects(root, re);
          if (!objs.length) return;
          navList.push({ name, box: single ? largestBox(objs) : bboxOf(objs) });
        };
        navFrom(/SHD/i, "SHD AUDITORIUM");
        navFrom(/Hostel/i, "HOSTELS", true);
        navFrom(/Building/i, "BUILDING C");
        navFrom(/Basketball/i, "BASKETBALL & SPORTS", true);
        landmarksRef.current = navList;
        setLandmarks(navList.map((n) => ({ name: n.name })));
        navList.forEach((n, i) => {
          const c = n.box.getCenter(new THREE.Vector3());
          const sp = makeLabel(String(i + 1).padStart(2, "0"), "#ffe2a4", 96, "rgba(8,14,18,0.7)", true);
          sp.position.set(c.x, n.box.max.y + 9, c.z);
          sp.scale.set(3, 0.75, 1);
          scene.add(sp);
        });

        // ---- frame the camera on the campus; lock the elevation (never goes down) ----
        const campusBox = new THREE.Box3();
        for (const n of navList) campusBox.union(n.box);
        const campusCenter = campusBox.getCenter(new THREE.Vector3());
        controls.target.copy(campusCenter);
        camera.position.copy(campusCenter).add(new THREE.Vector3(185, 62, 92));
        controls.update();
        const lockedPa = controls.getPolarAngle();
        controls.minPolarAngle = lockedPa;
        controls.maxPolarAngle = lockedPa;
        colliderBoxes = navList.map((n) => n.box.clone());

        (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] GLB decoded and scene built");
        (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.(
          `[3d] map ready; landmarks:${navList.length}`,
        );
        try {
          sessionStorage.setItem("__cf_tour", "0");
        } catch {
          /* ignore */
        }
        setReady(true);
      },
      (ev) => {
        if (!ev.total) return;
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        setProgress(pct);
        setStatus(`LOADING 3D CAMPUS… ${pct}%`);
        if (pct >= lastProgressCheckpoint + 25) {
          lastProgressCheckpoint = Math.floor(pct / 25) * 25;
          (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.(`[3d] GLB download ${pct}%`);
        }
      },
      () => {
        if (cancelled) return;
        (window as unknown as { __cfLog?: (s: string) => void }).__cfLog?.("[3d] model ERROR");
        setStatus("3D MODEL UNAVAILABLE");
        setReady(true);
      },
    );

    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      fullscreenRef.current = active;
      setFullscreen(active);
    };
    document.addEventListener("fullscreenchange", onFsChange);

    // On slow mobile connections the 22MB model can stall — show a graceful
    // fallback instead of an endless spinner or a crashed tab.
    const timeoutMs = 120000;
    const loadTimer = setTimeout(() => {
      if (!cancelled) {
        setStatus("3D MODEL TOO LARGE FOR THIS DEVICE");
        setReady(true);
      }
    }, timeoutMs);

    const loop = () => {
      const dt = Math.min(0.05, 1 / 60);
      if (tween) {
        tween.t += dt / tween.dur;
        const k = easeInOut(Math.min(tween.t, 1));
        camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, k);
        if (tween.t >= 1) tween = null;
      }
      controls.autoRotate = autoRotateRef.current;
      controls.update();
      // Collision: never let the camera end up inside a building volume.
      for (const b of colliderBoxes) {
        if (b.containsPoint(camera.position)) {
          const c = b.getCenter(new THREE.Vector3());
          const s = b.getSize(new THREE.Vector3());
          const d = camera.position.clone().sub(c);
          const px = s.x / 2 - Math.abs(d.x);
          const py = s.y / 2 - Math.abs(d.y);
          const pz = s.z / 2 - Math.abs(d.z);
          if (px <= py && px <= pz) camera.position.x = c.x + (d.x >= 0 ? 1 : -1) * (s.x / 2 + 1.5);
          else if (py <= pz) camera.position.y = c.y + (d.y >= 0 ? 1 : -1) * (s.y / 2 + 1.5);
          else camera.position.z = c.z + (d.z >= 0 ? 1 : -1) * (s.z / 2 + 1.5);
        }
      }
      // Never drop below the campus ground (no black void).
      if (camera.position.y < 3) camera.position.y = 3;
      renderer.render(scene, camera);
      renderer.setAnimationLoop(loop);
    };
    loop();

    return () => {
      cancelled = true;
      clearTimeout(loadTimer);
      renderer.setAnimationLoop(null);
      document.removeEventListener("fullscreenchange", onFsChange);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      try {
        (window as unknown as { __flowPaused?: boolean }).__flowPaused = false;
      } catch {
        /* ignore */
      }
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
      pmrem?.dispose();
      renderer.dispose();
      draco.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [roomNumber, floor, building, section]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const toggleFullscreen = async () => {
    const el = cardRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      if (!el.requestFullscreen) {
        fullscreenRef.current = true;
        setFullscreen(true);
        return;
      }
      try {
        await el.requestFullscreen();
      } catch {
        // iPhone Safari/Chrome may reject element fullscreen; use CSS overlay.
        fullscreenRef.current = true;
        setFullscreen(true);
      }
    }
  };

  if (!webglOk) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-line bg-ink-2/60 p-6 text-center">
        <p className="font-mono-nums text-[10px] tracking-[0.14em] text-faint">3D VIEW NOT SUPPORTED ON THIS DEVICE</p>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`overflow-hidden border border-white/10 bg-[#0a0f12] ${
        fullscreen
          ? "fixed inset-0 z-[200] h-[100dvh] w-screen rounded-none border-0"
          : "relative rounded-2xl"
      }`}
    >
      <div
        ref={containerRef}
        className={`w-full ${fullscreen ? "h-[100dvh]" : "h-[340px] sm:h-[500px]"}`}
      />

      {!ready && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#0a0f12]">
          <div className="relative h-14 w-14">
            <div className="loader-ring h-14 w-14 rounded-full" />
            <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tabular-nums text-white/85">
              {Math.round(progress)}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] tracking-[0.16em] text-white/55">{status}</p>
            <div className="relative h-1 w-52 overflow-hidden rounded-full bg-white/10">
              <div
                className="loader-bar-shimmer relative h-full rounded-full bg-white/80 transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
        <div className="pointer-events-none flex items-center gap-2 rounded-full border border-white/12 bg-[#0b1013]/70 px-3 py-1.5 backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-[#e2b06a]" />
          <span className="text-[11px] font-medium text-white/90">G.L. Bajaj · Campus Map</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="pointer-events-none hidden rounded-full border border-white/12 bg-[#0b1013]/70 px-3 py-1.5 text-[11px] text-white/60 backdrop-blur-xl sm:inline">
            {building ?? "Campus"} · {section}
          </span>
          {ready && (
            <button
              onClick={() => homeRef.current()}
              title="Close map"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#0b1013]/70 text-white/80 backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* control toolbar */}
      {ready && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-full border border-white/12 bg-[#0b1013]/70 p-1 backdrop-blur-xl">
          <button
            onClick={() => zoomRef.current(1.25)}
            title="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M8 11h6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => zoomRef.current(0.8)}
            title="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M8 11h6M11 8v6" strokeLinecap="round" />
            </svg>
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/15" />
          <button
            onClick={() => setAutoRotate((v) => !v)}
            title="Auto-rotate"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              autoRotate ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
              <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            {fullscreen ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      )}
      {/* campus directory (desktop) */}
      {ready && landmarks.length > 0 && (
        <div className="absolute left-3 top-1/2 z-10 hidden w-56 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/12 bg-[#0b1013]/72 backdrop-blur-xl sm:block">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-white/50">CAMPUS DIRECTORY</span>
            <span className="text-[10px] tabular-nums text-white/35">{landmarks.length}</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {landmarks.map((l, i) => (
              <button
                key={l.name}
                onClick={() => {
                  setActiveNav(i);
                  navRef.current(i);
                }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  activeNav === i ? "bg-white/12" : "hover:bg-white/[0.06]"
                }`}
              >
                <span className={`text-[10px] tabular-nums ${activeNav === i ? "text-[#e2b06a]" : "text-white/40"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`flex-1 text-[12.5px] font-medium ${activeNav === i ? "text-white" : "text-white/80"}`}>
                  {l.name}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={activeNav === i ? "text-white/70" : "text-white/25 group-hover:text-white/50"}
                  aria-hidden
                >
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* campus directory (mobile) */}
      {ready && landmarks.length > 0 && (
        <div className="absolute inset-x-3 bottom-16 z-10 flex gap-2 overflow-x-auto pb-1 sm:hidden">
          {landmarks.map((l, i) => (
            <button
              key={l.name}
              onClick={() => {
                setActiveNav(i);
                navRef.current(i);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl transition-colors ${
                activeNav === i ? "border-white/25 bg-white/15 text-white" : "border-white/12 bg-[#0b1013]/70 text-white/70"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[50%] text-[10.5px] leading-relaxed text-white/45">
        Drag to orbit · scroll to zoom · click a place to fly there
      </div>
    </div>
  );
}
