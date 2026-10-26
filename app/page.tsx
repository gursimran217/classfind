import Link from "next/link";
import PaperNav from "@/components/PaperNav";
import FilmScroll from "@/components/FilmScroll";
import DeckHero from "@/components/DeckHero";
import PaperBackdrop from "@/components/PaperBackdrop";

// campus reel covers, cut from our own footage / the glbimg set
const RING_COVERS = Array.from({ length: 16 }, (_, i) => `/ring/${String(i + 1).padStart(2, "0")}.jpg`);

type Strip = {
  index: string;
  total: string;
  title: string;
  meta: string;
  note: string;
  href: string;
  aspect: "portrait" | "wide";
  cards: string[];
};

const STRIPS: Strip[] = [
  {
    index: "01",
    total: "02",
    title: "Academic Block-1",
    meta: "First-year block · Rooms 401–433 · AB1, 4th floor",
    note: "OPEN MAP",
    href: "/find",
    aspect: "portrait",
    cards: ["/ring/01.jpg", "/ring/05.jpg", "/ring/09.jpg", "/ring/13.jpg"],
  },
  {
    index: "02",
    total: "02",
    title: "SHD Auditorium",
    meta: "900+ seats · Events and sessions",
    note: "OPEN MAP",
    href: "/find",
    aspect: "wide",
    cards: ["/shd/01.jpg", "/shd/02.jpg", "/shd/03.jpg", "/shd/04.jpg"],
  },
];

const INDEX_ROWS: Array<{ n: string; label: string; value: string }> = [
  { n: "01", label: "Main gate", value: "Gates 1–3" },
  { n: "02", label: "Academic blocks", value: "AB1 · AB2" },
  { n: "03", label: "Auditorium", value: "SHD · 900+" },
  { n: "04", label: "Library", value: "Central · RFID" },
];

