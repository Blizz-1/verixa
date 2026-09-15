import type { Credential, CredentialUserId } from "../../domain/entities/credential.js";

/**
 * Persistence contract for `Credential`. Mirrors the conventions in
 * `@verixa/identity`'s repository ports.
 *
 * - `findByUserId` returns `undefined` when the user has no credential. That
 *   is an ordinary state, not an error: SSO-only and passkey-only accounts
 *   legitimately have none, which is the reason credentials are a separate
 *   aggregate at all.
 * - `save` is an idempotent upsert.
 * - `deleteByUserId` supports removing password authentication without
 *   deleting the user — needed when someone moves to SSO, and by the erasure
 *   work in Phase 24.
 */
export interface CredentialRepository {
  findByUserId(userId: CredentialUserId): Promise<Credential | undefined>;
  save(credential: Credential): Promise<void>;
  deleteByUserId(userId: CredentialUserId): Promise<void>;
}
