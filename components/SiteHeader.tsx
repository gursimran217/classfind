import Link from "next/link";
import LanguageToggle from "@/components/LanguageToggle";

export default function SiteHeader({ overlay = false }: { overlay?: boolean } = {}) {
  return (
    <header
      className={
        overlay
          ? "pointer-events-none fixed inset-x-0 top-0 z-50"
          : "relative z-40"
      }
    >
      {overlay && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink/70 to-transparent"
        />
      )}
      <div className={overlay ? "pointer-events-auto" : undefined}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-baseline gap-2"
          aria-label="CLASSFIND home"
        >
          <span className="notranslate font-mono-nums text-[13px] font-semibold tracking-[0.28em] text-cream">
            CLASS<span className="text-acid">FIND</span>
          </span>
          <span className="font-mono-nums text-[9px] tracking-[0.2em] text-faint">/01</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5" aria-label="Primary">
          <a
            href="/#how"
            className="whitespace-nowrap text-[13px] text-smoke transition-colors hover:text-cream"
          >
            How it works
          </a>
          <Link href="/help" className="whitespace-nowrap text-[13px] text-smoke transition-colors hover:text-cream">
            Help
          </Link>
          <LanguageToggle tone="dark" />
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-acid" />
            <span className="font-mono-nums text-[10px] tracking-[0.14em] text-smoke">
              PROTOTYPE
            </span>
          </span>
        </nav>
      </div>
      </div>
    </header>
  );
}