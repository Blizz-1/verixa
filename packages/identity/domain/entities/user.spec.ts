import { Result } from "@verixa/shared-kernel";
import { describe, expect, it } from "vitest";

import { UserProfileUpdated } from "../events/user-profile-updated.js";
import { UserRegistered } from "../events/user-registered.js";
import { UserStatusChanged } from "../events/user-status-changed.js";
import { DisplayName } from "../value-objects/display-name.js";
import { Email } from "../value-objects/email.js";

import { User } from "./user.js";

function makeUser(): User {
  const email = Email.create("alice@example.com");
  const displayName = DisplayName.create("Alice");
  if (!Result.isOk(email) || !Result.isOk(displayName)) {
    throw new Error("test fixture setup failed");
  }
  return User.register({ email: email.value, displayName: displayName.value });
}

describe("User", () => {
  it("registers a new user in pending status", () => {
    const user = makeUser();

    expect(user.status).toBe("pending");
    expect(user.id).toBeDefined();
    expect(user.createdAt).toEqual(user.updatedAt);
  });

  it("activates a pending user", () => {
    const result = makeUser().activate();

    expect(Result.isOk(result) && result.value.status).toBe("active");
  });

  it("suspends an active user", () => {
    const activated = makeUser().activate();
    const result = Result.isOk(activated) ? activated.value.suspend() : activated;

    expect(Result.isOk(result) && result.value.status).toBe("suspended");
  });

  it("reactivates a suspended user", () => {
    const activated = makeUser().activate();
    const suspended = Result.isOk(activated) ? activated.value.suspend() : activated;
    const result = Result.isOk(suspended) ? suspended.value.activate() : suspended;

    expect(Result.isOk(result) && result.value.status).toBe("active");
  });

  it("deletes a pending, active, or suspended user", () => {
    expect(Result.isOk(makeUser().delete())).toBe(true);

    const activated = makeUser().activate();
    expect(Result.isOk(activated) && Result.isOk(activated.value.delete())).toBe(true);
  });

  it("rejects suspending a pending user directly", () => {
    const result = makeUser().suspend();

    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.fieldErrors["status"]).toContain("invalid_transition_from_pending");
    }
  });

  it("rejects reactivating a deleted user", () => {
    const deleted = makeUser().delete();
    const result = Result.isOk(deleted) ? deleted.value.activate() : deleted;

    expect(Result.isErr(result)).toBe(true);
  });

  it("rejects deleting an already-deleted user", () => {
    const deleted = makeUser().delete();
    const result = Result.isOk(deleted) ? deleted.value.delete() : deleted;

    expect(Result.isErr(result)).toBe(true);
  });

  it("bumps updatedAt on a successful transition", async () => {
    const user = makeUser();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = user.activate();

    expect(Result.isOk(result) && result.value.updatedAt.getTime()).toBeGreaterThan(
      user.updatedAt.getTime(),
    );
  });

  it("reconstitutes a user from trusted data without re-validating transitions", () => {
    const original = makeUser();
    const rebuilt = User.reconstitute({
      id: original.id,
      email: original.email,
      displayName: original.displayName,
      personName: original.personName,
      status: "deleted",
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      deletedAt: original.updatedAt,
    });

    expect(rebuilt.status).toBe("deleted");
  });

  it("records a UserRegistered event on registration", () => {
    const user = makeUser();
    const events = user.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserRegistered);
    expect(events[0]?.aggregateId).toBe(user.id);
  });

  it("records a UserStatusChanged event on a successful transition", () => {
    const activated = makeUser().activate();
    if (!Result.isOk(activated)) throw new Error("fixture setup failed");
    const events = activated.value.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserStatusChanged);
    if (events[0] instanceof UserStatusChanged) {
      expect(events[0].previousStatus).toBe("pending");
      expect(events[0].newStatus).toBe("active");
    }
  });

  it("reconstitute does not carry forward any pending domain events", () => {
    const original = makeUser();
    const rebuilt = User.reconstitute({
      id: original.id,
      email: original.email,
      displayName: original.displayName,
      personName: original.personName,
      status: original.status,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
    });

    expect(rebuilt.pullDomainEvents()).toHaveLength(0);
  });

  it("stamps deletedAt when soft-deleted", () => {
    const result = makeUser().delete("account closure requested");

    expect(Result.isOk(result) && result.value.status).toBe("deleted");
    expect(Result.isOk(result) && result.value.deletedAt).toBeInstanceOf(Date);
    expect(Result.isOk(result) && result.value.isDeleted).toBe(true);
  });

  it("leaves deletedAt unset for a user that was never deleted", () => {
    const user = makeUser();

    expect(user.deletedAt).toBeUndefined();
    expect(user.isDeleted).toBe(false);
  });

  it("still records a UserStatusChanged event when soft-deleted", () => {
    // The stamping of deletedAt rebuilds the aggregate, which is exactly where
    // a carelessly-written `delete()` would drop the event it just recorded.
    const result = makeUser().delete("account closure requested");
    if (!Result.isOk(result)) throw new Error("fixture setup failed");

    const events = result.value.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserStatusChanged);
  });

  it("rejects reconstituting a deleted user with no deletedAt", () => {
    const original = makeUser();

    // Status and timestamp disagreeing means the database and the domain have
    // diverged. Throwing beats silently picking one field to believe.
    expect(() =>
      User.reconstitute({
        id: original.id,
        email: original.email,
        displayName: original.displayName,
        personName: original.personName,
        status: "deleted",
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      }),
    ).toThrow(/inconsistent/i);
  });

  it("rejects reconstituting a live user that carries a deletedAt", () => {
    const original = makeUser();

    expect(() =>
      User.reconstitute({
        id: original.id,
        email: original.email,
        displayName: original.displayName,
        personName: original.personName,
        status: "active",
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
        deletedAt: new Date(),
      }),
    ).toThrow(/inconsistent/i);
  });

  it("updates the display name and records a UserProfileUpdated event", () => {
    const user = makeUser();
    const newDisplayName = DisplayName.create("Alicia");
    if (!Result.isOk(newDisplayName)) throw new Error("fixture setup failed");

    const updated = user.updateProfile({
      displayName: newDisplayName.value,
      personName: user.personName,
    });

    expect(updated.displayName.value).toBe("Alicia");
    const events = updated.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserProfileUpdated);
  });
});
