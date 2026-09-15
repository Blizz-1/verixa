import { createId, type Id } from "@verixa/shared-kernel";

export type CredentialId = Id<"CredentialId">;

/**
 * A `UserId` from the identity context, referenced by value.
 *
 * Declared locally rather than imported so the *domain* layer of credentials
 * depends on nothing outside itself. The application layer does import
 * `@verixa/identity`'s public API; the domain layer stays inert. See
 * docs/guides/domain-modeling.md on referencing other contexts by id.
 */
export type CredentialUserId = Id<"UserId">;

interface CredentialProps {
  readonly id: CredentialId;
  readonly userId: CredentialUserId;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const REDACTED = "[REDACTED]";

/**
 * How a user proves who they are — deliberately a separate aggregate from
 * `User`.
 *
 * Splitting them answers a question that arrives later and is expensive to
 * retrofit: what happens when a user has *no* password? An SSO-only account,
 * a passkey-only account, or a service account all have an identity and no
 * credential. With the hash on `User`, those become a nullable column plus a
 * rule nothing enforces. As a separate aggregate, "no credential row" says it
 * exactly, and adding a second authentication method later means a new
 * aggregate rather than more nullable columns on `User`.
 *
 * It also narrows exposure. Loading a user for a profile page does not load
 * their password hash, because it isn't there.
 */
export class Credential {
  readonly id: CredentialId;
  readonly userId: CredentialUserId;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CredentialProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.passwordHash = props.passwordHash;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a credential from an **already-hashed** password.
   *
   * The signature is the point: there is no factory taking a `RawPassword`,
   * so this aggregate cannot hash — and therefore cannot hash *wrongly*, or
   * accidentally store a plaintext. Hashing belongs to the `PasswordHasher`
   * port, and the use case is responsible for calling it first. A domain
   * entity that could hash would need to know the algorithm, which is exactly
   * what the port exists to keep out of the domain.
   */
  static create(params: { userId: CredentialUserId; passwordHash: string }): Credential {
    const now = new Date();
    return new Credential({
      id: createId<"CredentialId">(),
      userId: params.userId,
      passwordHash: params.passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Rebuilds from already-trusted data (a database row). */
  static reconstitute(props: CredentialProps): Credential {
    return new Credential(props);
  }

  /**
   * Replaces the stored hash — a password change, or a transparent rehash
   * after cost parameters rise (see `PasswordHasher.needsRehash`).
   *
   * Takes a hash, never a plaintext, for the same reason as {@link create}.
   */
  withPasswordHash(passwordHash: string): Credential {
    return new Credential({ ...this, passwordHash, updatedAt: new Date() });
  }

  /**
   * The hash is a secret, so it is redacted from every serialization path —
   * the same four escape routes `RawPassword` closes.
   *
   * A password hash is not as damaging as a plaintext, but it is not
   * harmless: leak it and an attacker can grind it offline at their own pace,
   * against a target they now know exists. It has no business in a log line
   * or an API response.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      userId: this.userId,
      passwordHash: REDACTED,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): Record<string, unknown> {
    return this.toJSON();
  }
}
