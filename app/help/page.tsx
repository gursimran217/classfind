import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import PaperBackdrop from "@/components/PaperBackdrop";

export const metadata = {
  title: "Help — CLASSFIND",
};

const FAQS = [
  {
    q: "Which name and number should I enter?",
    a: "Use exactly the same full name and mobile number you submitted during admission. The system matches your details against the uploaded admission workbook.",
  },
  {
    q: "Why can't I find my details?",
    a: "Double-check spelling, spaces and the phone number. A mismatch in any digit returns no result. If it still doesn't work, contact the admission helpdesk.",
  },
  {
    q: "I see 'more than one possible record'.",
    a: "Occasionally a name and number combination appears more than once in the admission data. To keep every student's details safe, we never guess — contact the helpdesk to confirm.",
  },
  {
    q: "What do the classroom details mean?",
    a: "Room, floor and building come from a configurable classroom map. Where a final room isn't confirmed yet, the panel marks it as 'seed · pending confirmation'.",
  },
  {
    q: "What about the WhatsApp group?",
    a: "Your section's official group name is shown on your result. Invite links are added by the institute; the prototype shows a preview until the real link is configured.",
  },
  {
    q: "Is my information private?",
    a: "Yes. Only your name and mobile number are used to look up your class. No marks, family details or admission data are shown, and your details are never shared.",
  },
];

export default function HelpPage() {
  return (
    <div className="sunset relative flex min-h-dvh flex-col">
      <PaperBackdrop />
      <div className="relative z-10 flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-10 sm:px-8">
        <div className="anim-rise">
          <p className="mb-3 font-mono-nums text-[11px] tracking-[0.3em] text-acid">HELP</p>
          <h1 className="text-balance text-[clamp(2rem,5vw,3rem)] font-semibold leading-tight tracking-[-0.03em] text-cream">
            Need a hand?
          </h1>
          <p className="mt-3 text-[15px] text-smoke">
            Everything you need to know about finding your class.
          </p>
        </div>

        <div className="anim-rise-1 mt-10 space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-line bg-panel/60 transition-colors open:border-line-strong hover:border-line-strong"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-[14.5px] font-medium text-cream marker:content-none">
                {f.q}
                <span className="font-mono-nums text-[12px] text-faint transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="border-t border-line px-6 py-5">
                <p className="text-[13.5px] leading-relaxed text-smoke">{f.a}</p>
              </div>
            </details>
          ))}
        </div>

        <div className="anim-rise-2 mt-10 rounded-2xl border border-line bg-panel/60 p-7">
          <p className="mb-1.5 font-mono-nums text-[10px] tracking-[0.2em] text-faint">STILL STUCK?</p>
          <p className="text-[14px] leading-relaxed text-smoke">
            Contact the admission helpdesk with your admission details. They can confirm your section,
            roll number and classroom from the official records.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/find"
              className="inline-flex items-center gap-2 rounded-full bg-acid px-6 py-3 text-[13.5px] font-semibold text-[#101106] transition-colors hover:bg-cream"
            >
              Try again
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-line px-6 py-3 text-[13.5px] font-medium text-smoke transition-colors hover:border-line-strong hover:text-cream"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-mono-nums text-[10px] tracking-[0.16em] text-faint">
            CLASSFIND · STUDENT ONBOARDING PROTOTYPE
          </p>
          <Link href="/admin" className="font-mono-nums text-[10px] tracking-[0.16em] text-faint transition-colors hover:text-smoke">
            ADMIN
          </Link>
        </div>
      </footer>
      </div>
    </div>
  );
}