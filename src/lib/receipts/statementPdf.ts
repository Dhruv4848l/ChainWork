import { PDFDocument, degrees, type PDFPage } from "pdf-lib";
import { C, Painter, embedFaces, type Faces } from "./pdfKit";
import { istDateTime, modeWatermark } from "./present";
import { paiseToRupees, type Period, type StatementData } from "./statementMath";

/*
  The account statement PDF (payment plan P2.6) — A4, multi-page. Escrow is a
  running-balance ledger; wallet activity is in / out / net (see statementMath.ts for
  why). Each row cites its receipt number so any line can be checked individually.
*/

const W = 595;
const H = 842;
const M = 40;
const BOTTOM = H - 56;

export interface StatementPdfInput {
  name: string;
  period: Period;
  data: StatementData;
  mode: "DEMO" | "TESTNET" | "MAINNET";
  generatedAt: Date;
}

const istDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const longDay = (ymd: string) => istDay(new Date(`${ymd}T06:30:00Z`));

interface Col { label: string; x: number; w: number; align: "left" | "right" }

class Doc {
  page!: PDFPage;
  p!: Painter;
  y = 0;
  constructor(private doc: PDFDocument, private faces: Faces, private mark: string | null) {}

  newPage(): void {
    this.page = this.doc.addPage([W, H]);
    this.p = new Painter(this.page, this.faces, H);
    this.p.rect(0, 0, W, H, C.paper);
    if (this.mark) {
      const size = 46;
      const mw = this.p.width(this.mark, size, true);
      const rad = (32 * Math.PI) / 180;
      this.page.drawText(this.mark, {
        x: W / 2 - (mw / 2) * Math.cos(rad), y: H / 2 - (mw / 2) * Math.sin(rad), size,
        font: this.faces.bold, color: C.bronze, opacity: 0.1, rotate: degrees(32),
      });
    }
    this.p.rect(0, 0, W, 40, C.band);
    this.p.text("CHAINWORK", M, 25, 12, C.bronze, true, 2);
    this.p.right("ACCOUNT STATEMENT", W - M, 25, 7.5, C.bandInk, true);
    this.y = 64;
  }

  /** Make room for `h` points, starting a new page (and re-drawing `header`) if needed. */
  ensure(h: number, header?: () => void): void {
    if (this.y + h > BOTTOM) {
      this.newPage();
      header?.();
    }
  }

  tableHeader(cols: Col[]): void {
    this.p.rect(M, this.y, W - 2 * M, 18, C.card2);
    for (const c of cols) {
      const t = c.label.toUpperCase();
      if (c.align === "right") this.p.right(t, c.x + c.w, this.y + 12, 6.5, C.ink2, true);
      else this.p.text(t, c.x, this.y + 12, 6.5, C.ink2, true);
    }
    this.y += 18;
  }

  row(cols: Col[], cells: string[], bold = false): void {
    const lines = cells.map((v, i) => (cols[i].align === "left" ? this.p.wrap(v, 8, cols[i].w) : [v]));
    const h = 6 + Math.max(...lines.map((l) => l.length)) * 10;
    this.ensure(h, () => this.tableHeader(cols));
    lines.forEach((ls, i) => {
      const c = cols[i];
      ls.forEach((l, j) => {
        const top = this.y + 11 + j * 10;
        if (c.align === "right") this.p.right(l, c.x + c.w, top, 8, C.ink, bold);
        else this.p.text(l, c.x, top, 8, i === 0 ? C.ink2 : C.ink, bold);
      });
    });
    this.y += h;
    this.p.line(M, W - M, this.y, C.hair);
  }

  summary(items: [string, string][]): void {
    const w = (W - 2 * M) / items.length;
    this.ensure(46);
    this.p.rect(M, this.y, W - 2 * M, 40, C.paper, { borderColor: C.hair });
    items.forEach(([label, value], i) => {
      const x = M + 12 + i * w;
      this.p.text(label.toUpperCase(), x, this.y + 15, 6.5, C.ink3, true, 0.4);
      // "−₹3,000.00", not "₹−3,000.00".
      const shown = value.startsWith("−") ? `−₹${value.slice(1)}` : `₹${value}`;
      this.p.text(shown, x, this.y + 31, 11, C.ink, true);
    });
    this.y += 52;
  }

  heading(title: string, note: string): void {
    this.ensure(48);
    this.p.text(title, M, this.y + 12, 12, C.ink, true);
    for (const l of this.p.wrap(note, 7.5, W - 2 * M)) {
      this.y += 10;
      this.p.text(l, M, this.y + 14, 7.5, C.ink3);
    }
    this.y += 24;
  }
}

