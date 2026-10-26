"use client";

import { useEffect, useState } from "react";

/**
 * Language toggle backed by Google Translate.
 *
 * English is the default and the page language, so a first-time visitor sees
 * English with no translation applied. Choosing Hindi writes the `googtrans`
 * cookie Google's element reads and reloads once, which is how the widget is
 * driven without showing its own banner.
 */
const LANGS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हिं" },
];

const GOOGTRANS = "googtrans";

function currentLang(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(new RegExp(`${GOOGTRANS}=/en/([a-zA-Z-]+)`));
  return m ? m[1] : "en";
}

function setLang(code: string) {
  const host = location.hostname;
  const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  // clear both scopes, then set the requested one
  document.cookie = `${GOOGTRANS}=; path=/; ${expire}`;
  document.cookie = `${GOOGTRANS}=; path=/; domain=.${host}; ${expire}`;
  if (code !== "en") {
    document.cookie = `${GOOGTRANS}=/en/${code}; path=/`;
    document.cookie = `${GOOGTRANS}=/en/${code}; path=/; domain=.${host}`;
  }
  location.reload();
}

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: { translate?: { TranslateElement: new (opts: unknown, id: string) => void } };
  }
}

export default function LanguageToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    setLangState(currentLang());
    if (document.getElementById("google-translate-script")) return;

    window.googleTranslateElementInit = () => {
      const g = window.google;
      if (!g?.translate) return;
      new g.translate.TranslateElement(
        { pageLanguage: "en", includedLanguages: "en,hi", autoDisplay: false },
        "google_translate_element",
      );
    };

    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const wrap =
    tone === "dark"
      ? "border-line bg-ink-2/60 backdrop-blur-md"
      : "border-carbon/20 bg-paper/60 backdrop-blur-md";
  const idle = tone === "dark" ? "text-smoke hover:text-cream" : "text-carbon/70 hover:text-carbon";
  const active = tone === "dark" ? "bg-acid text-[#101106]" : "bg-carbon text-paper";

  return (
    <div className={`flex items-center gap-0.5 rounded-full border px-1 py-0.5 ${wrap}`} title="Language">
      <span id="google_translate_element" className="hidden" aria-hidden />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-full px-2 py-0.5 font-mono-nums text-[10px] tracking-[0.12em] transition-colors ${
            lang === l.code ? active : idle
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
