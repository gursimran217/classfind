"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LanguageToggle from "@/components/LanguageToggle";

/** Flat top-bar links, laid out on one centred line (wrapping on narrow
 *  screens) rather than the previous three left-hugging columns. */
const LINKS: Array<{ label: string; href: string }> = [
  { label: "Campus", href: "#campus" },
  { label: "Blocks", href: "#campus" },
  { label: "Facilities", href: "#campus" },
  { label: "How it works", href: "#how" },
  { label: "Process", href: "#how" },
  { label: "Help", href: "/help" },
  { label: "Say hello", href: "/help" },
  { label: "Careers", href: "/help" },
];

export default function PaperNav() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "Asia/Kolkata",
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-paper/90 via-paper/45 to-transparent"
      />
      <div className="pointer-events-auto relative mx-auto max-w-[1360px] px-4 pt-3 sm:px-8 sm:pt-5">
        {/* row 1 — mark + utility */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="CLASSFIND home" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center border border-carbon/25">
              <span className="font-display text-[15px] leading-none text-carbon">CF</span>
            </span>
            <span className="notranslate hidden font-mono-nums text-[11px] tracking-[0.22em] text-carbon/80 xl:block">
              CLASSFIND
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <LanguageToggle />
            <div className="hidden text-right sm:block">
              <div className="inline-block border border-carbon/25 px-2.5 py-1 font-mono-nums text-[11px] tracking-[0.1em] text-carbon">
                {time}
              </div>
              <p className="mt-1 font-mono-nums text-[11px] leading-[1.5] tracking-[0.15em] text-carbon/75">
                GL BAJAJ · GREATER NOIDA
                <br />
                SC 01
              </p>
            </div>
            <Link
              href="/find"
              className="group inline-flex h-10 items-center gap-2.5 rounded-full bg-[#20180D] pl-4 pr-2 text-[13px] font-semibold tracking-[-0.01em] text-[#EDE4D7] shadow-[0_10px_26px_-12px_rgba(20,12,4,0.8)] transition-colors duration-200 hover:bg-[#3a2f18]"
            >
              Find my class
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-full bg-[#EDE4D7] text-[11px] leading-none text-[#20180D] transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        {/* row 2 — links, centred on desktop and mobile alike */}
        <nav
          aria-label="Primary"
          className="mx-auto mt-2.5 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3.5 gap-y-1 rounded-full bg-paper/75 px-3.5 py-1.5 ring-1 ring-carbon/10 backdrop-blur-md sm:gap-x-5 sm:px-4"
        >
          {LINKS.map((l) =>
            l.href.startsWith("/") ? (
              <Link
                key={l.label}
                href={l.href}
                className="whitespace-nowrap text-[12px] text-carbon/85 transition-colors hover:text-carbon sm:text-[13px]"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={l.href}
                className="whitespace-nowrap text-[12px] text-carbon/85 transition-colors hover:text-carbon sm:text-[13px]"
              >
                {l.label}
              </a>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
