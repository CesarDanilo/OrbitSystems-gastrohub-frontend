/**
 * Error categories shared by API and web. The API maps each category to an HTTP status;
 * the web maps each code to a friendly message.
 */
export const ERROR_CATEGORIES = [
  'ValidationError',
  'AuthenticationError',
  'AuthorizationError',
  'NotFoundError',
  'ConflictError',
  'BusinessRuleError',
  'ExternalServiceError',
  'InternalError',
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Error raised by pure domain rules. Always carries a stable, machine-readable code. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Shape of every error response body returned by the API. */
export interface ApiErrorBody {
  error: {
    category: ErrorCategory;
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}
