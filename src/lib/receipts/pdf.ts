// @pdf-lib/fontkit's Indic shaper (used for Devanagari names) expects a global
// regeneratorRuntime; without it any receipt with a Hindi name would crash.
import "regenerator-runtime/runtime";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import type { ReceiptContent } from "./content";
import {
  failureNote,
  formatRupees,
  gasLine,
  istDateTime,
  kindLabel,
  modeWatermark,
  networkName,
  purposeLine,
  statusHeadline,
} from "./present";

/*
  The receipt PDF (payment plan P2.2 / P2.3) — a UPI-style single page rendered from
  the receipt's FROZEN content snapshot, never from live rows.

  pdf-lib + fontkit (pure JS, runs on Vercel). Fonts come from the OFL @fontsource
  packages: Outfit for text (the brand face) and Noto Sans Devanagari, which carries
  the ₹ glyph (and covers Hindi names). Text is drawn in runs with per-glyph fallback,
  so a character neither font has becomes "?" instead of crashing the render.
  The font files are traced into the serverless bundle by next.config.ts.
*/

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource");
export const RECEIPT_FONT_FILES = [
  "outfit/files/outfit-latin-400-normal.woff",
  "outfit/files/outfit-latin-600-normal.woff",
  "noto-sans/files/noto-sans-devanagari-400-normal.woff",
  "noto-sans/files/noto-sans-devanagari-600-normal.woff",
] as const;

let fontBytes: Uint8Array[] | null = null;
function loadFontBytes(): Uint8Array[] {
  fontBytes ??= RECEIPT_FONT_FILES.map((f) => readFileSync(path.join(FONT_DIR, f)));
  return fontBytes;
}

// Light "paper" palette from the design tokens (light theme + constant accents).
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
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

interface Faces { regular: PDFFont; bold: PDFFont; fbRegular: PDFFont; fbBold: PDFFont }

