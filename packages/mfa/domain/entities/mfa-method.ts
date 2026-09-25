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
}
