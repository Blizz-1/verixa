import { Result } from "@verixa/shared-kernel";
import type { TotpSecret } from "../value-objects/totp-secret.js";

export interface TotpAlgorithm {
  generateSecret(accountName: string, issuer?: string): Promise<TotpSecret>;
  
  /**
   * Verifies a 6-digit TOTP code against the given secret.
   * Tolerates a minor clock skew window.
   */
  verify(secret: TotpSecret, code: string): Promise<boolean>;
}
