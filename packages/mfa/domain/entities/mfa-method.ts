import { createId, type Id } from "@verixa/shared-kernel";
import type { MfaMethodType } from "../value-objects/mfa-method-type.js";
import type { TotpSecret } from "../value-objects/totp-secret.js";

export type MfaMethodId = Id<"MfaMethodId">;
export type MfaMethodStatus = "pending" | "active" | "disabled";

export class MfaMethod {
  private constructor(
    public readonly id: MfaMethodId,
    public readonly userId: Id<"UserId">,
    public readonly type: MfaMethodType,
    public readonly status: MfaMethodStatus,
    public readonly secret: TotpSecret | null,
    public readonly createdAt: Date,
    public readonly lastUsedAt?: Date,
    public readonly failedAttempts: number = 0,
    public readonly lockedUntil?: Date,
  ) {}

  static createPendingTotp(
    userId: Id<"UserId">,
    secret: TotpSecret,
    now: Date = new Date()
  ): MfaMethod {
    return new MfaMethod(
      createId<"MfaMethodId">(),
      userId,
      "totp",
      "pending",
      secret,
      now
    );
  }

  activate(now: Date = new Date()): MfaMethod {
    if (this.status !== "pending") {
      throw new Error("Only pending methods can be activated");
    }
    return new MfaMethod(
      this.id,
      this.userId,
      this.type,
      "active",
      this.secret,
      this.createdAt,
      this.lastUsedAt,
      0, // Reset attempts on success
      undefined
    );
  }

  isLockedAt(now: Date): boolean {
    if (!this.lockedUntil) return false;
    return now < this.lockedUntil;
  }

  recordFailedAttempt(now: Date = new Date()): MfaMethod {
    const attempts = this.failedAttempts + 1;
    // Basic rate limit for TOTP confirmation (e.g. 5 attempts = 1 min lock, backoff x2)
    // In production, this might inject a LockoutPolicy, but hardcoded here for simplicity
    // based on the 10^6 code space and 30s window.
    const lockDurationMs = attempts >= 5 ? 60 * 1000 * Math.pow(2, attempts - 5) : 0;
    
    let lockedUntil: Date | undefined = undefined;
    if (lockDurationMs > 0) {
      lockedUntil = new Date(now.getTime() + Math.min(lockDurationMs, 60 * 60 * 1000));
    }

    return new MfaMethod(
      this.id,
      this.userId,
      this.type,
      this.status,
      this.secret,
      this.createdAt,
      this.lastUsedAt,
      attempts,
      lockedUntil
    );
  }
}
