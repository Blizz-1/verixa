import type { CredentialRow, PrismaClient } from "@verixa/database";
import { asId } from "@verixa/shared-kernel";

import type { CredentialRepository } from "../../application/ports/credential-repository.js";
import { Credential, type CredentialUserId } from "../../domain/entities/credential.js";

/** Row ↔ aggregate translation for `Credential`. */
export const CredentialMapper = {
  toDomain(row: CredentialRow): Credential {
    return Credential.reconstitute({
      id: asId<"CredentialId">(row.id),
      userId: asId<"UserId">(row.userId),
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },

  toRow(credential: Credential): CredentialRow {
    return {
      id: credential.id,
      userId: credential.userId,
      passwordHash: credential.passwordHash,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  },
};

/**
 * Prisma-backed `CredentialRepository`.
 *
 * Takes its client as a constructor argument, like every other repository
 * here, so it can be handed a transaction client and enlisted in someone
 * else's unit of work — which `RegisterUserWithPassword` depends on.
 */
export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: CredentialUserId): Promise<Credential | undefined> {
    const row = await this.prisma.credential.findUnique({ where: { userId } });
    return row === null ? undefined : CredentialMapper.toDomain(row);
  }

  async save(credential: Credential): Promise<void> {
    const row = CredentialMapper.toRow(credential);
    const { id, ...withoutId } = row;
    await this.prisma.credential.upsert({
      where: { id },
      create: row,
      update: withoutId,
    });
  }

  async deleteByUserId(userId: CredentialUserId): Promise<void> {
    // `deleteMany`, not `delete`: deleting a credential that isn't there is a
    // no-op, not an error. `delete` would throw P2025 and make every caller
    // handle "already gone" as a failure, when it is the desired end state.
    await this.prisma.credential.deleteMany({ where: { userId } });
  }
}
