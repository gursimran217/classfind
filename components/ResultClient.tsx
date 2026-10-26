"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import SiteHeader from "@/components/SiteHeader";
import Modal from "@/components/Modal";
import FacultyCascade from "@/components/FacultyCascade";
import FloorMap from "@/components/FloorMap";
import type { ResultData, TimetableSlot } from "@/lib/types";
import { formatProgram, programShort } from "@/lib/program";
import { buildIcs, downloadText, DAY_LABELS } from "@/lib/timetable-export";
import { renderResultCard } from "@/lib/share-card";

const Campus3DMap = dynamic(() => import("@/components/Campus3DMap"), { ssr: false });

function mappingBadge(status: string | null): { label: string; tone: string } {
  switch (status) {
    case "user_confirmed":
      return { label: "CONFIRMED", tone: "border-acid/40 bg-acid/10 text-acid" };
    case "admin_verified":
      return { label: "ADMIN VERIFIED", tone: "border-acid/40 bg-acid/10 text-acid" };
    case "research_seed":
      return { label: "RESEARCH SEED", tone: "border-amber/40 bg-amber/10 text-amber" };
    case "inferred_seed":
      return { label: "SEED · PENDING CONFIRMATION", tone: "border-amber/40 bg-amber/10 text-amber" };
    default:
      return { label: "NOT CONFIGURED", tone: "border-faint/40 bg-faint/10 text-faint" };
  }
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5 5.5 10.5 11.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OtpStepper({ phase }: { phase: "sending" | "verifying" }) {
  const steps =
    phase === "sending"
      ? ["Class verified", "Sending a code to your registered number…"]
      : ["Code received", "Confirming it's you…"];
  const activeIdx = 1;
  return (
    <ol className="space-y-3">
      {steps.map((label, i) => {
        const done = i < activeIdx;
        return (
          <li key={label} className="flex items-center gap-3 text-[13.5px]">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                done ? "border-acid bg-acid text-[#101106]" : "border-line text-faint"
              }`}
            >
              {done ? (
                <span className="check-pop">
                  <CheckIcon />
                </span>
              ) : (
                <span className="pulse-dot h-1 w-1 rounded-full bg-acid" />
              )}
            </span>
            <span className={done ? "text-cream" : "text-faint"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyResult() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 font-mono-nums text-[11px] tracking-[0.24em] text-faint">NO SESSION</p>
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-cream">
        Nothing to show here yet.
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-smoke">
        Verify your details first to see your class information.
      </p>
      <Link
        href="/find"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-acid px-6 py-3 text-[14px] font-semibold text-[#101106] transition-colors hover:bg-cream"
      >
        Find My Class
      </Link>
    </div>
  );
}

type OtpStage = "idle" | "sending" | "code" | "verifying" | "done" | "error";

interface EmailResult {
  to: string;
  sent: boolean;
  provider: "resend" | "brevo" | "simulated";
  subject: string;
  preview: string;
}

export default function ResultClient() {
  const [data, setData] = useState<ResultData | null>(null);
  const [checked, setChecked] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [mapMode, setMapMode] = useState<"schematic" | "holographic">("holographic");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [otpStage, setOtpStage] = useState<OtpStage>("idle");
  const [otpValue, setOtpValue] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{ sent: boolean; provider: string } | null>(null);
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const [faculty, setFaculty] = useState<{
    coordinator: FacultyInfo | null;
    faculty: FacultyInfo[];
  } | null>(null);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.section) return;
    let alive = true;
    fetch(`/api/faculty?section=${encodeURIComponent(data.section)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setFaculty({ coordinator: j.coordinator ?? null, faculty: Array.isArray(j.faculty) ? j.faculty : [] });
        setTimetable(Array.isArray(j.timetable) ? j.timetable : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data?.section]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cf_result");
      if (raw) setData(JSON.parse(raw) as ResultData);
    } catch {
      /* ignore */
    }
    setChecked(true);
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const resetOtp = () => {
    setOtpStage("idle");
    setOtpValue("");
    setOtpError(null);
    setEmailResult(null);
    setDemoOtp(null);
  };

  const sendOtp = async () => {
    if (!data) return;
    if (!emailValid) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setOtpStage("sending");
    setOtpError(null);
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, mobile: data.mobile, email: email.trim() }),
      });
      const payload = await res.json();
      if (payload.status === "sent") {
        setMaskedEmail(payload.maskedEmail ?? "");
        setDemoOtp(payload.demoOtp ?? null);
        setDelivery(payload.delivery ?? null);
        setOtpValue("");
        setOtpStage("code");
        setTimeout(() => otpRef.current?.focus(), 80);
      } else {
        setOtpStage("error");
        setOtpError(payload.error ?? "Couldn't send a code. Try again.");
      }
    } catch {
      setOtpStage("error");
      setOtpError("Couldn't reach the server. Try again.");
    }
  };

  const verifyOtp = async () => {
    if (!data || otpValue.trim().length !== 6) return;
    setOtpStage("verifying");
    setOtpError(null);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, mobile: data.mobile, otp: otpValue.trim(), email: email.trim() }),
      });
      const payload = await res.json();
      if (payload.status === "ok") {
        if (payload.email) {
          setEmailResult(payload.email);
          setOtpStage("done");
        } else {
          setOtpStage("error");
          setOtpError("Your group invite isn't ready yet. It will be added by the institute.");
        }
      } else {
        setOtpStage("code");
        setOtpError(payload.error ?? "That code isn't right.");
      }
    } catch {
      setOtpStage("error");
      setOtpError("Couldn't reach the server. Try again.");
    }
  };

  const exportIcs = () => {
    if (!data || !timetable.length) return;
    const ics = buildIcs(timetable, {
      section: data.section,
      room: data.classroom?.roomNumber ?? null,
      building: data.classroom?.building ?? null,
    });
    downloadText(`classfind-${data.section}-timetable.ics`, ics);
  };

  const shareCard = async () => {
    if (!data) return;
    setShareMsg(null);
    try {
      const blob = await renderResultCard({
        data,
        facultyCount: faculty?.faculty.length ?? 0,
        coordinator: faculty?.coordinator?.name ?? null,
        subjects: (faculty?.faculty ?? []).flatMap((f) => f.subjects ?? (f.subject ? [f.subject] : [])),
      });
      const file = new File([blob], `classfind-${data.section}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      let shared = false;
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        // The native sheet needs user activation and never settles when it is
        // blocked, so race it: anything that is not a real share falls back to
        // saving the file, and the student always gets the card one way or another.
        shared = await Promise.race([
          nav
            .share({
              files: [file],
              title: `CLASSFIND · ${data.section}`,
              text: `My class is ${data.section} — room ${data.classroom?.roomNumber ?? "TBA"}.`,
            })
            .then(() => true)
            .catch(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
        ]);
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setShareMsg("CARD SAVED — SHARE IT WITH YOUR CLASS");
      }
    } catch {
      setShareMsg("COULD NOT BUILD THE CARD ON THIS DEVICE");
    }
  };

  if (!checked) return null;

  if (!data) return <EmptyResult />;

  const badge = mappingBadge(data.classroom?.mappingStatus ?? null);
  const hasInvite = Boolean(data.group?.hasInvite);
  const periods = [...new Set(timetable.map((s) => s.period))].sort((a, b) => a - b);

  return (
    <div className="relative min-h-dvh">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8">
        {/* header */}
        <div className="anim-rise">
          <p className="mb-3 flex items-center gap-2 font-mono-nums text-[11px] tracking-[0.28em] text-acid">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[#101106]">
              <CheckIcon />
            </span>
            CLASS VERIFIED
          </p>
          <h1 className="text-balance text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-tight tracking-[-0.03em] text-cream">
            You&apos;re all set.
          </h1>
          <p className="mt-3 text-[15px] text-smoke">We found your class details.</p>
        </div>

        {/* class identity */}
        <section className="anim-rise-1 mt-10 overflow-hidden rounded-3xl border border-line bg-panel/70 p-7 sm:p-9">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-2 font-mono-nums text-[10px] tracking-[0.2em] text-faint">YOUR CLASS</p>
              <div className="flex items-end gap-4">
                <span className="font-mono-nums text-[clamp(3rem,9vw,5rem)] font-semibold leading-none tracking-[-0.03em] text-cream">
                  {data.section}
                </span>
                <span className="mb-1.5 font-mono-nums text-[13px] tracking-[0.1em] text-smoke">
                  {programShort(data.program)}
                </span>
              </div>
              <p className="mt-2 text-[14px] text-smoke">{formatProgram(data.program)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-4 sm:items-end">
              <div className="text-right">
                <p className="font-mono-nums text-[10px] tracking-[0.2em] text-faint">ROLL NUMBER</p>
                <p className="font-mono-nums text-[20px] font-semibold tracking-tight text-cream">
                  {data.rollNumber}
                </p>
              </div>
              <p className="font-mono-nums text-[11px] tracking-[0.1em] text-faint">
                {data.name}
              </p>
            </div>
          </div>
        </section>

        {/* classroom + group */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* classroom */}
          <div className="anim-rise-2 rounded-3xl border border-line bg-panel/70 p-7">
            <div className="mb-6 flex items-center justify-between">
              <p className="font-mono-nums text-[10px] tracking-[0.2em] text-faint">CLASSROOM</p>
              {data.classroom && (
                <span className={`rounded-full border px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.14em] ${badge.tone}`}>
                  {badge.label}
                </span>
              )}
            </div>

            {data.classroom ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono-nums text-[clamp(2.6rem,7vw,3.6rem)] font-semibold leading-none tracking-[-0.02em] text-acid">
                    {data.classroom.roomNumber}
                  </span>
                  <span className="font-mono-nums text-[13px] text-smoke">{data.classroom.floorLabel}</span>
                </div>
                <div className="mt-5 space-y-2 border-t border-line pt-5">
                  <FieldRow label="BUILDING" value={data.classroom.building ?? "—"} />
                  <FieldRow label="FLOOR" value={data.classroom.floorLabel ?? "—"} />
                  <FieldRow label="CAMPUS" value={data.classroom.campus ?? "—"} />
                </div>
                <button
                  onClick={() => setShowLocation(true)}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-panel-2 px-5 py-3.5 text-[13.5px] font-medium text-cream transition-all hover:border-acid/50 hover:text-acid"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M7 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.5 4.5 6.5 4.5 6.5s4.5-3 4.5-6.5c0-2.5-2-4.5-4.5-4.5Z" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="7" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                  Find your classroom
                </button>
              </>
            ) : (
              <div className="flex min-h-[220px] flex-col items-start justify-center">
                <p className="text-[15px] font-medium text-cream">Classroom mapping isn&apos;t configured yet.</p>
                <p className="mt-2 text-[13px] leading-relaxed text-smoke">
                  Location map will be added once classroom mapping is finalized.
                </p>
              </div>
            )}
          </div>

          {/* whatsapp group */}
          <div className="anim-rise-3 rounded-3xl border border-line bg-panel/70 p-7">
            <div className="mb-6 flex items-center justify-between">
              <p className="font-mono-nums text-[10px] tracking-[0.2em] text-faint">YOUR CLASS GROUP</p>
              {hasInvite ? (
                <span className="rounded-full border border-acid/40 bg-acid/10 px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.14em] text-acid">
                  INVITATION READY
                </span>
              ) : (
                <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 font-mono-nums text-[9px] tracking-[0.14em] text-amber">
                  NOT READY YET
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-ink-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3C7 3 3 6.6 3 11c0 2.1 1 4 2.6 5.4L4.5 21l4-1.7c1 .4 2.3.6 3.5.6 5 0 9-3.6 9-8s-4-8.9-9-8.9Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    className="text-acid"
                  />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-cream">{data.group?.groupName ?? `GL Bajaj — ${data.section} Official`}</p>
                <p className="font-mono-nums text-[10px] tracking-[0.14em] text-faint">
                  {data.section} · OFFICIAL CLASS GROUP
                </p>
              </div>
            </div>

            {hasInvite ? (
              otpStage === "idle" ? (
                <div className="mt-6">
                  <div className="space-y-2">
                    <label htmlFor="invite-email" className="font-mono-nums text-[10px] tracking-[0.16em] text-smoke">
                      EMAIL TO RECEIVE YOUR INVITE
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(false);
                      }}
                      placeholder="you@gmail.com"
                      aria-invalid={emailError || undefined}
                      className={`w-full rounded-xl border bg-ink-2 px-4 py-3 text-[14px] text-cream placeholder:text-faint/70 focus:border-acid/60 ${
                        emailError ? "border-rose/60" : "border-line"
                      }`}
                    />
                    {emailError && (
                      <p className="font-mono-nums text-[9.5px] tracking-[0.12em] text-rose">ENTER A VALID EMAIL</p>
                    )}
                  </div>
                  <button
                    onClick={sendOtp}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acid px-5 py-3.5 text-[14px] font-semibold text-[#101106] transition-colors hover:bg-cream"
                  >
                    Join WhatsApp Group
                  </button>
                  <p className="mt-3 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
                    A CODE IS SENT TO YOUR EMAIL TO CONFIRM IT&apos;S YOU. THE INVITE THEN LANDS IN THE SAME INBOX.
                  </p>
                </div>
              ) : otpStage === "sending" ? (
                <div className="mt-6 rounded-xl border border-line bg-ink-2/50 p-5">
                  <OtpStepper phase="sending" />
                </div>
              ) : otpStage === "code" ? (
                <div className="mt-6 rounded-xl border border-line bg-ink-2/50 p-5">
                  <p className="mb-1 text-[14px] font-semibold text-cream">Enter the code</p>
                  <p className="mb-4 font-mono-nums text-[10px] tracking-[0.12em] text-smoke">
                    SENT TO <span className="text-acid">{maskedEmail}</span>
                  </p>
                  {!demoOtp && delivery && delivery.sent && (
                    <p className="mb-4 font-mono-nums text-[10px] leading-relaxed tracking-[0.12em] text-smoke">
                      CHECK YOUR EMAIL — WE&apos;VE MAILED YOU THE CODE.
                    </p>
                  )}
                  {!demoOtp && delivery && !delivery.sent && (
                    <p className="mb-4 font-mono-nums text-[10px] leading-relaxed tracking-[0.14em] text-amber">
                      EMAIL DELIVERY FAILED ({delivery.provider.toUpperCase()}). CONTACT THE HELP DESK FOR A
                      MANUAL CODE.
                    </p>
                  )}
                  {demoOtp && (
                    <div className="anim-fadein mb-4 rounded-lg border border-acid/25 bg-acid/5 px-3 py-2">
                      <p className="font-mono-nums text-[9px] tracking-[0.14em] text-acid">SIMULATED DELIVERY · DEMO</p>
                      <p className="mt-1 font-mono-nums text-[15px] font-semibold tracking-[0.2em] text-cream">
                        CODE: {demoOtp}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={otpRef}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                      placeholder="••••••"
                      aria-label="Verification code"
                      className="font-mono-nums w-32 rounded-xl border border-line bg-ink-2 px-4 py-3 text-center text-[18px] tracking-[0.3em] text-cream focus:border-acid/60"
                    />
                    <button
                      onClick={verifyOtp}
                      disabled={otpValue.length !== 6}
                      className="flex-1 rounded-xl bg-acid px-4 py-3 text-[13.5px] font-semibold text-[#101106] transition-colors hover:bg-cream disabled:opacity-40"
                    >
                      Verify
                    </button>
                  </div>
                  {otpError && (
                    <p className="mt-3 font-mono-nums text-[10px] leading-relaxed tracking-[0.1em] text-rose">{otpError}</p>
                  )}
                  <button
                    onClick={sendOtp}
                    className="mt-3 font-mono-nums text-[10px] tracking-[0.14em] text-faint transition-colors hover:text-acid"
                  >
                    RESEND CODE
                  </button>
                </div>
              ) : otpStage === "verifying" ? (
                <div className="mt-6 rounded-xl border border-line bg-ink-2/50 p-5">
                  <OtpStepper phase="verifying" />
                </div>
              ) : otpStage === "done" && emailResult ? (
                <div className="mt-6 rounded-xl border border-acid/25 bg-acid/5 p-5">
                  {emailResult.sent ? (
                    <>
                      <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-cream">
                        <span className="check-pop flex h-5 w-5 items-center justify-center rounded-full bg-acid text-[#101106]">
                          <CheckIcon />
                        </span>
                        Verified — invite sent to your email.
                      </p>
                      <p className="mb-4 text-[13px] leading-relaxed text-smoke">
                        The group invite is on its way to <span className="text-cream-dim">{emailResult.to}</span>.
                        Open your inbox and tap <span className="text-acid">Join Group</span>.
                      </p>
                    </>
                  ) : emailResult.provider !== "simulated" ? (
                    <>
                      <p className="mb-3 text-[14px] font-semibold text-amber">
                        Invite email couldn&apos;t be delivered to {emailResult.to}.
                      </p>
                      <p className="mb-4 text-[13px] leading-relaxed text-smoke">
                        The email provider rejected the send. Check that the sender address is verified, then
                        contact the helpdesk or try again.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-cream">
                        <span className="check-pop flex h-5 w-5 items-center justify-center rounded-full bg-acid text-[#101106]">
                          <CheckIcon />
                        </span>
                        Verified.
                      </p>
                      <p className="mb-4 text-[13px] leading-relaxed text-smoke">
                        Email delivery is not configured yet — this preview shows what arrives once it is.
                      </p>
                    </>
                  )}

                  {emailResult.sent ? (
                    <div className="overflow-hidden rounded-xl border border-line bg-ink-2 text-left">
                      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                        <span className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">EMAIL SENT</span>
                        <span className="font-mono-nums text-[9px] tracking-[0.14em] text-acid">
                          {emailResult.provider === "brevo" ? "BREVO" : "RESEND"}
                        </span>
                      </div>
                      <div className="px-4 py-3 font-mono-nums text-[9.5px] tracking-[0.12em] text-faint">
                        <p>TO: {emailResult.to}</p>
                        <p className="mt-0.5">SUBJECT: {emailResult.subject}</p>
                      </div>
                      <p className="border-t border-line px-4 py-3 font-mono-nums text-[9.5px] tracking-[0.14em] text-acid">
                        ✓ DELIVERED — CHECK YOUR INBOX FOR THE JOIN LINK
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-hidden rounded-xl border border-line bg-ink-2 text-left">
                        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                          <span className="font-mono-nums text-[9px] tracking-[0.16em] text-faint">
                            {emailResult.provider !== "simulated" ? "EMAIL NOT SENT · PREVIEW" : "EMAIL PREVIEW"}
                          </span>
                          <span className="font-mono-nums text-[9px] tracking-[0.14em] text-acid">
                            {emailResult.provider === "resend" ? "RESEND" : emailResult.provider === "brevo" ? "BREVO" : "SIMULATED · DEMO"}
                          </span>
                        </div>
                        <div className="px-4 py-3 font-mono-nums text-[9.5px] tracking-[0.12em] text-faint">
                          <p>TO: {emailResult.to}</p>
                          <p className="mt-0.5">SUBJECT: {emailResult.subject}</p>
                        </div>
                        <pre className="whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-[12.5px] leading-relaxed text-cream-dim">
                          {emailResult.preview}
                        </pre>
                      </div>
                      <p className="mt-3 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
                        THE INVITE LINK IS DELIVERED BY EMAIL ONLY — IT IS NEVER SHOWN IN THIS BROWSER.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-rose/25 bg-rose/5 p-5">
                  <p className="text-[13.5px] text-cream-dim">{otpError}</p>
                  <button
                    onClick={resetOtp}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-acid px-5 py-3 text-[13px] font-semibold text-[#101106] transition-colors hover:bg-cream"
                  >
                    Try again
                  </button>
                </div>
              )
            ) : (
              <div className="mt-6 flex min-h-[120px] flex-col items-start justify-center rounded-xl border border-line bg-ink-2/40 p-5">
                <p className="text-[13.5px] font-medium text-cream">Your class group isn&apos;t ready yet.</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-smoke">
                  The invite opens here once the group is created and configured by the institute.
                </p>
              </div>
            )}

            <p className="mt-4 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
              ONE GROUP PER SECTION · OTP CONFIRMS YOUR REGISTERED NUMBER · INVITE LANDS IN YOUR EMAIL.
            </p>
          </div>
        </section>

        {/* class coordinator */}
        {faculty?.coordinator && (
          <section className="anim-rise-3 mt-6 overflow-hidden rounded-3xl border border-line bg-panel/70 p-7 sm:p-8">
            <p className="mb-5 font-mono-nums text-[10px] tracking-[0.2em] text-faint">YOUR CLASS COORDINATOR</p>
            <div
              className="faculty-card faculty-card-in faculty-card-glow flex flex-col items-start gap-6 rounded-2xl border border-line bg-ink-2/50 p-6 sm:flex-row sm:items-center"
              style={{ animationDelay: "0.15s", "--d": "0.15s" } as React.CSSProperties}
            >
              <span className="faculty-sheen" style={{ "--d": "0.15s" } as React.CSSProperties} />
              <FacultyAvatar
                name={faculty.coordinator.name}
                photo={faculty.coordinator.photo}
                size={92}
                role="coordinator"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[20px] font-semibold tracking-[-0.02em] text-cream">{faculty.coordinator.name}</p>
                <p className="mt-1 font-mono-nums text-[10px] tracking-[0.16em] text-acid">CLASS COORDINATOR · {data.section}</p>
                {faculty.coordinator.subject && (
                  <p className="mt-2 text-[13px] text-smoke">{faculty.coordinator.subject}</p>
                )}
              </div>
              {faculty.coordinator.mobile && (
                <a
                  href={`tel:${faculty.coordinator.mobile}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-panel-2 px-4 py-2.5 font-mono-nums text-[12px] text-cream transition-colors hover:border-acid/50 hover:text-acid"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {faculty.coordinator.mobile}
                </a>
              )}
            </div>
          </section>
        )}

        {/* faculty not published for this section yet */}
        {faculty !== null && !faculty.coordinator && faculty.faculty.length === 0 && (
          <section className="anim-rise-3 mt-6 rounded-3xl border border-line bg-panel/70 p-7 sm:p-8">
            <p className="font-mono-nums text-[10px] tracking-[0.2em] text-faint">YOUR FACULTY</p>
            <p className="mt-3 text-[15px] font-medium text-cream">
              Faculty details for {data.section} haven&apos;t been uploaded yet.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-smoke">
              Your class coordinator and subject teachers will appear here as soon as the institute publishes them.
            </p>
          </section>
        )}

        {/* know your faculty — the deck supplies its own copy and rail.
            It must NOT sit inside the old .faculty-showcase panel: that rule
            sets overflow:hidden, which makes the panel a scroll container and
            breaks position:sticky for the pinned deck inside it. */}
        {faculty && faculty.faculty.length > 0 && (
          <FacultyCascade items={faculty.faculty} />
        )}

        {/* weekly timetable — a deliberately LIGHT card, so it reads as a
            different surface from the dark faculty deck sitting above it. */}
        {timetable.length > 0 && (
          <section className="anim-rise-4 mt-8 rounded-3xl border border-[#20180D]/15 bg-[#EDE4D7] p-7 text-[#20180D] shadow-[0_40px_80px_-50px_rgba(0,0,0,0.85)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono-nums text-[10px] tracking-[0.2em] text-[#20180D]/50">YOUR TIMETABLE</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportIcs}
                  className="rounded-full border border-[#20180D]/20 bg-[#20180D]/5 px-3.5 py-1.5 font-mono-nums text-[10px] tracking-[0.14em] text-[#20180D] transition-colors hover:border-[#b5722a]/60 hover:text-[#b5722a]"
                >
                  ADD TO CALENDAR
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-full border border-[#20180D]/20 bg-[#20180D]/5 px-3.5 py-1.5 font-mono-nums text-[10px] tracking-[0.14em] text-[#20180D] transition-colors hover:border-[#b5722a]/60 hover:text-[#b5722a]"
                >
                  SAVE AS PDF
                </button>
                <button
                  onClick={shareCard}
                  className="rounded-full bg-[#20180D] px-3.5 py-1.5 font-mono-nums text-[11px] tracking-[0.14em] text-[#EDE4D7] transition-colors hover:bg-[#3a2f18]"
                >
                  SHARE MY CLASS
                </button>
              </div>
            </div>
            {shareMsg && (
              <p className="mt-3 font-mono-nums text-[10px] tracking-[0.12em] text-[#b5722a]">{shareMsg}</p>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="border-b border-[#20180D]/15 px-2 py-2 font-mono-nums text-[9px] tracking-[0.16em] text-[#20180D]/45">
                      DAY
                    </th>
                    {periods.map((p) => (
                      <th key={p} className="border-b border-[#20180D]/15 px-2 py-2 font-mono-nums text-[9px] tracking-[0.14em] text-[#20180D]/45">
                        P{p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4, 5].map((d) => {
                    const rowSlots = timetable.filter((s) => s.day === d);
                    if (!rowSlots.length) return null;
                    return (
                      <tr key={d}>
                        <td className="border-b border-[#20180D]/10 px-2 py-2.5 font-mono-nums text-[10px] tracking-[0.1em] text-[#b5722a]">
                          {DAY_LABELS[d].slice(0, 3).toUpperCase()}
                        </td>
                        {periods.map((p) => {
                          const cell = rowSlots.filter((s) => s.period === p);
                          return (
                            <td key={p} className="border-b border-[#20180D]/10 px-2 py-2.5 align-top">
                              {cell.length === 0 ? (
                                <span className="text-[#20180D]/25">·</span>
                              ) : (
                                cell.map((s, i) => (
                                  <span key={i} className="block text-[11px] leading-tight text-[#20180D]">
                                    {s.subject ?? s.subjectCode}
                                    {s.group && (
                                      <span className="ml-1 font-mono-nums text-[8.5px] text-[#20180D]/45">
                                        {s.group}
                                      </span>
                                    )}
                                  </span>
                                ))
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-[#20180D]/45">
              FROM THE OFFICIAL SECTION TIMETABLE. LAB PERIODS MAY SPLIT INTO GROUPS (T1 / T2).
            </p>
          </section>
        )}

        {/* timetable not published for this section yet */}
        {faculty !== null && timetable.length === 0 && (
          <section className="anim-rise-4 mt-8 rounded-3xl border border-[#20180D]/15 bg-[#EDE4D7] p-7 text-[#20180D] sm:p-8">
            <p className="font-mono-nums text-[10px] tracking-[0.2em] text-[#20180D]/50">YOUR TIMETABLE</p>
            <p className="mt-3 text-[15px] font-medium text-[#20180D]">Timetable not uploaded yet.</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#20180D]/65">
              The weekly schedule for {data.section} will appear here once the institute uploads it.
            </p>
          </section>
        )}

        {/* footer actions */}
        <div className="anim-rise-4 mt-10 flex flex-wrap items-center justify-between gap-4">
          <p className="font-mono-nums text-[10px] tracking-[0.14em] text-faint">
            NEED HELP? CONTACT THE ADMISSION HELPDESK
          </p>
          <div className="flex gap-5">
            <Link href="/find" className="font-mono-nums text-[10px] tracking-[0.14em] text-faint transition-colors hover:text-cream">
              NOT YOU? START OVER
            </Link>
            <Link href="/help" className="font-mono-nums text-[10px] tracking-[0.14em] text-faint transition-colors hover:text-cream">
              HELP
            </Link>
          </div>
        </div>
      </main>

      {/* modals */}
      <Modal open={showLocation} onClose={() => setShowLocation(false)} label="Classroom location">
        {data.classroom ? (
          <div className="max-h-[88dvh] overflow-y-auto p-6 sm:p-8">
            <p className="mb-1 font-mono-nums text-[10px] tracking-[0.22em] text-acid">CLASSROOM LOCATION</p>
            <h3 className="mb-6 text-xl font-semibold tracking-[-0.02em] text-cream">
              Room {data.classroom.roomNumber}
            </h3>
            <div className="mb-6 space-y-2">
              <FieldRow label="BUILDING" value={data.classroom.building ?? "—"} />
              <FieldRow label="FLOOR" value={data.classroom.floorLabel ?? "—"} />
              <FieldRow label="ROOM" value={data.classroom.roomNumber ?? "—"} />
            </div>

            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setMapMode("holographic")}
                className={`rounded-full border px-4 py-1.5 font-mono-nums text-[10px] tracking-[0.14em] transition-colors ${
                  mapMode === "holographic"
                    ? "border-acid/50 bg-acid/10 text-acid"
                    : "border-line text-faint hover:text-cream"
                }`}
              >
                HOLOGRAPHIC 3D
              </button>
              <button
                onClick={() => setMapMode("schematic")}
                className={`rounded-full border px-4 py-1.5 font-mono-nums text-[10px] tracking-[0.14em] transition-colors ${
                  mapMode === "schematic"
                    ? "border-acid/50 bg-acid/10 text-acid"
                    : "border-line text-faint hover:text-cream"
                }`}
              >
                SCHEMATIC
              </button>
            </div>

            {mapMode === "holographic" ? (
              <Campus3DMap
                roomNumber={data.classroom.roomNumber}
                floor={data.classroom.floor}
                building={data.classroom.building}
                section={data.section}
                onExit={() => setShowLocation(false)}
              />
            ) : (
              <FloorMap classroom={data.classroom} />
            )}
            <div className="mt-4 rounded-xl border border-line bg-ink-2/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono-nums text-[10px] tracking-[0.2em] text-acid">WALKING DIRECTIONS</p>
                <span className="rounded-full border border-acid/40 bg-acid/10 px-2 py-0.5 font-mono-nums text-[9px] tracking-[0.12em] text-acid">
                  FULL TOUR COMING SOON
                </span>
              </div>
              <ol className="space-y-2.5">
                {walkSteps(data.classroom).map((s) => (
                  <li key={s.n} className="flex items-start gap-3">
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-acid/50 bg-acid/10 font-mono-nums text-[10px] text-acid">
                      {s.n}
                    </span>
                    <span className="text-[13px] leading-snug text-cream">{s.text}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 border-t border-line pt-3 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
                EXACT ROOM POSITION WILL BE PINNED AFTER THE CAMPUS RECORDING IS MODELLED.
              </p>
            </div>
            <p className="mt-4 font-mono-nums text-[9.5px] leading-relaxed tracking-[0.12em] text-faint">
              {data.classroom.mappingStatus === "inferred_seed" || data.classroom.mappingStatus === "research_seed"
                ? "ROOM DATA IS SEEDED/CONFIGURABLE. FINAL CONFIRMATION PENDING THE OFFICIAL TIMETABLE."
                : "ROOM CONFIRMED."}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function walkSteps(c: { floor: number | null; floorLabel: string | null; roomNumber: string | null; building: string | null }): Array<{ n: number; text: string }> {
  const floor = c.floor ?? 1;
  const room = c.roomNumber ?? "—";
  const building = c.building ?? "Academic building";
  return [
    { n: 1, text: "Enter the campus through the Main Gate (Gates 1 & 2 are for B.Tech students)." },
    { n: 2, text: `Walk up the driveway, past Academic Block-2, toward ${building}.` },
    { n: 3, text: `Go inside ${building} through the main entrance — the stairs and lift are right at the entrance.` },
    { n: 4, text: `Take the stairs (or lift) up to Floor ${floor}.` },
    { n: 5, text: `Room ${room} is on Floor ${floor} — follow the room-number signs down the corridor.` },
  ];
}

interface FacultyInfo {
  id: number;
  section: string | null;
  role: string;
  name: string;
  subject: string | null;
  subjects?: string[];
  mobile: string | null;
  photo: string | null;
}

function FacultyAvatar({ name, photo, size = 64, role = "faculty" }: { name: string; photo?: string | null; size?: number; role?: "coordinator" | "faculty" }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const ring = role === "coordinator" ? "from-[#c9f25a] to-[#00c2a8]" : "from-[#00c2a8] to-[#7fb4ff]";
  return (
    <div className="faculty-avatar-ring relative shrink-0 rounded-full bg-gradient-to-br p-[2px]">
      <div
        className={`rounded-full bg-gradient-to-br ${ring} p-[2px]`}
        style={{ width: size, height: size }}
      >
        {photo && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            onError={() => setBroken(true)}
            className="h-full w-full rounded-full object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-full bg-ink-2 font-mono-nums font-semibold text-cream"
            style={{ width: size, height: size, fontSize: size * 0.32 }}
          >
            {initials || "•"}
          </div>
        )}
      </div>
    </div>
  );
}

function facultyInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function MirrorCardInner({ f, index }: { f: FacultyInfo; index: number }) {
  return (
    <div className="mirror-card-inner">
      <div className="mirror-card-art">
        <span className="mirror-card-index">0{index + 1}</span>
        <span className="mirror-card-role">{f.section ?? "FIRST YEAR"}</span>
        <FacultyAvatar name={f.name} photo={f.photo} size={104} />
        <span className="mirror-card-monogram">{facultyInitials(f.name)}</span>
        <span className="mirror-card-grid" />
      </div>
      <div className="mirror-card-body">
        <p className="mirror-card-kicker">KNOW YOUR FACULTY</p>
        <p className="mirror-card-name">{f.name}</p>
        <p className="mirror-card-subject">{f.subject ?? "Faculty member"}</p>
        <div className="mirror-card-footer">
          <span className="mirror-card-caption">GLBITM · {f.section ?? "ACADEMIC TEAM"}</span>
          {f.mobile ? (
            <a href={`tel:${f.mobile}`} className="mirror-card-phone" aria-label={`Call ${f.name}`} onClick={(e) => e.stopPropagation()}>
              CALL
              <span aria-hidden>↗</span>
            </a>
          ) : (
            <span className="mirror-card-phone mirror-card-phone-muted">CONTACT ADMIN</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FacultyMirrorShowcase({ items }: { items: FacultyInfo[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setInterval(() => setActive((a) => (a + 1) % count), 4200);
    return () => clearInterval(t);
  }, [paused, count]);
  return (
    <div
      className="mirror-stage"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      {items.map((f, i) => {
        const d = i - active;
        const dist = Math.abs(d);
        const scale = Math.max(0.56, 1 - dist * 0.14);
        const opacity = Math.max(0.22, 1 - dist * 0.26);
        const rot = -d * 18;
        const z = 20 - dist;
        const activeCard = d === 0;
        return (
          <button
            key={f.id}
            type="button"
            className={`mirror-card ${activeCard ? "mirror-card-active" : ""}`}
            style={{
              zIndex: z,
              opacity,
              transform: `translate(-50%, -50%) translateX(${d * (330 + 20)}px) scale(${scale}) rotateY(${rot}deg)`,
            }}
            onClick={() => setActive(i)}
            aria-label={`Focus ${f.name}`}
          >
            <MirrorCardInner f={f} index={i} />
            <span className="mirror-card-reflection" aria-hidden>
              <MirrorCardInner f={f} index={i} />
            </span>
          </button>
        );
      })}
      {count > 1 && (
        <>
          <button
            type="button"
            className="mirror-arrow mirror-arrow-prev"
            onClick={() => setActive((a) => (a - 1 + count) % count)}
            aria-label="Previous faculty"
          >
            ←
          </button>
          <button
            type="button"
            className="mirror-arrow mirror-arrow-next"
            onClick={() => setActive((a) => (a + 1) % count)}
            aria-label="Next faculty"
          >
            →
          </button>
          <div className="mirror-dots">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`mirror-dot ${i === active ? "active" : ""}`}
                onClick={() => setActive(i)}
                aria-label={`Faculty profile ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono-nums text-[10px] tracking-[0.18em] text-faint">{label}</span>
      <span className="text-right text-[13.5px] text-cream-dim">{value}</span>
    </div>
  );
}
