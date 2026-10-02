import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import type { ReceiptContent } from "./content";
import { renderReceiptPdf } from "./pdf";
import {
  formatRupees,
  gasLine,
  istDateTime,
  kindLabel,
  maskAddress,
  maskName,
  modeWatermark,
  purposeLine,
  receiptFilename,
  statusHeadline,
  verifyPath,
} from "./present";

const base = (over: Partial<ReceiptContent> = {}): ReceiptContent => ({
  v: 1, receiptNo: "CW-RCPT-2026-000007", outcome: "SUCCESS", status: "CONFIRMED", kind: "FUND", operation: "fundPhase",
  mode: "TESTNET", amountInr: "120000.50", splitWorkerBps: null,
  asset: { symbol: "cwINR", chainId: 80002, address: null, amount: "1" },
  payer: { userId: "u1", name: "Imran K.", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" },
  payee: { userId: "u2", name: "रवि कुमार", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
  txHash: "0x" + "ab".repeat(32), blockNumber: "12", gasFeeWei: "226047730338308", gasPaidBy: "ChainWork",
  failure: null, purpose: { hireId: "h1abcdef", phaseId: "p1", jobTitle: "Android app", phaseIndex: 2, phaseName: "UI build" },
  escrowContract: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", reconciled: false,
  initiatedAt: "2026-10-02T04:50:00.000Z", finalizedAt: "2026-10-02T04:51:05.000Z", issuedAt: "2026-10-02T04:51:05.100Z",
  ...over,
});

test("rupees: Indian grouping, exact 2 decimals, no float rounding", () => {
  assert.equal(formatRupees("120000.50"), "1,20,000.50");
  assert.equal(formatRupees("1500.00"), "1,500.00");
  assert.equal(formatRupees("99999999999999.99"), "9,99,99,99,99,99,999.99");
});

test("gas line names the coin and who paid; demo has none", () => {
  assert.equal(gasLine(base()), "0.000226 POL (paid by ChainWork)");
  assert.equal(gasLine(base({ asset: { ...base().asset, chainId: 31337 }, gasPaidBy: "Payer" })), "0.000226 ETH (paid by Payer)");
  assert.equal(gasLine(base({ gasFeeWei: "5" })), "< 0.000001 POL (paid by ChainWork)");
  assert.match(gasLine(base({ mode: "DEMO", gasPaidBy: "None" })), /^None/);
});

test("labels: auto-release, failure headline, watermark per mode", () => {
  assert.equal(kindLabel({ kind: "RELEASE", operation: "autoRelease" }), "Escrow auto-released to the worker");
  assert.equal(statusHeadline({ status: "FAILED" }), "Payment failed");
  assert.equal(statusHeadline({ status: "CANCELLED" }), "Payment cancelled");
  assert.equal(modeWatermark("DEMO"), "DEMO — NO REAL MONEY");
  assert.equal(modeWatermark("TESTNET"), "TESTNET — NO REAL VALUE");
  assert.equal(modeWatermark("MAINNET"), null);
});

test("purpose, IST time, masking and paths", () => {
  assert.equal(purposeLine(base()), "Android app · Phase 2 “UI build”");
  assert.equal(istDateTime("2026-10-02T04:51:05.000Z").endsWith("IST"), true);
  assert.match(istDateTime("2026-10-02T04:51:05.000Z"), /10:21:05/);
  assert.equal(maskName("Ravi Kumar"), "R••• K•••");
  assert.equal(maskAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906"), "0x90F7…b906");
  assert.equal(verifyPath("CW-RCPT-2026-000007", "ff"), "/receipts/verify/CW-RCPT-2026-000007?h=ff");
  assert.equal(receiptFilename("CW-FAIL-2026-000001"), "ChainWork-Receipt-CW-FAIL-2026-000001.pdf");
});

test("the PDF renders (₹, Devanagari names, failure box) and carries the receipt in its metadata", async () => {
  for (const content of [
    base(),
    base({ outcome: "FAILED", status: "FAILED", txHash: null, failure: { code: "REVERTED", reason: "The network rejected it." } }),
    base({ mode: "DEMO", gasPaidBy: "None", kind: "SPLIT", splitWorkerBps: 6000 }),
  ]) {
    const bytes = await renderReceiptPdf({ content, contentHash: "cd".repeat(32), verifyUrl: "http://localhost:3000/receipts/verify/x?h=cd" });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getTitle(), `ChainWork receipt ${content.receiptNo}`);
    assert.match(doc.getKeywords() ?? "", /sha256:cdcd/);
  }
});
