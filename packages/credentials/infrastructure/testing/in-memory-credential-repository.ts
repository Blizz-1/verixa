import type { CredentialRepository } from "../../application/ports/credential-repository.js";
import type { Credential, CredentialUserId } from "../../domain/entities/credential.js";

/** In-memory `CredentialRepository` for testing use cases without a database. */
export class InMemoryCredentialRepository implements CredentialRepository {
  private readonly byUserId = new Map<CredentialUserId, Credential>();

  findByUserId(userId: CredentialUserId): Promise<Credential | undefined> {
    return Promise.resolve(this.byUserId.get(userId));
  }

  save(credential: Credential): Promise<void> {
    this.byUserId.set(credential.userId, credential);
    return Promise.resolve();
  }

  deleteByUserId(userId: CredentialUserId): Promise<void> {
    this.byUserId.delete(userId);
    return Promise.resolve();
  }
}
