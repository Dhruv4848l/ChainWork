// @pdf-lib/fontkit's Indic shaper (used for Devanagari names) expects a global
// regeneratorRuntime; without it any document with a Hindi name would crash.
import "regenerator-runtime/runtime";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/*
  Shared PDF drawing kit for receipts and statements (payment plan P2): fonts, the
  light "paper" palette, per-glyph font fallback and a top-down Painter.

  Fonts come from the OFL @fontsource packages: Outfit for text (the brand face) and
  Noto Sans Devanagari, which carries the ₹ glyph (and covers Hindi names). Text is
  drawn in runs with per-glyph fallback, so a character neither font has becomes "?"
  instead of crashing the render. The font files are traced into the serverless
  bundle by next.config.ts.
*/

// turbopackIgnore: the font files are traced explicitly (next.config.ts outputFileTracingIncludes);
// without it the dynamic cwd join makes Turbopack trace the whole project.
const FONT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "@fontsource");
export const PDF_FONT_FILES = [
  "outfit/files/outfit-latin-400-normal.woff",
  "outfit/files/outfit-latin-600-normal.woff",
  "noto-sans/files/noto-sans-devanagari-400-normal.woff",
  "noto-sans/files/noto-sans-devanagari-600-normal.woff",
] as const;

let fontBytes: Uint8Array[] | null = null;
function loadFontBytes(): Uint8Array[] {
  fontBytes ??= PDF_FONT_FILES.map((f) => readFileSync(path.join(FONT_DIR, f)));
  return fontBytes;
}

// Light "paper" palette from the design tokens (light theme + constant accents).
export const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
export const C = {
  paper: hex("#FFFFFF"),
  card2: hex("#F2ECE2"),
  hair: hex("#E6DED2"),
  ink: hex("#1A1512"),
  ink2: hex("#575047"),
  ink3: hex("#8E867C"),
  band: hex("#151312"),
  bandInk: hex("#B8B2A8"),
  bronze: hex("#D9A066"),
  bronzeStrong: hex("#A85F2E"),
  emerald: hex("#34E89A"),
  emeraldInk: hex("#137A4C"),
  ember: hex("#E0563A"),
  emberTint: hex("#FBE9E4"),
  amber: hex("#FFC46B"),
};

export interface Faces { regular: PDFFont; bold: PDFFont; fbRegular: PDFFont; fbBold: PDFFont }

/** Split text into runs drawable by one font each (primary → fallback → "?"). */
export function runs(text: string, primary: PDFFont, fallback: PDFFont): { text: string; font: PDFFont }[] {
  const out: { text: string; font: PDFFont }[] = [];
  const has = (f: PDFFont, ch: string) => f.getCharacterSet().includes(ch.codePointAt(0)!);
  for (const ch of Array.from(text)) {
    let font = primary;
    let c = ch;
    if (!has(primary, ch)) {
      if (has(fallback, ch)) font = fallback;
      else c = /\s/.test(ch) ? " " : "?";
    }
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += c;
    else out.push({ text: c, font });
  }
  return out;
}

export class Painter {
  constructor(private page: PDFPage, private f: Faces, readonly height: number) {}

  private faces(bold: boolean) {
    return bold ? [this.f.bold, this.f.fbBold] as const : [this.f.regular, this.f.fbRegular] as const;
  }

  width(text: string, size: number, bold = false): number {
    const [p, fb] = this.faces(bold);
    return runs(text, p, fb).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  }

  /** Draw at (x, top-based y). */
  text(text: string, x: number, top: number, size: number, color: RGB, bold = false, charSpacing = 0): void {
    const [p, fb] = this.faces(bold);
    let cx = x;
    for (const r of runs(text, p, fb)) {
      if (charSpacing) {
        for (const ch of Array.from(r.text)) {
          this.page.drawText(ch, { x: cx, y: this.height - top, size, font: r.font, color });
          cx += r.font.widthOfTextAtSize(ch, size) + charSpacing;
        }
      } else {
        this.page.drawText(r.text, { x: cx, y: this.height - top, size, font: r.font, color });
        cx += r.font.widthOfTextAtSize(r.text, size);
      }
    }
  }

  centered(text: string, cx: number, top: number, size: number, color: RGB, bold = false): void {
    this.text(text, cx - this.width(text, size, bold) / 2, top, size, color, bold);
  }

  right(text: string, rx: number, top: number, size: number, color: RGB, bold = false): void {
    this.text(text, rx - this.width(text, size, bold), top, size, color, bold);
  }

  /** Greedy wrap on spaces; tokens longer than the line (hashes) are hard-broken. */
  wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    const lines: string[] = [];
    let line = "";
    const push = (t: string) => {
      const candidate = line ? `${line} ${t}` : t;
      if (this.width(candidate, size, bold) <= maxWidth) { line = candidate; return; }
      if (line) lines.push(line);
      line = "";
      let rest = t;
      while (this.width(rest, size, bold) > maxWidth) {
        let n = rest.length;
        while (n > 1 && this.width(rest.slice(0, n), size, bold) > maxWidth) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    };
    for (const word of text.split(/\s+/).filter(Boolean)) push(word);
    if (line) lines.push(line);
    return lines.length ? lines : ["—"];
  }

  rect(x: number, top: number, w: number, h: number, color: RGB, opts: { borderColor?: RGB; opacity?: number } = {}): void {
    this.page.drawRectangle({
      x, y: this.height - top - h, width: w, height: h, color,
      borderColor: opts.borderColor, borderWidth: opts.borderColor ? 0.75 : 0, opacity: opts.opacity,
    });
  }

  line(x1: number, x2: number, top: number, color: RGB): void {
    this.page.drawLine({ start: { x: x1, y: this.height - top }, end: { x: x2, y: this.height - top }, thickness: 0.75, color });
  }

  circle(cx: number, top: number, r: number, color: RGB): void {
    this.page.drawCircle({ x: cx, y: this.height - top, size: r, color });
  }

  /** Stroke an SVG path whose coordinates are relative to (x, top). */
  stroke(d: string, x: number, top: number, color: RGB, width: number): void {
    this.page.drawSvgPath(d, { x, y: this.height - top, borderColor: color, borderWidth: width, borderLineCap: 1 });
  }
}


/** Register fontkit and embed the four faces (subset) into a document. */
export async function embedFaces(doc: PDFDocument): Promise<Faces> {
  doc.registerFontkit(fontkit);
  const [r400, r600, d400, d600] = loadFontBytes();
  return {
    regular: await doc.embedFont(r400, { subset: true }),
    bold: await doc.embedFont(r600, { subset: true }),
    fbRegular: await doc.embedFont(d400, { subset: true }),
    fbBold: await doc.embedFont(d600, { subset: true }),
  };
}
