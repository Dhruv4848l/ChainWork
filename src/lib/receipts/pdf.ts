import { PDFDocument, degrees } from "pdf-lib";
import QRCode from "qrcode";
import type { ReceiptContent } from "./content";
import { C, Painter, embedFaces } from "./pdfKit";
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
  the receipt's FROZEN content snapshot, never from live rows. Drawing kit (fonts,
  palette, glyph fallback) lives in ./pdfKit.ts, shared with the statement.
*/

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
  doc.setTitle(`ChainWork receipt ${c.receiptNo}`);
  doc.setSubject(`${statusHeadline(c)} — ${kindLabel(c)}`);
  doc.setAuthor("ChainWork");
  doc.setCreator("ChainWork");
  doc.setProducer("ChainWork receipts");
  doc.setCreationDate(new Date(c.issuedAt));
  doc.setModificationDate(new Date(c.issuedAt));
  doc.setKeywords([c.receiptNo, `sha256:${contentHash}`, c.mode]);

  const faces = await embedFaces(doc);
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
