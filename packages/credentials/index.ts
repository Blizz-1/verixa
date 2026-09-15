// Curated public surface of @verixa/credentials. Deep imports are blocked by
// the boundary rule in eslint.config.mjs — see docs/guides/domain-modeling.md.

export type { PasswordHasher } from "./application/ports/password-hasher.js";
export {
  Argon2PasswordHasher,
  DEFAULT_ARGON2_PARAMETERS,
  type Argon2Parameters,
} from "./infrastructure/argon2-password-hasher.js";
