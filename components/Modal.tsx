"use client";

import { useEffect, useRef, useState } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, label, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The entrance animation is dropped once it has played. Keeping it would
  // leave a filled `transform` on the panel (animation-fill-mode: both), which
  // makes the panel the containing block for `position: fixed` descendants —
  // trapping the fullscreen 3D card inside the modal on devices without the
  // element Fullscreen API (iOS), instead of covering the screen.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) setEntered(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dark-shell anim-fadein fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        onAnimationEnd={() => setEntered(true)}
        className={`relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-line bg-panel outline-none sm:rounded-3xl ${
          entered ? "" : "anim-scalein"
        }`}
      >
        <div className="absolute right-4 top-4 z-10">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ink/60 text-smoke transition-colors hover:border-line-strong hover:text-cream"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}