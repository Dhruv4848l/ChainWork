import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, businessDaysBetween, isBusinessDay, ymd } from "./businessDays";

// 2026-07-17 is a Friday. 18 Sat, 19 Sun, 20 Mon, 21 Tue.
const FRI = new Date("2026-07-17T10:00:00");
const SAT = new Date("2026-07-18T10:00:00");
const MON = new Date("2026-07-20T10:00:00");
const TUE = new Date("2026-07-21T10:00:00");

test("isBusinessDay: weekdays yes, weekends no", () => {
  assert.equal(isBusinessDay(FRI), true);
  assert.equal(isBusinessDay(SAT), false);
  assert.equal(isBusinessDay(new Date("2026-07-19T10:00:00")), false); // Sun
  assert.equal(isBusinessDay(MON), true);
});

test("Friday + 2 business days lands on Tuesday (weekend skipped)", () => {
  assert.equal(ymd(addBusinessDays(FRI, 2)), "2026-07-21");
});

test("Monday + 2 business days lands on Wednesday", () => {
  assert.equal(ymd(addBusinessDays(MON, 2)), "2026-07-22");
});

test("holiday is skipped like a weekend", () => {
  // Make Monday 20 Jul a holiday: Fri + 2 → Wed 22 (Mon skipped as holiday too).
  const holidays = new Set(["2026-07-20"]);
  assert.equal(ymd(addBusinessDays(FRI, 2, holidays)), "2026-07-22");
});

test("time-of-day is preserved", () => {
  const r = addBusinessDays(FRI, 2);
  assert.equal(r.getHours(), 10);
});

test("businessDaysBetween counts weekdays only", () => {
  // Fri -> Tue is 2 business days (Mon, Tue).
  assert.equal(businessDaysBetween(FRI, TUE), 2);
  // Fri -> Sat is 0.
  assert.equal(businessDaysBetween(FRI, SAT), 0);
});
