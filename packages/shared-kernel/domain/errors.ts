/**
 * Base class for expected, domain-meaningful failures. Every subclass
 * carries a stable machine-readable `code` (safe to branch on in client code
 * or translate for i18n, unlike `message`) and an `httpStatusHint` the
 * interface layer can use without re-deriving it from the error type.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatusHint: number;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }

  /**
   * `Error` instances don't serialize usefully with `JSON.stringify` by
   * default (`message` is a non-enumerable own property in V8) — `toJSON`
   * gives every domain error a predictable wire shape.
   */
  toJSON(): { code: string; message: string; httpStatusHint: number } {
    return { code: this.code, message: this.message, httpStatusHint: this.httpStatusHint };
  }
}

/** A request failed input validation. */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatusHint = 400;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;

  constructor(message: string, fieldErrors: Readonly<Record<string, readonly string[]>> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }

  override toJSON(): ReturnType<DomainError["toJSON"]> & {
    fieldErrors: Readonly<Record<string, readonly string[]>>;
  } {
    return { ...super.toJSON(), fieldErrors: this.fieldErrors };
  }
}

/** The requested resource does not exist (or the caller may not know it does). */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly httpStatusHint = 404;
}

/** The request conflicts with the current state of the resource (e.g. a duplicate). */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
  readonly httpStatusHint = 409;
}

/**
 * Authentication failed, and the response deliberately does not say why.
 *
 * The one domain error whose *message* is part of its security contract. A
 * caller that can tell "no such user" from "wrong password" can enumerate
 * accounts: post an email, read the error, learn whether it is registered.
 * That turns a password-guessing problem into a much cheaper two-step one,
 * and leaks membership of whatever the service is — which for a verification
 * or compliance product is often the more sensitive fact.
 *
 * So there is no `UserNotFoundError` for a login path to reach for, and no
 * field errors. One error, one message, every failing reason.
 *
 * 401 rather than 403: the credentials presented were not accepted. 403 would
 * say they were understood and refused, which is a different conversation.
 *
 * See `docs/security/authentication-flows.md`.
 */
export class AuthenticationError extends DomainError {
  readonly code = "AUTHENTICATION_FAILED";
  readonly httpStatusHint = 401;

  constructor(message = "Invalid email or password.", options?: ErrorOptions) {
    super(message, options);
  }
}
