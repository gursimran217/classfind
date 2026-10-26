import DeckHero from "@/components/DeckHero";
import PaperBackdrop from "@/components/PaperBackdrop";

export const metadata = { title: "Deal — CLASSFIND" };

const covers = Array.from({ length: 16 }, (_, i) => `/ring/${String(i + 1).padStart(2, "0")}.jpg`);

export default function DealPage() {
  return (
    <div className="sunset relative min-h-dvh overflow-hidden">
      <PaperBackdrop />
      <div className="relative z-10">
        <DeckHero
          mode="deal"
          covers={covers}
          title="A hand of cards, dealt up."
          blurb="Each card arrives face down, flips on the way in, then the whole wheel lifts and starts to turn. Drag, swipe or scroll."
        />
      </div>
    </div>
  );
}