/** Split text into runs drawable by one font each (primary → fallback → "?"). */
function runs(text: string, primary: PDFFont, fallback: PDFFont): { text: string; font: PDFFont }[] {
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

class Painter {
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

/** The SVG-y-down icon glyphs drawn inside the status circle (24×24 box, centred). */
const ICON = {
  check: "M 6 12.5 L 10.2 16.5 L 18 8",
  cross: "M 7.5 7.5 L 16.5 16.5 M 16.5 7.5 L 7.5 16.5",
  dash: "M 7 12 L 17 12",
};

export interface ReceiptPdfInput {
  content: ReceiptContent;
  contentHash: string;
  /** Absolute URL of the public verify page (encoded in the QR). */
  verifyUrl: string;
}

export async function renderReceiptPdf({ content: c, contentHash, verifyUrl }: ReceiptPdfInput): Promise<Uint8Array> {
  const W = 420;
  const H = 700;
  const M = 28;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`ChainWork receipt ${c.receiptNo}`);
  doc.setSubject(`${statusHeadline(c)} — ${kindLabel(c)}`);
  doc.setAuthor("ChainWork");
  doc.setCreator("ChainWork");
  doc.setProducer("ChainWork receipts");
  doc.setCreationDate(new Date(c.issuedAt));
  doc.setModificationDate(new Date(c.issuedAt));
  doc.setKeywords([c.receiptNo, `sha256:${contentHash}`, c.mode]);

  const [r400, r600, d400, d600] = loadFontBytes();
  const faces: Faces = {
    regular: await doc.embedFont(r400, { subset: true }),
    bold: await doc.embedFont(r600, { subset: true }),
    fbRegular: await doc.embedFont(d400, { subset: true }),
    fbBold: await doc.embedFont(d600, { subset: true }),
  };
  const page = doc.addPage([W, H]);
  const p = new Painter(page, faces, H);
  const success = c.outcome === "SUCCESS";
  const pendingLike = c.status === "CANCELLED" || c.status === "EXPIRED";
  const accent = success ? C.emerald : pendingLike ? C.amber : C.ember;

  // Paper + header band.
  p.rect(0, 0, W, H, C.paper);
  p.rect(0, 0, W, 54, C.band);
  p.text("CHAINWORK", M, 33, 15, C.bronze, true, 2.4);
  p.right("PAYMENT RECEIPT", W - M, 26, 7.5, C.bandInk, true);
  p.right(c.receiptNo, W - M, 38, 8, C.bronze);

  // Status.
  let y = 96;
  p.circle(W / 2, y, 19, accent);
  p.stroke(success ? ICON.check : pendingLike ? ICON.dash : ICON.cross, W / 2 - 12, y - 12, C.paper, 2.6);
  y += 40;
  p.centered(statusHeadline(c), W / 2, y, 16, C.ink, true);
  y += 16;
  p.centered(kindLabel(c), W / 2, y, 9.5, C.ink2);

  // Amount (₹ falls back to Noto Devanagari automatically).
  y += 40;
  const amount = `₹${formatRupees(c.amountInr)}`;
  p.centered(amount, W / 2, y, 30, success ? C.ink : C.ink3, true);
  if (!success) {
    const aw = p.width(amount, 30, true);
    p.line(W / 2 - aw / 2, W / 2 + aw / 2, y - 10, C.ink3);
  }
  y += 18;
  const assetLine = c.mode === "DEMO"
    ? "Demo credit · no real money"
    : `${formatRupees(c.amountInr).replace(/\.00$/, "")} ${c.asset.symbol} · ${networkName(c)}`;
  p.centered(assetLine, W / 2, y, 8.5, C.ink3);
  if (c.kind === "SPLIT" && c.splitWorkerBps != null) {
    y += 13;
    p.centered(`Worker ${c.splitWorkerBps / 100}% · Client ${(10_000 - c.splitWorkerBps) / 100}%`, W / 2, y, 8.5, C.ink2);
  }

  // Parties.
  y += 20;
  p.line(M, W - M, y, C.hair);
  y += 6;
  const fromEscrow = c.kind === "RELEASE" || c.kind === "REFUND" || c.kind === "SPLIT";
  const fromLabel = fromEscrow ? "From — escrow funded by" : "From";
  const toLabel = c.kind === "FUND" ? "To — held in escrow for" : "To";
  for (const [label, party, addr] of [
    [fromLabel, c.payer.name, c.payer.address],
    [toLabel, c.payee.name, c.kind === "FUND" ? c.payee.address ?? c.escrowContract : c.payee.address],
  ] as const) {
    y += 14;
    p.text(label.toUpperCase(), M, y, 7, C.ink3, true, 0.6);
    y += 14;
    p.text(party ?? "ChainWork", M, y, 11, C.ink, true);
    for (const l of p.wrap(addr ?? "—", 8, W - 2 * M)) {
      y += 11;
      p.text(l, M, y, 8, C.ink2);
    }
    y += 4;
  }

  // Details.
  y += 8;
  p.line(M, W - M, y, C.hair);
  y += 4;
  const rows: [string, string][] = [
    ["Receipt no.", c.receiptNo],
    ["Status", c.status === "CONFIRMED" ? "Success" : c.status.charAt(0) + c.status.slice(1).toLowerCase()],
    ["Date & time", istDateTime(c.finalizedAt)],
    ["Purpose", purposeLine(c)],
    ...(c.purpose.hireId ? [["Hire ref", `#${c.purpose.hireId.slice(-6)}`] as [string, string]] : []),
    ["Transaction", c.txHash ?? (c.mode === "DEMO" ? "Demo ledger entry" : "Not broadcast")],
    ["Network", networkName(c)],
    ...(c.blockNumber ? [["Block", c.blockNumber] as [string, string]] : []),
    ["Network fee", gasLine(c)],
    ...(c.escrowContract ? [["Escrow contract", c.escrowContract] as [string, string]] : []),
  ];
  const labelW = 86;
  for (const [label, value] of rows) {
    const lines = p.wrap(value, 8.5, W - 2 * M - labelW);
    y += 15;
    p.text(label, M, y, 8.5, C.ink3);
    lines.forEach((l, i) => p.text(l, M + labelW, y + i * 11, 8.5, C.ink, label === "Receipt no."));
    y += (lines.length - 1) * 11;
  }

  // Failure box.
  if (!success && c.failure) {
    y += 16;
    const reason = p.wrap(c.failure.reason, 8.5, W - 2 * M - 20);
    const boxH = 30 + reason.length * 11;
    p.rect(M, y, W - 2 * M, boxH, C.emberTint, { borderColor: accent });
    p.text(`Why it ${c.status === "CANCELLED" ? "was cancelled" : "failed"}`.toUpperCase(), M + 10, y + 14, 7, C.ink2, true, 0.6);
    reason.forEach((l, i) => p.text(l, M + 10, y + 27 + i * 11, 8.5, C.ink));
    p.text(failureNote(c) ?? "", M + 10, y + 27 + reason.length * 11, 8.5, C.ink, true);
    y += boxH + 6;
  }
  if (c.reconciled) {
    y += 14;
    p.text(`Finalised by ChainWork's reconciliation check against the ${c.mode === "DEMO" ? "demo ledger" : "blockchain"}.`, M, y, 7.5, C.ink3);
  }

  // Footer: verify QR + hash.
  const qrSize = 74;
  const footTop = H - 28 - qrSize;
  p.line(M, W - M, footTop - 12, C.hair);
  const qr = await QRCode.toBuffer(verifyUrl, { type: "png", margin: 0, width: 300, errorCorrectionLevel: "M", color: { dark: "#1A1512", light: "#FFFFFF" } });
  const qrImg = await doc.embedPng(qr);
  page.drawImage(qrImg, { x: M, y: H - footTop - qrSize, width: qrSize, height: qrSize });
  const tx = M + qrSize + 14;
  const tw = W - M - tx;
  p.text("Scan to verify this receipt", tx, footTop + 9, 9, C.ink, true);
  let fy = footTop + 9;
  for (const l of p.wrap(verifyUrl.replace(/\?h=.*/, ""), 7, tw)) { fy += 10; p.text(l, tx, fy, 7, C.bronzeStrong); }
  fy += 13;
  p.text("SHA-256 of this receipt's content", tx, fy, 6.5, C.ink3, true);
  for (const l of p.wrap(contentHash, 6.5, tw)) { fy += 9; p.text(l, tx, fy, 6.5, C.ink2); }
  p.centered(
    "Issued by ChainWork. Funds are held by the escrow smart contract, not by ChainWork.",
    W / 2, H - 12, 6.5, C.ink3,
  );

  // Mode watermark (DEMO / TESTNET) across the body.
  const mark = modeWatermark(c.mode);
  if (mark) {
    const size = 30;
    const mw = p.width(mark, size, true);
    const angle = 32;
    const rad = (angle * Math.PI) / 180;
    const cx = W / 2 - (mw / 2) * Math.cos(rad);
    const cy = H / 2 - (mw / 2) * Math.sin(rad) - 30;
    // The watermark strings are plain Latin, so Outfit alone covers them.
    page.drawText(mark, { x: cx, y: cy, size, font: faces.bold, color: c.mode === "DEMO" ? C.amber : C.bronze, opacity: 0.16, rotate: degrees(angle) });
  }

  return doc.save();
}
