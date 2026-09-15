import { InMemoryUserRepository } from "@verixa/identity";

import type {
  CredentialsRepositories,
  CredentialsUnitOfWork,
} from "../../application/ports/credentials-unit-of-work.js";

import { InMemoryCredentialRepository } from "./in-memory-credential-repository.js";
import {
  InMemoryEmailVerificationTokenRepository,
  InMemoryPasswordResetTokenRepository,
} from "./in-memory-verification-token-repositories.js";

/**
 * `CredentialsUnitOfWork` over in-memory fakes.
 *
 * **Does not roll back**, exactly like `InMemoryUnitOfWork` in identity. Use
 * this to test orchestration — was the credential written alongside the user,
 * is the right error returned — and verify atomicity separately against a
 * real database, where the guarantee actually lives. Hand-rolling rollback
 * here would make tests pass against a mechanism production does not share.
 */
export class InMemoryCredentialsUnitOfWork implements CredentialsUnitOfWork {
  readonly repositories: CredentialsRepositories;

  constructor(repositories?: Partial<CredentialsRepositories>) {
    this.repositories = {
      users: repositories?.users ?? new InMemoryUserRepository(),
      credentials: repositories?.credentials ?? new InMemoryCredentialRepository(),
      emailVerificationTokens:
        repositories?.emailVerificationTokens ?? new InMemoryEmailVerificationTokenRepository(),
      passwordResetTokens:
        repositories?.passwordResetTokens ?? new InMemoryPasswordResetTokenRepository(),
    };
  }

  run<T>(work: (repositories: CredentialsRepositories) => Promise<T>): Promise<T> {
    return work(this.repositories);
  }
}
