"use client";

import { useId, useRef } from "react";

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  error?: boolean;
  autoComplete?: string;
}

export default function PhoneInput({ id, value, onChange, error, autoComplete }: PhoneInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const ref = useRef<HTMLInputElement>(null);

  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  const display = digits ? (digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits) : "";

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono-nums text-[15px] text-carbon-faint">
        +91
      </span>
      <input
        ref={ref}
        id={inputId}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder="XXXXX XXXXX"
        value={display}
        onChange={(e) => {
          let next = e.target.value.replace(/[^\d]/g, "");
          if (next.length === 12 && next.startsWith("91")) next = next.slice(2);
          next = next.slice(0, 10);
          onChange(next);
        }}
        aria-invalid={error || undefined}
        className={`font-mono-nums w-full rounded-xl border bg-white/70 py-3.5 pl-[4.25rem] pr-4 text-[15px] text-carbon placeholder:text-carbon-faint/60 transition-all duration-200 focus:bg-white ${
          error
            ? "border-rose/70 focus:border-rose"
            : "border-rule focus:border-acid-line focus:shadow-[0_0_0_3px_rgba(201,242,90,0.18)]"
        }`}
      />
    </div>
  );
}