export async function renderStatementPdf({ name, period, data, mode, generatedAt }: StatementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const faces = await embedFaces(doc);
  const title = `ChainWork statement ${period.from} to ${period.to}`;
  doc.setTitle(title);
  doc.setAuthor("ChainWork");
  doc.setCreator("ChainWork");
  doc.setProducer("ChainWork statements");
  doc.setCreationDate(generatedAt);
  doc.setKeywords([mode, period.from, period.to]);

  const d = new Doc(doc, faces, modeWatermark(mode));
  d.newPage();

  // Title block.
  d.p.text("Account statement", M, d.y + 16, 20, C.ink, true);
  d.p.right(`${longDay(period.from)} – ${longDay(period.to)}`, W - M, d.y + 16, 10, C.ink2, true);
  d.y += 34;
  d.p.text(name, M, d.y, 10.5, C.ink, true);
  d.p.right(`Generated ${istDateTime(generatedAt.toISOString())}`, W - M, d.y, 7.5, C.ink3);
  d.y += 26;

  // Escrow — running balance.
  const ec: Col[] = [
    { label: "Date", x: M + 6, w: 62, align: "left" },
    { label: "Description", x: M + 72, w: 168, align: "left" },
    { label: "Receipt", x: M + 244, w: 104, align: "left" },
    { label: "Locked", x: M + 350, w: 52, align: "right" },
    { label: "Released", x: M + 406, w: 52, align: "right" },
    { label: "Balance", x: M + 462, w: 47, align: "right" },
  ];
  d.heading("Escrow", "Money locked in the escrow smart contract for your phases. Locked = you funded a phase; Released = it left escrow (to the worker, a refund to you, or a verdict).");
  d.summary([
    ["Opening balance", paiseToRupees(data.escrow.openingPaise)],
    ["Locked", paiseToRupees(data.escrow.lockedPaise)],
    ["Released", paiseToRupees(data.escrow.releasedPaise)],
    ["Closing balance", paiseToRupees(data.escrow.closingPaise)],
  ]);
  d.tableHeader(ec);
  d.row(ec, [istDay(period.startUtc), "Opening balance", "", "", "", paiseToRupees(data.escrow.openingPaise)], true);
  for (const r of data.escrow.rows) {
    d.row(ec, [
      istDay(r.at), r.memo, r.receiptNo ?? "—",
      r.creditPaise ? paiseToRupees(r.creditPaise) : "",
      r.debitPaise ? paiseToRupees(r.debitPaise) : "",
      paiseToRupees(r.balancePaise),
    ]);
  }
  d.row(ec, [istDay(new Date(period.endUtc.getTime() - 1)), "Closing balance", "", "", "", paiseToRupees(data.escrow.closingPaise)], true);
  d.y += 22;

  // Wallet — in / out / net.
  const wc: Col[] = [
    { label: "Date", x: M + 6, w: 62, align: "left" },
    { label: "Description", x: M + 72, w: 196, align: "left" },
    { label: "Receipt", x: M + 272, w: 110, align: "left" },
    { label: "Money out", x: M + 386, w: 58, align: "right" },
    { label: "Money in", x: M + 450, w: 59, align: "right" },
  ];
  d.heading("Wallet activity", "Payments into and out of your ChainWork wallet in this period. Your current wallet balance is shown live in the app.");
  d.summary([
    ["Money in", paiseToRupees(data.wallet.totalInPaise)],
    ["Money out", paiseToRupees(data.wallet.totalOutPaise)],
    ["Net for the period", paiseToRupees(data.wallet.netPaise)],
  ]);
  d.tableHeader(wc);
  if (data.wallet.rows.length === 0) d.row(wc, ["", "No wallet activity in this period.", "", "", ""]);
  for (const r of data.wallet.rows) {
    d.row(wc, [istDay(r.at), r.memo, r.receiptNo ?? "—", r.outPaise ? paiseToRupees(r.outPaise) : "", r.inPaise ? paiseToRupees(r.inPaise) : ""]);
  }

  // Footers: page numbers + disclaimer.
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const p = new Painter(pg, faces, H);
    p.line(M, W - M, H - 34, C.hair);
    p.text("Each line cites its receipt number — scan that receipt's QR to verify it. Escrow funds are held by the smart contract, not by ChainWork.", M, H - 22, 6.5, C.ink3);
    p.right(`Page ${i + 1} of ${pages.length}`, W - M, H - 22, 7, C.ink2, true);
  });

  return doc.save();
}
