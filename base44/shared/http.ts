/**
 * Honda Hub — shared HTTP helpers for backend functions.
 *
 * Trivial Response wrappers reused across every Deno backend service so the
 * `json`/`err` boilerplate isn't copy-pasted into each function.
 */

export function json(data: any, status = 200): Response {
  return Response.json(data, { status });
}

export function err(code: string, status: number, details?: any): Response {
  return json({ error: code, ...(details ? { details } : {}) }, status);
}