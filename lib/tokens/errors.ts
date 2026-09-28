export type TokenErrorCode = "INVALID_QUERY" | "NOT_CONFIGURED" | "NOT_FOUND" | "TIMEOUT" | "PROVIDER_FAILURE" | "MALFORMED_RESPONSE" | "BUSY";
export class TokenServiceError extends Error {
  constructor(public readonly code: TokenErrorCode, message: string, public readonly status = 502, public readonly retryAfter?:number) { super(message); this.name = "TokenServiceError"; }
}
export function publicTokenError(error: unknown): TokenServiceError {
  return error instanceof TokenServiceError ? error : new TokenServiceError("PROVIDER_FAILURE", "Token search is temporarily unavailable. Please try again.");
}
