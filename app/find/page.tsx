import PaperNav from "@/components/PaperNav";
import PaperBackdrop from "@/components/PaperBackdrop";
import FindForm from "@/components/FindForm";

export const metadata = {
  title: "Find My Class — CLASSFIND",
};

export default function FindPage() {
  return (
    <div className="sunset relative flex min-h-dvh flex-col">
      <PaperBackdrop />
      <PaperNav />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-24 pt-32 sm:px-8 sm:pt-36">
        <div className="anim-rise mb-9">
          <p className="paper-label mb-4">Find my class</p>
          <h1 className="font-display text-balance text-[clamp(2.1rem,6vw,3.4rem)] leading-[1.02] text-carbon">
            Let&apos;s find <em>your classroom.</em>
          </h1>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-carbon-soft">
            Use the same name and mobile number submitted during admission.
          </p>
        </div>

        <div className="anim-rise-1">
          <FindForm />
        </div>

        <p className="anim-rise-2 mt-10 text-center font-mono-nums text-[10px] tracking-[0.16em] text-carbon-faint">
          YOUR DETAILS ARE USED ONLY TO VERIFY YOUR CLASS INFORMATION
        </p>
      </main>
    </div>
  );
}
