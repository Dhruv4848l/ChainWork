import "server-only";
import { adminDb } from "@/lib/adminDb";

/*
  Reads the tunable PlatformConfig knobs (ADM-17) from the Admin DB. These are global
  operational settings, not user data, so reading them here doesn't cross the two-DB
  data boundary (no cross-DB relation — just a key/value lookup). Values are parsed
  into a typed object with sensible fallbacks.
*/
export interface PlatformSettings {
  verificationWindowWorkingDays: number;
  reminderCap: number;
  deliveryStakeThresholdInr: number;
  cancellationPenaltyPct: number;
  workerGraceBusinessDays: number;
  workerStrikeSuspendThreshold: number;
  holidays: string[]; // YYYY-MM-DD
}

const DEFAULTS: PlatformSettings = {
  verificationWindowWorkingDays: 2,
  reminderCap: 2,
  deliveryStakeThresholdInr: 10000,
  cancellationPenaltyPct: 10,
  workerGraceBusinessDays: 1,
  workerStrikeSuspendThreshold: 3,
  holidays: [],
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await adminDb.platformConfig.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = map.get(key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  let holidays: string[] = [];
  const rawHolidays = map.get("business_holidays");
  if (rawHolidays) {
    try {
      const parsed = JSON.parse(rawHolidays);
      if (Array.isArray(parsed)) holidays = parsed.map(String);
    } catch {
      /* ignore malformed holiday list */
    }
  }
  return {
    verificationWindowWorkingDays: num("verification_window_working_days", DEFAULTS.verificationWindowWorkingDays),
    reminderCap: num("reminder_cap_per_window", DEFAULTS.reminderCap),
    deliveryStakeThresholdInr: num("delivery_stake_threshold_inr", DEFAULTS.deliveryStakeThresholdInr),
    cancellationPenaltyPct: num("cancellation_penalty_pct", DEFAULTS.cancellationPenaltyPct),
    workerGraceBusinessDays: num("worker_grace_business_days", DEFAULTS.workerGraceBusinessDays),
    workerStrikeSuspendThreshold: num("worker_strike_suspend_threshold", DEFAULTS.workerStrikeSuspendThreshold),
    holidays,
  };
}
