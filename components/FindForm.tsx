"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneInput from "./PhoneInput";

type Stage = "idle" | "verifying" | "error";

interface VerifyError {
  status: string;
  error: string;
  hint?: string;
}

interface VerifyOk {
  status: "ok";
  data: unknown;
}

type VerifyResult = VerifyOk | VerifyError;

const STEPS = [
  "Reading your details",
  "Matching admission record",
  "Preparing your class information",
];

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.5 5.5 10.5 11.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorPanel({ err, onRetry }: { err: VerifyError; onRetry: () => void }) {
  return (
    <div className="anim-scalein rounded-2xl border border-rose/40 bg-rose/[0.07] p-7">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-rose/40 bg-rose/10">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 3v6M8 12.5v.01"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="text-rose"
          />
        </svg>
      </div>
      <h3 className="font-display text-[20px] leading-tight text-carbon">{err.error}</h3>
      {err.hint && <p className="mt-2 text-[13.5px] leading-relaxed text-carbon-soft">{err.hint}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onRetry}
          className="inline-flex items-center rounded-full border border-rule-strong bg-white/60 px-5 py-2.5 text-[13px] font-medium text-carbon transition-colors hover:border-carbon/40 hover:bg-white"
        >
          Try Again
        </button>
        <Link
          href="/help"
          className="inline-flex items-center rounded-full px-5 py-2.5 text-[13px] font-medium text-carbon-soft underline decoration-carbon/25 underline-offset-4 transition-colors hover:text-carbon"
        >
          Get Help
        </Link>
      </div>
    </div>
  );
}

export default function FindForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<VerifyError | null>(null);
  const [doneStep, setDoneStep] = useState(0);
  const [showDemo, setShowDemo] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const nameValid = name.trim().length >= 3;
  const phoneValid = (phone.replace(/\D/g, "") || "").length === 10;
  const formValid = nameValid && phoneValid;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setStage("idle");
    setErr(null);
    setDoneStep(0);
  }, [clearTimers]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formValid) return;
    setStage("verifying");
    setDoneStep(0);
    setErr(null);

    timers.current.push(setTimeout(() => setDoneStep(1), 400));
    timers.current.push(setTimeout(() => setDoneStep(2), 720));
    timers.current.push(setTimeout(() => setDoneStep(3), 980));

    let res: Response;
    try {
      res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), mobile: phone }),
      });
    } catch {
      timers.current.push(
        setTimeout(() => {
          setStage("error");
          setErr({
            status: "network",
            error: "We couldn't reach the server.",
            hint: "Check your connection and try again.",
          });
        }, 900),
      );
      return;
    }

    const payload = (await res.json().catch(() => null)) as VerifyResult | null;

    if (!payload || payload.status !== "ok") {
      const e = (payload ?? { status: "error", error: "Something went wrong." }) as VerifyError;
      timers.current.push(
        setTimeout(() => {
          setStage("error");
          setErr({
            status: e.status,
            error: e.error || "Something went wrong.",
            hint: e.hint,
          });
        }, 950),
      );
      return;
    }

    timers.current.push(
      setTimeout(() => {
        try {
          sessionStorage.setItem("cf_result", JSON.stringify((payload as VerifyOk).data));
        } catch {
          /* ignore */
        }
        router.push("/result");
      }, 1250),
    );
  };

  const fillDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo");
      const payload = await res.json();
      if (payload.status === "ok" && payload.sample) {
        setName(payload.sample.name);
        setPhone(payload.sample.mobile);
        setShowDemo(true);
      }
    } catch {
      /* ignore */
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl">
      {stage === "idle" || stage === "error" ? (
        <form
          onSubmit={submit}
          noValidate
          className="light-card space-y-6 rounded-2xl border border-rule bg-white/70 p-6 shadow-[0_28px_70px_-40px_rgba(20,10,30,0.7)] backdrop-blur-md sm:p-7"
        >
          <div className="space-y-2">
            <label htmlFor="fullname" className="paper-label block">
              Full name
            </label>
            <input
              id="fullname"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (stage === "error") reset();
              }}
              placeholder="Enter your full name"
              aria-invalid={stage === "error" || undefined}
              className={`w-full rounded-xl border bg-white/70 px-4 py-3.5 text-[15px] text-carbon placeholder:text-carbon-faint/60 transition-all duration-200 focus:bg-white ${
                stage === "error"
                  ? "border-rose/70 focus:border-rose"
                  : "border-rule focus:border-acid-line focus:shadow-[0_0_0_3px_rgba(201,242,90,0.18)]"
              }`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="mobile" className="paper-label block">
              Registered mobile number
            </label>
            <PhoneInput
              id="mobile"
              value={phone}
              onChange={(v) => {
                setPhone(v);
                if (stage === "error") reset();
              }}
              autoComplete="tel-national"
            />
          </div>

          <button
            type="submit"
            disabled={!formValid}
            className={`group inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-[14px] font-semibold transition-all duration-200 ${
              formValid
                ? "bg-acid text-[#101106] hover:bg-carbon hover:text-paper hover:shadow-[0_18px_44px_-18px_rgba(32,24,13,0.7)]"
                : "cursor-not-allowed border border-rule bg-white/40 text-carbon-faint"
            }`}
          >
            Verify &amp; Find My Class
          </button>

          <div className="flex items-center justify-between gap-4">
            <p className="font-mono-nums text-[10px] tracking-[0.12em] text-carbon-faint">
              USED ONLY TO VERIFY YOUR CLASS INFORMATION
            </p>
            <button
              type="button"
              onClick={fillDemo}
              disabled={demoLoading}
              className="shrink-0 font-mono-nums text-[10px] tracking-[0.16em] text-carbon-faint underline decoration-carbon/25 underline-offset-4 transition-colors hover:text-carbon"
            >
              {demoLoading ? "LOADING…" : "DEMO"}
            </button>
          </div>

          {showDemo && (
            <p className="anim-fadein font-mono-nums text-[10px] tracking-[0.12em] text-carbon-soft">
              DEMO · SAMPLE RECORD LOADED FROM THE REAL DATASET
            </p>
          )}

          {stage === "error" && err && (
            <ErrorPanel
              err={err}
              onRetry={() => {
                reset();
                setTimeout(() => document.getElementById("fullname")?.focus(), 50);
              }}
            />
          )}
        </form>
      ) : (
        <div className="light-card anim-fadein rounded-2xl border border-rule bg-white/70 p-8 backdrop-blur-md">
          <p className="mb-7 font-mono-nums text-[12px] tracking-[0.2em] text-carbon-soft">
            FINDING YOUR CLASS<span className="pulse-dot ml-1 inline-block">…</span>
          </p>
          <ol className="space-y-5">
            {STEPS.map((label, i) => {
              const state = doneStep > i ? "done" : doneStep === i ? "active" : "pending";
              return (
                <li key={label} className="flex items-center gap-4">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                      state === "done"
                        ? "border-acid bg-acid text-[#101106]"
                        : state === "active"
                          ? "border-carbon/45 text-carbon"
                          : "border-rule text-carbon-faint"
                    }`}
                  >
                    {state === "done" ? (
                      <span className="check-pop">
                        <CheckMark />
                      </span>
                    ) : state === "active" ? (
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-carbon" />
                    ) : null}
                  </span>
                  <span
                    className={`text-[14px] transition-colors duration-300 ${
                      state === "pending" ? "text-carbon-faint" : "text-carbon"
                    }`}
                  >
                    {label}
                  </span>
                  {state === "active" && <span className="step-line ml-auto h-px w-12 bg-carbon/25" />}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
