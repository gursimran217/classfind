import type { ResultData } from "./types";

/** Curated, on-brand accents. Every section still gets its own colour, but the
 *  palette never produces the magenta/neon hues a raw hash would. */
const ACCENTS: Array<{ accent: string; soft: string }> = [
  { accent: "#b5722a", soft: "#f1e2c8" }, // amber
  { accent: "#6f8f2a", soft: "#e7efd4" }, // olive lime
  { accent: "#2f7f74", soft: "#d6ebe7" }, // teal
  { accent: "#a8543a", soft: "#f2ded6" }, // clay
  { accent: "#4a6fa5", soft: "#dce5f1" }, // slate blue
  { accent: "#8a5a9e", soft: "#ebdff1" }, // plum
  { accent: "#b5892a", soft: "#f3e8ca" }, // gold
  { accent: "#3f7d3a", soft: "#ddecd9" }, // forest
];

export function sectionAccent(section: string): { accent: string; soft: string } {
  let h = 0;
  for (let i = 0; i < section.length; i++) h = (h * 31 + section.charCodeAt(i)) % 100000;
  return ACCENTS[h % ACCENTS.length];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface CardInput {
  data: ResultData;
  facultyCount: number;
  coordinator?: string | null;
  subjects?: string[];
}

/** 1080x1350 PNG, sized for a WhatsApp/Instagram share. */
export async function renderResultCard({ data, facultyCount, coordinator, subjects = [] }: CardInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available on this device.");

  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* fall back to system fonts */
  }

  const { accent, soft } = sectionAccent(data.section || "GL");

  ctx.fillStyle = "#EDE4D7";
  ctx.fillRect(0, 0, W, H);

  // top rule + a soft corner wash in the section's own colour
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 20);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(W - 40, 180, 390, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const M = 84;

  ctx.fillStyle = "#20180D";
  ctx.font = "600 27px 'General Sans', system-ui, sans-serif";
  ctx.fillText("CLASSFIND", M, 116);
  ctx.fillStyle = "rgba(32,24,13,0.5)";
  ctx.font = "500 20px 'General Sans', system-ui, sans-serif";
  ctx.fillText("GL BAJAJ INSTITUTE OF TECHNOLOGY & MANAGEMENT", M, 150);

  // the section code is the hero
  ctx.fillStyle = "#20180D";
  ctx.font = "400 290px 'Instrument Serif', Georgia, serif";
  ctx.fillText(data.section || "—", M - 10, 452);

  ctx.font = "600 56px 'General Sans', system-ui, sans-serif";
  ctx.fillText(data.name, M, 540);
  ctx.fillStyle = "rgba(32,24,13,0.6)";
  ctx.font = "500 26px 'General Sans', system-ui, sans-serif";
  ctx.fillText(`Roll number ${data.rollNumber}`, M, 580);

  // classroom block
  ctx.fillStyle = soft;
  roundRect(ctx, M, 640, W - M * 2, 288, 30);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = "500 21px 'General Sans', system-ui, sans-serif";
  ctx.fillText("YOUR CLASSROOM", M + 42, 696);
  ctx.fillStyle = "#20180D";
  ctx.font = "400 156px 'Instrument Serif', Georgia, serif";
  ctx.fillText(data.classroom?.roomNumber ?? "—", M + 36, 842);
  ctx.fillStyle = "rgba(32,24,13,0.72)";
  ctx.font = "500 27px 'General Sans', system-ui, sans-serif";
  ctx.fillText(
    [data.classroom?.building, data.classroom?.floorLabel].filter(Boolean).join("  ·  ") || "Location pending",
    M + 42,
    890,
  );

  // subject chips — fills the space and shows what the week actually holds
  const uniq = [...new Set(subjects.filter(Boolean))].slice(0, 4);
  if (uniq.length) {
    ctx.fillStyle = "rgba(32,24,13,0.45)";
    ctx.font = "500 20px 'General Sans', system-ui, sans-serif";
    ctx.fillText("YOUR SUBJECTS", M, 1000);
    let x = M;
    let y = 1032;
    for (const s of uniq) {
      const label = s.length > 26 ? s.slice(0, 25) + "…" : s;
      ctx.font = "500 22px 'General Sans', system-ui, sans-serif";
      const w = ctx.measureText(label).width + 36;
      if (x + w > W - M) {
        x = M;
        y += 58;
      }
      ctx.fillStyle = "rgba(32,24,13,0.07)";
      roundRect(ctx, x, y, w, 44, 22);
      ctx.fill();
      ctx.fillStyle = "rgba(32,24,13,0.82)";
      ctx.fillText(label, x + 18, y + 30);
      x += w + 12;
    }
  }

  // footer facts
  ctx.fillStyle = "rgba(32,24,13,0.62)";
  ctx.font = "500 25px 'General Sans', system-ui, sans-serif";
  const facts = [coordinator ? `Coordinator ${coordinator}` : null, facultyCount ? `${facultyCount} teachers` : null]
    .filter(Boolean)
    .join("  ·  ");
  if (facts) ctx.fillText(facts, M, H - 128);
  ctx.fillStyle = "#20180D";
  ctx.font = "600 26px 'General Sans', system-ui, sans-serif";
  ctx.fillText("classfind.site", M, H - 82);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not build the image."))), "image/png"),
  );
}
