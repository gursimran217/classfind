"use client";

import { useEffect, useState } from "react";

const KEY = "__cf_log";

function readLog(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.slice(-80) : [];
  } catch {
    return [];
  }
}
function pushLog(line: string) {
  try {
    const arr = readLog();
    arr.push(`[${new Date().toLocaleTimeString()}] ${line}`);
    sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-80)));
  } catch {
    /* ignore */
  }
}

/**
 * Always-on diagnostic overlay (no Mac needed).
 * Logs page lifecycle + JS errors to sessionStorage so they survive a reload,
 * and shows them as a small panel on screen. Exposes window.__cfLog for the 3D map.
 */
export default function DiagOverlay() {
  const [log, setLog] = useState<string[]>([]);
  const [diagVisible, setDiagVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (new URLSearchParams(window.location.search).get("diag") === "1") {
        sessionStorage.setItem("__cf_diag", "1");
      }
      setDiagVisible(sessionStorage.getItem("__cf_diag") === "1");
    } catch {
      /* ignore */
    }
    (window as unknown as { __cfLog?: (line: string) => void }).__cfLog = (line: string) => {
      pushLog(line);
      try {
        console.log(line);
      } catch {
        /* ignore */
      }
      setLog(readLog());
    };

    try {
      const nav = performance.getEntriesByType("navigation")[0] as { type?: string } | undefined;
      pushLog(`page type: ${nav?.type ?? "n/a"}`);
    } catch {
      /* ignore */
    }

    const onBefore = () => pushLog("beforeunload");
    const onHide = () => pushLog("pagehide");
    const onVis = () => pushLog(`visibility: ${document.visibilityState}`);
    const onErr = (e: ErrorEvent) => pushLog(`ERROR: ${(e.message || "").slice(0, 140)}`);
    const onRej = (e: PromiseRejectionEvent) => pushLog(`REJECT: ${String(e.reason).slice(0, 140)}`);
    window.addEventListener("beforeunload", onBefore);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);

    setLog(readLog());

    return () => {
      window.removeEventListener("beforeunload", onBefore);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  // Hidden by default. Opt in with ?diag=1 (kept for this browser session).
  if (!diagVisible || log.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-[300] max-h-[46vh] w-full max-w-[360px] overflow-y-auto bg-black/85 p-2 font-mono text-[9px] leading-[1.55] text-[#7fe9a0] shadow-[0_0_0_1px_rgba(127,233,160,0.35)]">
      <div className="mb-1 font-bold tracking-wide text-white/85">DIAGNOSTICS — SCREENSHOT & SEND</div>
      {log.slice(-50).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}