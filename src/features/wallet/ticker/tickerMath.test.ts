import test from "node:test";
import assert from "node:assert/strict";
import { alignDigits, displayAmount, inrLine, spinLetters } from "./tickerMath";
import { formatUnits, sortHoldings, toHolding, totalInr, type Holding } from "../../../lib/portfolio/assets";
import { MAINNETS, TESTNETS, cwInrToken } from "../../../lib/portfolio/networks";

test("amounts display compactly without losing tiny balances", () => {
  assert.equal(displayAmount("2"), "2");
  assert.equal(displayAmount("1250.567"), "1,250.57");
  assert.equal(displayAmount("0.052300"), "0.0523");
  assert.equal(displayAmount("0.0000123456"), "0.00001235");
  assert.equal(displayAmount("0"), "0");
});

test("odometer columns line up at the decimal point", () => {
  const cols = alignDigits("2", "50");
  assert.deepEqual(cols.map((c) => [c.from, c.to]), [[" ", "5"], ["2", "0"]]);
  const dec = alignDigits("1.5", "12.25");
  assert.deepEqual(dec.map((c) => c.from + c.to).join("|"), " 1|12|..|52| 5");
  assert.equal(cols.every((c) => c.rolls), true);
});

test("each letter spins through random glyphs and lands on the target", () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spins = spinLetters("ETH", rng);
  assert.equal(spins.length, 3);
  assert.deepEqual(spins.map((s) => s.frames.at(-1)), ["E", "T", "H"]);
  assert.ok(spins.every((s) => s.frames.length >= 6 && (s.dir === 1 || s.dir === -1)));
  assert.ok(spins[2].delayMs >= spins[0].delayMs);
});

test("holdings: exact units, non-zero only, test coins valueless except cwINR, real total only", () => {
  assert.equal(formatUnits(BigInt(1234500), 6), "1.2345");
  assert.equal(formatUnits(BigInt(10) ** BigInt(18), 18), "1");
  const [eth, polygon] = MAINNETS;
  const amoy = TESTNETS[1];
  const prices = { ethereum: 300000, tether: 85 };
  assert.equal(toHolding(eth, eth.tokens[0], BigInt(0), prices), null);
  const h1 = toHolding(eth, eth.tokens[1], BigInt(2_500_000), prices)!; // 2.5 USDT
  assert.equal(h1.inrValue, 212.5);
  const t1 = toHolding(amoy, amoy.tokens[0], BigInt(10) ** BigInt(17), prices)!;
  assert.equal(t1.inrValue, null);
  const cw = toHolding(amoy, cwInrToken("0x5FbDB2315678afecb367f032d93F642f64180aa3"), BigInt(600) * BigInt(10) ** BigInt(18), prices)!;
  assert.equal(cw.inrValue, 600);
  const e1 = toHolding(eth, eth.tokens[0], BigInt(10) ** BigInt(16), prices)!; // 0.01 ETH = ₹3,000
  const sorted = sortHoldings([t1, cw, h1, e1] as Holding[]);
  assert.deepEqual(sorted.map((h) => h.symbol), ["ETH", "USDT", "cwINR", "POL"]);
  assert.equal(totalInr(sorted), 3212.5);
  assert.equal(polygon.tokens[0].symbol, "POL");
});

test("the line under the amount", () => {
  assert.equal(inrLine(212.5, false), "≈ ₹212.5");
  assert.equal(inrLine(123456, false), "≈ ₹1,23,456");
  assert.equal(inrLine(null, true), "test · no value");
  assert.equal(inrLine(600, true), "≈ ₹600 (test)");
});
