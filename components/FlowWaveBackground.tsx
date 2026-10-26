"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Fixed parameters (Flow Wave, per spec)
const bgColor = "#02160c";
const flameColor = "#0aff7f";
const flameColor2 = "#aef0c0";
const flameAmt = 0.2;
const atmoColor = "#7affbf";
const atmoCount = 300;
const atmoSize = 24;
const atmoSpeed = 1.0;
const colorLow = "#02160c";
const colorHigh = "#34e89a";
const opacity = 0.26;
const pointSize = 5.5;
const brightness = 0.45;
const waveHeight = 3;
const flow = 1;
const tilt = 0;
const scale = 0.275;
const scrollRise = 1.0;
const camStartY = 7;
const camStartZ = 16;
const camEndY = 0.8;
const camEndZ = -2;
const lookStartZ = 2;
const lookEndZ = -16;
const parallax = 1.2;
const pointerRadius = 7.0;
const pointerStrength = 0.9;

const Lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function hexToVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const SNOISE = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx; vec3 x2 = x0 - i2 + 2.0 * C.xxx; vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const pointVertexShader = `
uniform float uTime; uniform float uStream; uniform float uSize; uniform float uWaveHeight; uniform float uFlow; uniform float uScale;
uniform vec3 uColLow; uniform vec3 uColHigh;
uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;
varying float vFade; varying vec3 vColor;
${SNOISE}
void main() {
  vec3 wp = vec3(position.x * 13.0, 0.0, position.z * 25.0);
  wp.x += position.y * 6.0;
  float zc = wp.z + uStream;
  float wn = snoise(vec3(wp.x * 0.08, zc * 0.08, uTime * 0.15 * uFlow)) * 2.0;
  wn += snoise(vec3(wp.x * 0.16, zc * 0.16, uTime * 0.3 * uFlow)) * 0.8;
  wp.y += wn * uWaveHeight;

  vec3 finalPos = wp * uScale;
  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);
  vec3 toP = modelPosition.xyz - uCursor;
  float cd = length(toP);
  float fall = smoothstep(uRepelRadius, 0.0, cd);
  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;
  vec4 mvPosition = viewMatrix * modelPosition;

  float colMix = smoothstep(-3.0, 3.0, position.y + position.x * 0.5);
  vColor = mix(uColLow, uColHigh, clamp(colMix, 0.0, 1.0));
  vFade = 1.0;

  gl_PointSize = uSize * (10.0 / -mvPosition.z);
  gl_PointSize = max(gl_PointSize, 1.5);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const pointFragmentShader = `
uniform float uOpacity; uniform float uBrightness; uniform float uAppear;
varying float vFade; varying vec3 vColor;
void main() {
  vec2 xy = gl_PointCoord - 0.5;
  float ll = length(xy);
  if (ll > 0.5) discard;
  float a = smoothstep(0.5, 0.1, ll);
  gl_FragColor = vec4(vColor * uBrightness, vFade * a * uOpacity * uAppear);
}
`;

const finalPassVertexShader = `
varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const finalPassFragmentShader = `
uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg * (1.0 - 0.4 * length(uv));
  vec3 halo = texture2D(haloTexture, vUv).xyz;
  gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
}
`;

