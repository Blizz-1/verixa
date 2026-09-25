import { createId, type Id } from "@verixa/shared-kernel";

export type MfaMethodId = Id<"MfaMethodId">;
export type UserId = Id<"UserId">;

export type MfaMethodType = "totp" | "webauthn" | "backup_codes";
export type MfaMethodStatus = "pending" | "active" | "disabled";

export interface MfaMethodProps {
  id: MfaMethodId;
  userId: UserId;
  type: MfaMethodType;
  status: MfaMethodStatus;
  secret: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MfaMethod {
  private constructor(private readonly props: MfaMethodProps) {}

  public get id(): MfaMethodId { return this.props.id; }
  public get userId(): UserId { return this.props.userId; }
  public get type(): MfaMethodType { return this.props.type; }
  public get status(): MfaMethodStatus { return this.props.status; }
  public get secret(): string | null { return this.props.secret; }
  public get lastUsedAt(): Date | null { return this.props.lastUsedAt; }
  public get createdAt(): Date { return this.props.createdAt; }
  public get updatedAt(): Date { return this.props.updatedAt; }

  public activate(): void {
    this.props.status = "active";
    this.props.updatedAt = new Date();
  }

  public static load(props: MfaMethodProps): MfaMethod {
    return new MfaMethod(props);
  }

  public static create(
    userId: UserId,
    type: MfaMethodType,
    secret: string | null = null
  ): MfaMethod {
    const now = new Date();
    return new MfaMethod({
      id: createId<"MfaMethodId">(),
      userId,
      type,
      status: "pending",
      secret,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}
