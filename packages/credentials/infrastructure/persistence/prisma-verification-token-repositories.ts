import { asId } from "@verixa/shared-kernel";

import type {
  EmailVerificationTokenRepository,
  PasswordResetTokenRepository,
} from "../../application/ports/verification-token-repository.js";
import {
  EmailVerificationToken,
  type EmailVerificationTokenId,
  type EmailVerificationUserId,
} from "../../domain/entities/email-verification-token.js";
import {
  PasswordResetToken,
  type PasswordResetTokenId,
  type PasswordResetUserId,
} from "../../domain/entities/password-reset-token.js";

/**
 * The subset of `PrismaClient` these repositories need.
 *
 * Structural rather than the concrete client, so a transaction client
 * (`Prisma.TransactionClient`, which lacks `$connect` and friends) satisfies
 * it too. That is what lets the same repository run inside and outside a unit
 * of work without a second implementation.
 */
interface TokenDelegate<TRow, TCreate> {
  findUnique(args: { where: { tokenHash: string } }): Promise<TRow | null>;
  upsert(args: { where: { id: string }; create: TCreate; update: TCreate }): Promise<TRow>;
  updateMany(args: {
    where: { userId: string; consumedAt: null };
    data: { consumedAt: Date };
  }): Promise<{ count: number }>;
}

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

/** Maps between `EmailVerificationToken` rows and the domain entity. */
export const EmailVerificationTokenMapper = {
  toDomain(row: TokenRow): EmailVerificationToken {
    return EmailVerificationToken.reconstitute({
      id: asId<"EmailVerificationTokenId">(row.id),
      userId: asId<"UserId">(row.userId),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      // Null in the column, `undefined` in the domain — the database has one
      // absent value and TypeScript has two.
      consumedAt: row.consumedAt ?? undefined,
      createdAt: row.createdAt,
    });
  },

  toRow(token: EmailVerificationToken): TokenRow {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt ?? null,
      createdAt: token.createdAt,
    };
  },
};

/** Maps between `PasswordResetToken` rows and the domain entity. */
export const PasswordResetTokenMapper = {
  toDomain(row: TokenRow): PasswordResetToken {
    return PasswordResetToken.reconstitute({
      id: asId<"PasswordResetTokenId">(row.id),
      userId: asId<"UserId">(row.userId),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt ?? undefined,
      createdAt: row.createdAt,
    });
  },

  toRow(token: PasswordResetToken): TokenRow {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt ?? null,
      createdAt: token.createdAt,
    };
  },
};

/** Prisma-backed `EmailVerificationTokenRepository`. */
export class PrismaEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  constructor(private readonly tokens: TokenDelegate<TokenRow, TokenRow>) {}

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | undefined> {
    const row = await this.tokens.findUnique({ where: { tokenHash } });
    return row === null ? undefined : EmailVerificationTokenMapper.toDomain(row);
  }

  async save(token: EmailVerificationToken): Promise<void> {
    const row = EmailVerificationTokenMapper.toRow(token);
    await this.tokens.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async invalidateOutstandingForUser(userId: EmailVerificationUserId, now: Date): Promise<void> {
    // One `updateMany` rather than load-modify-save per row. The set being
    // retired is unbounded in principle — a user who clicked "resend" a
    // hundred times has a hundred rows — and this is a single statement
    // regardless. It also closes the race that the read-then-write version
    // has, where a token issued between the read and the write survives.
    await this.tokens.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
  }
}

/** Prisma-backed `PasswordResetTokenRepository`. */
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly tokens: TokenDelegate<TokenRow, TokenRow>) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const row = await this.tokens.findUnique({ where: { tokenHash } });
    return row === null ? undefined : PasswordResetTokenMapper.toDomain(row);
  }

  async save(token: PasswordResetToken): Promise<void> {
    const row = PasswordResetTokenMapper.toRow(token);
    await this.tokens.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async invalidateOutstandingForUser(userId: PasswordResetUserId, now: Date): Promise<void> {
    await this.tokens.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
  }
}

/** The ids these repositories mint, re-exported for adapters that need them. */
export type { EmailVerificationTokenId, PasswordResetTokenId };
