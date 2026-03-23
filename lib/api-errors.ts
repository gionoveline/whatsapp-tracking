/**
 * Avoid leaking internal error details to API clients; log server-side only.
 */
export function logApiError(context: string, err: unknown): void {
  if (err instanceof Error) {
    console.error(`[api] ${context}:`, err.message);
    return;
  }

  if (typeof err === "object" && err !== null) {
    try {
      console.error(`[api] ${context}:`, JSON.stringify(err));
      return;
    } catch {
      console.error(`[api] ${context}:`, String(err));
      return;
    }
  }

  console.error(`[api] ${context}:`, String(err));
}

export const GENERIC_SERVER_ERROR = "Internal server error";
