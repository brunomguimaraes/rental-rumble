// A refilling point meter: one point per whole interval, up to capacity, never below its floor.
// Action stamina (floor 0) and travel stamina (floor below 0, for whiteout debt) share it.

export interface MeterRules { capacity: number; refillEveryMs: number; floor: number }
export interface MeterRecord { available: number; refilledAt: number }
export interface MeterView { available: number; capacity: number; refillEveryMs: number; nextRefillAt: number | null }

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectMeter(record: MeterRecord, now: number, rules: MeterRules): MeterRecord {
  const effectiveNow = Math.max(now, record.refilledAt);
  const available = Math.max(rules.floor, Math.min(rules.capacity, Math.floor(record.available)));
  if (available === rules.capacity) return { available, refilledAt: effectiveNow };
  const elapsedIntervals = Math.floor((effectiveNow - record.refilledAt) / rules.refillEveryMs);
  const replenished = Math.min(rules.capacity, available + elapsedIntervals);
  return {
    available: replenished,
    refilledAt: replenished === rules.capacity
      ? effectiveNow
      : record.refilledAt + elapsedIntervals * rules.refillEveryMs,
  };
}

export function meterView(record: MeterRecord, now: number, rules: MeterRules): MeterView {
  const current = projectMeter(record, now, rules);
  return {
    available: current.available,
    capacity: rules.capacity,
    refillEveryMs: rules.refillEveryMs,
    nextRefillAt: current.available === rules.capacity ? null : current.refilledAt + rules.refillEveryMs,
  };
}

/** The projection minus `cost`, or null when the meter cannot cover it. A transaction persists the result. */
export function spendMeter(record: MeterRecord, now: number, cost: number, rules: MeterRules): MeterRecord | null {
  const current = projectMeter(record, now, rules);
  return current.available >= cost ? { ...current, available: current.available - cost } : null;
}
