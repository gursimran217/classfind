import DeckHero from "@/components/DeckHero";
import PaperBackdrop from "@/components/PaperBackdrop";

export const metadata = { title: "Ring — CLASSFIND" };

const covers = Array.from({ length: 16 }, (_, i) => `/ring/${String(i + 1).padStart(2, "0")}.jpg`);

export default function RingPage() {
  return (
    <div className="sunset relative min-h-dvh overflow-hidden">
      <PaperBackdrop />
      <div className="relative z-10">
        <DeckHero
          mode="ring"
          covers={covers}
          title="The campus, in the round."
          blurb="Cards are dealt around a ring while the reel loads, then the camera opens out of it. Drag, swipe or scroll to turn."
        />
      </div>
    </div>
  );
}
