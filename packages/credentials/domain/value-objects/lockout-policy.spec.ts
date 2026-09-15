import { describe, expect, it } from "vitest";

import { DEFAULT_LOCKOUT_POLICY, lockDurationMs, type LockoutPolicy } from "./lockout-policy.js";

const POLICY: LockoutPolicy = {
  threshold: 3,
  baseDurationMs: 1000,
  backoffFactor: 2,
  maxDurationMs: 16_000,
};

describe("lockDurationMs", () => {
  it("does not lock below the threshold", () => {
    expect(lockDurationMs(0, POLICY)).toBe(0);
    expect(lockDurationMs(2, POLICY)).toBe(0);
  });

  it("locks for the base duration at the threshold", () => {
    expect(lockDurationMs(3, POLICY)).toBe(1000);
  });

  it("doubles for each further failure", () => {
    // The reason lockout is exponential rather than a fixed window. A fixed
    // 15 minutes after 5 attempts still permits roughly 480 guesses a day,
    // forever — which is not a defence, it is a slower attack.
    expect(lockDurationMs(4, POLICY)).toBe(2000);
    expect(lockDurationMs(5, POLICY)).toBe(4000);
    expect(lockDurationMs(6, POLICY)).toBe(8000);
  });

  it("caps at the maximum", () => {
    // The cap is what stops lockout becoming a weapon. Unbounded growth means
    // anyone who knows an address can lock its owner out for years by failing
    // enough times.
    expect(lockDurationMs(7, POLICY)).toBe(16_000);
    expect(lockDurationMs(50, POLICY)).toBe(16_000);
  });

  it("stays finite for an absurd number of failures", () => {
    // 2 ** 1000 is Infinity, and `new Date(Infinity)` is an Invalid Date,
    // which persists as null — silently *unlocking* the account under
    // precisely the sustained attack the lock exists for. The guard has to be
    // before the multiplication, so this is worth an explicit test rather
    // than trusting the cap that follows it.
    const duration = lockDurationMs(1000, POLICY);

    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBe(16_000);
    expect(new Date(Date.now() + duration).getTime()).not.toBeNaN();
  });

  it("ships defaults that are forgiving of typos and hostile to guessing", () => {
    expect(lockDurationMs(DEFAULT_LOCKOUT_POLICY.threshold - 1, DEFAULT_LOCKOUT_POLICY)).toBe(0);
    expect(lockDurationMs(DEFAULT_LOCKOUT_POLICY.threshold, DEFAULT_LOCKOUT_POLICY)).toBe(60_000);
    expect(lockDurationMs(100, DEFAULT_LOCKOUT_POLICY)).toBe(DEFAULT_LOCKOUT_POLICY.maxDurationMs);
  });
});