function Strip({ s }: { s: Strip }) {
  // cards fan slightly, alternating rotation, like a filmstrip laid on paper
  const rots = [-3.5, 2, -1.5, 3];
  return (
    <section className="rule-t">
      <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8 sm:py-28">
        {/* the label sits ABOVE the images, never below them */}
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="font-display text-[clamp(2.6rem,10vw,7rem)] text-carbon">{s.title}</h2>
          <p className="mt-3 font-mono-nums text-[13px] tracking-[0.14em] text-carbon-soft">{s.meta}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {s.cards.map((c, i) => (
            <figure
              key={c + i}
              className="strip-card overflow-hidden rounded-[3px] bg-paper-2"
              style={{ transform: `rotate(${rots[i % rots.length]}deg)` }}
            >
              <img
                src={c}
                alt=""
                loading="lazy"
                decoding="async"
                className={`${s.aspect === "wide" ? "aspect-[4/3]" : "aspect-[3/4]"} w-full object-cover`}
              />
            </figure>
          ))}
        </div>

        <div className="mt-14 flex items-center justify-between gap-4 border-t border-rule pt-4">
          <span className="font-mono-nums text-[12px] tracking-[0.18em] text-carbon-soft">
            SCROLL TO CONTINUE
          </span>
          <Link
            href={s.href}
            className="font-mono-nums text-[12px] tracking-[0.18em] text-carbon transition-opacity hover:opacity-60"
          >
            {s.index} / {s.total}&nbsp;&nbsp;{s.title.toUpperCase()} _ {s.note}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="paper relative min-h-dvh">
      <PaperNav />

      <FilmScroll />

      {/* From the ring down, the sunset / cloud backdrop sits behind everything.
          The film above keeps its own opaque treatment, so it covers this. */}
      <div className="sunset relative">
        <PaperBackdrop />
        <div className="relative z-10">

      {/* campus ring — the page after the film ends */}
      <section id="campus-ring" className="relative">
        <div className="mx-auto max-w-[1360px] px-5 pb-8 pt-20 sm:px-8 sm:pt-28">
          <p className="paper-label mb-4">02 — Campus</p>
          <h2 className="font-display text-[clamp(2rem,6.2vw,4.4rem)] leading-[1.0] text-carbon">
            Know your <em>campus</em>
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-carbon-soft">
            The reel keeps turning. Drag, swipe or scroll to walk it round.
          </p>
        </div>
        {/* full bleed: no container padding, so the ring reaches both edges */}
        <div className="pb-20 sm:pb-28">
          <DeckHero mode="ring" covers={RING_COVERS} embedded />
        </div>
      </section>

      {/* campus index — restored. Images now come from the real photo set
          (/ring) rather than the 3D model renders (/scenes). */}
      <section id="campus" className="rule-t scroll-mt-16">
        <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="paper-label mb-6">GL Bajaj · student onboarding</p>
              <h2 className="font-display text-[clamp(2.4rem,7vw,5rem)] text-carbon">
                Selected <em>places</em> on campus
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-carbon-soft">
                Every first-year classroom, block and facility, mapped and ready before you walk in.
              </p>
              <Link
                href="/find"
                className="group mt-8 inline-flex h-12 items-center gap-3 rounded-full bg-[#20180D] pl-6 pr-2 text-[14px] font-semibold tracking-[-0.01em] text-[#EDE4D7] shadow-[0_18px_38px_-22px_rgba(32,24,13,0.85)] transition-colors duration-200 hover:bg-[#33280f]"
              >
                Find your class
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#EDE4D7] text-[13px] leading-none text-[#20180D] transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            </div>

            <div className="lg:pl-10">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <span className="paper-label">Campus index</span>
                <span className="paper-label">04 entries</span>
              </div>
              <ul>
                {INDEX_ROWS.map((r) => (
                  <li
                    key={r.n}
                    className="flex items-baseline justify-between gap-6 border-b border-rule py-3.5"
                  >
                    <span className="font-mono-nums text-[12px] tracking-[0.18em] text-carbon-soft">
                      {r.n}
                    </span>
                    <span className="flex-1 text-[15px] font-medium text-carbon">{r.label}</span>
                    <span className="font-mono-nums text-[12px] tracking-[0.16em] text-carbon-soft">
                      {r.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {["04", "08", "12", "16"].map((c, i) => (
              <figure
                key={c}
                className="strip-card overflow-hidden rounded-[3px] bg-paper-2"
                style={{ transform: `rotate(${[-2, 1.5, -1, 2.5][i]}deg)` }}
              >
                <img
                  src={`/ring/${c}.jpg`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
              </figure>
            ))}
          </div>
        </div>
      </section>

      {STRIPS.map((s) => (
        <Strip key={s.index} s={s} />
      ))}

      {/* how it works */}
      <section id="how" className="rule-t scroll-mt-20">
        <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8 sm:py-28">
          <p className="paper-label mb-8">How it works</p>
          <div className="grid gap-10 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Enter your details",
                d: "Your full name and the mobile number you submitted during admission.",
              },
              {
                n: "02",
                t: "Verified against records",
                d: "A private, exact match on the uploaded student list. No lookups of other students.",
              },
              {
                n: "03",
                t: "Know your classroom",
                d: "Section, roll number, room, building and floor — plus your class WhatsApp group.",
              },
            ].map((s) => (
              <div key={s.n} className="border-t border-rule pt-5">
                <span className="font-mono-nums text-[11px] tracking-[0.2em] text-carbon-soft">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-[26px] text-carbon">{s.t}</h3>
                <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-carbon-soft">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* closing statement over clouds */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/film3/clouds.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-paper/45" />
        <div className="mx-auto max-w-[1360px] px-5 py-28 sm:px-8 sm:py-40">
          <div className="border-y border-carbon/25 py-10 sm:py-14">
            <h2 className="font-display text-[clamp(2rem,7vw,5.5rem)] leading-[1.05] text-carbon">
              Tell us your section,
              <br />
              <em>we will tell you the room.</em>
            </h2>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-4">
            <Link
              href="/find"
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#20180D] pl-6 pr-2 text-[14px] font-semibold tracking-[-0.01em] text-[#EDE4D7] shadow-[0_18px_38px_-22px_rgba(32,24,13,0.85)] transition-colors duration-200 hover:bg-[#33280f]"
            >
              Find my class
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-full bg-[#EDE4D7] text-[13px] leading-none text-[#20180D] transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <Link
              href="/help"
              className="inline-flex items-center gap-2 text-[15px] text-carbon/85 transition-colors hover:text-carbon"
            >
              Need help?
            </Link>
          </div>
        </div>
      </section>

      <footer className="rule-t">
        <div className="mx-auto max-w-[1360px] px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center border border-carbon/25">
                <span className="font-display text-[15px] text-carbon">CF</span>
              </span>
              <div className="font-mono-nums text-[11px] leading-[1.6] tracking-[0.16em] text-carbon/80">
                CLASSFIND
                <br />
                STUDENT ONBOARDING
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-2 sm:grid-cols-3">
              {[
                ["Campus", "#campus"],
                ["How it works", "#how"],
                ["Help", "/help"],
                ["Find my class", "/find"],
                ["Admin", "/admin"],
              ].map(([label, href]) =>
                href.startsWith("/") ? (
                  <Link
                    key={label}
                    href={href}
                    className="font-mono-nums text-[12px] tracking-[0.14em] text-carbon/85 transition-colors hover:text-carbon"
                  >
                    {label}
                  </Link>
                ) : (
                  <a
                    key={label}
                    href={href}
                    className="font-mono-nums text-[12px] tracking-[0.14em] text-carbon/85 transition-colors hover:text-carbon"
                  >
                    {label}
                  </a>
                ),
              )}
            </div>
          </div>
          <p className="mt-10 border-t border-rule pt-5 font-mono-nums text-[11px] tracking-[0.16em] text-carbon-soft">
            GL BAJAJ INSTITUTE OF TECHNOLOGY &amp; MANAGEMENT · PROTOTYPE
          </p>
        </div>
      </footer>
        </div>
      </div>
    </div>
  );
}
