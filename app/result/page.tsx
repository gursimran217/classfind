import ResultClient from "@/components/ResultClient";
import PaperBackdrop from "@/components/PaperBackdrop";

export const metadata = {
  title: "Your Class — CLASSFIND",
};

// The paper scope lives here so every branch ResultClient can render — the
// loaded result, the "nothing found" state and the expired-session state — is
// inside the animated backdrop rather than on a flat dark page.
export default function ResultPage() {
  return (
    <div className="sunset relative min-h-dvh">
      <PaperBackdrop />
      <div className="relative z-10">
        <ResultClient />
      </div>
    </div>
  );
}
