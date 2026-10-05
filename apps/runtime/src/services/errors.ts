/** What a service call can refuse. The studio routes answer it as HTTP, the MCP tools as a tool error. */
export type ServiceErrorCode =
  | "not_found"
  | "invalid"
  | "has_issues"
  | "revision_conflict"
  | "no_credits"
  | "refused"
  /** Nothing is changed here: the project is a local install's, or the tenant builds elsewhere. */
  | "read_only";

const STATUS: Record<ServiceErrorCode, 400 | 402 | 403 | 404 | 409> = {
  not_found: 404,
  invalid: 400,
  has_issues: 400,
  revision_conflict: 409,
  no_credits: 402,
  refused: 400,
  read_only: 403,
};

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get status() {
    return STATUS[this.code];
  }

  toJSON() {
    return { error: this.message, code: this.code, ...this.data };
  }
}

export const notFound = () => new ServiceError("not_found", "not found");
