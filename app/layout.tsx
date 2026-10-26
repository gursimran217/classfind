import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

// Display serif for the landing page (the reference set uses Instrument Serif).
const displaySerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display-serif",
  display: "swap",
});
import DiagOverlay from "@/components/DiagOverlay";

export const metadata: Metadata = {
  title: "CLASSFIND — Find your class. Know where to go.",
  description:
    "Enter the details you used during admission to instantly find your section, roll number and classroom. Student onboarding prototype for GL Bajaj B.Tech first year.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displaySerif.variable}>
      <body className="grain bg-ink min-h-dvh antialiased">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-[40vh] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-[100%] bg-acid/[0.035] blur-[140px]" />
          <div className="absolute top-[30vh] -left-[20vw] h-[60vh] w-[60vw] rounded-[100%] bg-acid/[0.02] blur-[120px]" />
        </div>
        <DiagOverlay />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}