export default function FlowWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // On small screens (iPhones) skip the heavy WebGL background entirely.
    // iOS WebKit reloads the tab when two heavy WebGL contexts + the 22MB
    // campus model push the process past its memory cap.
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 640;
    if (smallScreen) return;

    let raf = 0;
    let disposed = false;

    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.VSMShadowMap;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.fog = new THREE.Fog(0x000000, 0, 15);

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
      camera.position.set(0, 7, 16);

      const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 };
      camera.layers.enable(LAYERS.TORUS_SCENE);
      camera.layers.enable(LAYERS.BLOOM_SCENE);
      camera.layers.enable(LAYERS.ENTIRE_SCENE);
      scene.add(camera);

      // ---- wave points ----
      const geometry = new THREE.SphereGeometry(4.2, 200, 600);
      const uniforms = {
        uTime: { value: 0 },
        uStream: { value: 0 },
        uAppear: { value: 0 },
        uColLow: { value: hexToVec3(colorLow) },
        uColHigh: { value: hexToVec3(colorHigh) },
        uOpacity: { value: opacity },
        uSize: { value: pointSize },
        uBrightness: { value: brightness },
        uWaveHeight: { value: waveHeight },
        uFlow: { value: flow },
        uScale: { value: scale },
        uCursor: { value: new THREE.Vector3() },
        uRepelRadius: { value: pointerRadius },
        uRepelStrength: { value: pointerStrength },
        uActivity: { value: 0 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: pointVertexShader,
        fragmentShader: pointFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.layers.enable(LAYERS.ENTIRE_SCENE);
      const group = new THREE.Group();
      group.add(points);
      scene.add(group);

      // ---- postprocessing (single composer — the torus/bloom passes were
      // rendering empty scenes, so they only added compile + frame cost) ----
      const renderScene = new RenderPass(scene, camera);

      const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      blackTex.needsUpdate = true;

      const finalPass = new ShaderPass({
        uniforms: {
          iTime: { value: 0 },
          tDiffuse: { value: null },
          torusTexture: { value: blackTex },
          bloomTexture: { value: blackTex },
          haloTexture: { value: blackTex },
          uBg: { value: hexToVec3(bgColor) },
          uFlameA: { value: hexToVec3(flameColor) },
          uFlameB: { value: hexToVec3(flameColor2) },
          uFlameAmt: { value: flameAmt },
        },
        vertexShader: finalPassVertexShader,
        fragmentShader: finalPassFragmentShader,
      });

      const finalComposer = new EffectComposer(renderer);
      finalComposer.addPass(renderScene);
      finalComposer.addPass(finalPass);
      finalComposer.renderToScreen = true;

      // ---- ambient motes ----
      const atmoUniforms = {
        uTime: { value: 0 },
        uColor: { value: hexToVec3(atmoColor) },
        uRes: { value: new THREE.Vector2(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio) },
      };
      const N = Math.round(atmoCount);
      const positions = new Float32Array(N * 3);
      const sizes = new Float32Array(N);
      const seeds = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        positions[i * 3] = 2 * Math.random() - 1;
        positions[i * 3 + 1] = 2 * Math.random() - 1;
        positions[i * 3 + 2] = 2 * Math.random() - 1;
        sizes[i] = atmoSize * (0.4 + Math.random());
        seeds[i] = Math.random();
      }
      const atmoGeo = new THREE.BufferGeometry();
      atmoGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      atmoGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      atmoGeo.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
      const atmoMat = new THREE.ShaderMaterial({
        uniforms: atmoUniforms,
        vertexShader: `
attribute float size; attribute float seed; uniform float uTime; uniform vec2 uRes;
varying float vA;
vec3 warp(vec3 p, float t){ float c=0.9,a=1.9,b=0.02,s=0.05; p*=2.;
  p.x+=c*sin(s*t+a*p.y)+t*b; p.y+=c*cos(s*t+a*p.x); p.y+=c*sin(s*t+a*p.z)+t*b;
  p.z+=c*cos(s*t+a*p.y); p.z+=c*sin(s*t+a*p.x)+t*b; p.x+=c*cos(s*t+a*p.z);
  return cos(p+vec3(1,2,4)); }
void main(){
  vec3 v = position*4.0 + warp(position, uTime)*1.2;
  vec4 mv = modelViewMatrix * vec4(v, 1.0);
  float r = length(v); float farF = 1.0 - smoothstep(5.0, 6.5, r); float nearF = smoothstep(0.0, 0.5, -mv.z);
  vA = farF * nearF;
  gl_PointSize = size * uRes.y / 900.0 / -mv.z; gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
`,
        fragmentShader: `
uniform vec3 uColor; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;
  float tex = smoothstep(0.5, 0.0, l); gl_FragColor = vec4(uColor * tex, tex * vA * 0.6); }
`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const motes = new THREE.Points(atmoGeo, atmoMat);
      motes.frustumCulled = false;
      motes.layers.enable(LAYERS.ENTIRE_SCENE);
      motes.onBeforeRender = () => {
        const t = performance.now() / 1000;
        atmoUniforms.uTime.value = t * atmoSpeed * 8.0;
        motes.position.copy(camera.position);
        finalPass.uniforms.iTime.value = t;
      };
      scene.add(motes);

      // ---- input ----
      let scrollTarget = 0;
      let scrollSmooth = 0;
      let scrollCurrent = 0;
      const mouseTarget = { x: 0, y: 0 };
      const mouse = { x: 0, y: 0 };
      const POINTER = { world: new THREE.Vector3(), activity: 0, active: false, lastMove: performance.now() };

      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scrollTarget = max > 0 ? clampNum(window.scrollY / max, 0, 1) : 0;
      };
      const onMouseMove = (e: MouseEvent) => {
        mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
        POINTER.active = true;
        POINTER.lastMove = performance.now();
      };
      const onMouseOut = () => {
        POINTER.active = false;
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("mouseout", onMouseOut);

      const _ndc = new THREE.Vector3();
      const _dir = new THREE.Vector3();
      const _tgt = new THREE.Vector3();
      const updatePointerWorld = () => {
        _tgt.set(0, 0, 0);
        if (POINTER.active) {
          _ndc.set(mouse.x, mouse.y, 0.5).unproject(camera);
          _dir.copy(_ndc).sub(camera.position).normalize();
          const dn = _dir.z;
          if (Math.abs(dn) > 1e-4) {
            const tt = -camera.position.z / dn;
            if (tt > 0 && Number.isFinite(tt)) _tgt.copy(camera.position).addScaledVector(_dir, tt);
          }
        }
        POINTER.world.lerp(_tgt, 0.12);
        const idle = (performance.now() - POINTER.lastMove) / 1000;
        POINTER.activity += ((POINTER.active && idle < 3 ? 1 : 0) - POINTER.activity) * 0.06;
      };

      const sceneObj = {
        stream: 0,
        appearStart: performance.now(),
        t0: performance.now() / 1000,
        render(scroll: number, m: { x: number; y: number }) {
          const t = performance.now() / 1000;
          const dt = Math.min(0.05, t - this.t0);
          this.t0 = t;
          uniforms.uTime.value = t;
          this.stream += dt * (flow * 2.0) * 4.0;
          uniforms.uStream.value = this.stream;
          uniforms.uWaveHeight.value = waveHeight * (1 + scroll * scrollRise);
          const ea = Math.min(scroll / 0.35, 1.0);
          const e = ea * ea * (3 - 2 * ea);
          const camY = Lerp(camStartY, camEndY, e);
          const camZ = Lerp(camStartZ, camEndZ, e);
          camera.position.set(m.x * parallax, camY + m.y * parallax * 0.3, camZ);
          camera.lookAt(m.x * parallax * 0.5, Lerp(0.0, 0.6, e), Lerp(lookStartZ, lookEndZ, e));
          group.rotation.x = -tilt;
          group.rotation.y = 0;
          updatePointerWorld();
          uniforms.uCursor.value.copy(POINTER.world);
          uniforms.uActivity.value = POINTER.activity;
          const elapsed = (performance.now() - this.appearStart) / 1000;
          uniforms.uAppear.value = Math.min(1, Math.max(0, elapsed / 0.12));
        },
      };

      const loop = () => {
        if (disposed) return;
        // Pause while the heavy 3D campus map is mounted or the tab is hidden,
        // so the wave never competes for GPU/memory on mobile.
        const bgPaused =
          document.hidden ||
          (window as unknown as { __flowPaused?: boolean }).__flowPaused === true;
        if (!bgPaused) {
          scrollSmooth = Lerp(scrollSmooth, scrollTarget, 0.1);
          scrollCurrent = Lerp(scrollCurrent, scrollSmooth, 0.06);
          mouse.x = Lerp(mouse.x, mouseTarget.x, 0.06);
          mouse.y = Lerp(mouse.y, mouseTarget.y, 0.06);
          sceneObj.render(scrollCurrent, mouse);
          camera.layers.set(LAYERS.ENTIRE_SCENE);
          finalComposer.render();
        }
        raf = requestAnimationFrame(loop);
      };

      const onResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const dpr = window.devicePixelRatio;
        finalComposer.setPixelRatio(dpr);
        finalComposer.setSize(w, h);
        atmoUniforms.uRes.value.set(w * dpr, h * dpr);
        onScroll();
      };
      window.addEventListener("resize", onResize);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      onResize();
      onScroll();
      if (reduce) {
        sceneObj.render(scrollCurrent, mouse);
        camera.layers.set(LAYERS.ENTIRE_SCENE);
        finalComposer.render();
      } else {
        loop();
      }

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseout", onMouseOut);
        renderer.dispose();
      };
    } catch {
      // WebGL unavailable — background silently no-ops
    }
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full" style={{ background: "#02160c" }} aria-hidden />;
}