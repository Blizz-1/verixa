import type { Id } from "@verixa/shared-kernel";
import type { MfaMethod, MfaMethodId } from "../../domain/entities/mfa-method.js";

export interface MfaMethodRepository {
  save(method: MfaMethod): Promise<void>;
  findById(id: MfaMethodId): Promise<MfaMethod | undefined>;
  findActiveByUserId(userId: Id<"UserId">): Promise<MfaMethod[]>;
  findPendingByUserId(userId: Id<"UserId">): Promise<MfaMethod[]>;
  delete(id: MfaMethodId): Promise<void>;
}
