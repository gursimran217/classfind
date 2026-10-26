"use client";

import { useEffect, useRef, useState } from "react";

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Generative sunset: indigo zenith through magenta and orange to a gold horizon,
// a low drifting sun, and two parallax cloud layers with warm-lit tops and deep
// mauve undersides. Fully procedural, so it loops forever without a seam.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Constant-bounded loop: a dynamic break is rejected by strict GLSL ES compilers.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  // gl_FragCoord.y is 0 at the bottom, so uv.y rises with height.
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.05;

  // --- sky bands: gold at the horizon, indigo overhead
  vec3 indigo = vec3(0.145, 0.114, 0.286);
  vec3 magenta = vec3(0.612, 0.259, 0.400);
  vec3 orange = vec3(0.902, 0.478, 0.235);
  vec3 gold = vec3(0.992, 0.784, 0.451);
  vec3 col = mix(gold, orange, smoothstep(0.02, 0.34, uv.y));
  col = mix(col, magenta, smoothstep(0.30, 0.66, uv.y));
  col = mix(col, indigo, smoothstep(0.62, 1.0, uv.y));

  // --- low sun, drifting on its own slow cycle
  vec2 sunPos = vec2(0.68 + 0.05 * sin(uTime * 0.020), 0.22 + 0.02 * cos(uTime * 0.017));
  float ds = distance(vec2(uv.x * aspect, uv.y), vec2(sunPos.x * aspect, sunPos.y));
  col += vec3(0.42, 0.28, 0.12) * exp(-ds * 3.4);
  col += vec3(0.55, 0.42, 0.22) * exp(-ds * 11.0);

  // --- clouds: two layers at different rates for parallax
  float c1 = fbm(p * 0.85 + vec2(t * 1.00, t * 0.15));
  float c2 = fbm(p * 1.95 + vec2(t * 1.70, -t * 0.20) + c1 * 0.42);
  float dens = smoothstep(0.26, 0.70, c1 * 0.76 + c2 * 0.60);

  // high cloud catches more light than low cloud
  float lit = smoothstep(0.20, 0.95, c2) * (1.0 - smoothstep(0.0, 0.95, uv.y) * 0.45);
  vec3 cloudLit = vec3(1.000, 0.874, 0.706);
  vec3 cloudShade = vec3(0.353, 0.216, 0.376);
  vec3 cloud = mix(cloudShade, cloudLit, lit);

  col = mix(col, cloud, dens);

  // grain, so it never reads as a clean digital gradient
  col += (hash(gl_FragCoord.xy * 0.37) - 0.5) * 0.02;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[paper-webgl] shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function PaperWebGL({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Conservative context options, identical on every platform: no MSAA, no
    // depth/stencil, default power preference.
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null;
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }
    const prog = gl.createProgram();
    if (!prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[paper-webgl] link failed:", gl.getProgramInfoLog(prog));
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");

    // Same sampling density on every device, capped at 2x for all platforms
    // equally.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let disposed = false;
    let visible = true;
    let shown = false;
    const start = performance.now();

    const frame = () => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      resize();
      gl.uniform1f(uTime, reduced ? 26 : (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) {
        shown = true;
        setReady(true);
      }
    };
    raf = requestAnimationFrame(frame);

    const onLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting);
    });
    io.observe(canvas);

    const onVis = () => {
      visible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`${className ?? ""} transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}
