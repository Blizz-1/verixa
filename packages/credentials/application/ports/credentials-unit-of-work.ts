import type { UserRepository } from "@verixa/identity";

import type { CredentialRepository } from "./credential-repository.js";

/** Repositories available inside a credentials unit of work, all on one transaction. */
export interface CredentialsRepositories {
  readonly users: UserRepository;
  readonly credentials: CredentialRepository;
}

/**
 * Runs work spanning the identity and credentials contexts atomically.
 *
 * `RegisterUserWithPassword` writes a `User` *and* a `Credential`. A user
 * created without their credential is an account nobody can ever log into and
 * nobody can re-register, because the email is taken — worse than no account
 * at all, and invisible until someone tries to sign in.
 *
 * ## Why this lives in credentials and not identity
 *
 * The dependency runs one way: `credentials` depends on `@verixa/identity`'s
 * public API, never the reverse. Identity has no idea credentials exist, which
 * is what keeps it usable on its own — an SSO-only deployment needs identity
 * and never touches this package.
 *
 * Putting the combined unit of work in identity would invert that and make the
 * more foundational context depend on the one built on top of it.
 */
export interface CredentialsUnitOfWork {
  run<T>(work: (repositories: CredentialsRepositories) => Promise<T>): Promise<T>;
}
