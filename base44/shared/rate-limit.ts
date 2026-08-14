// base44/shared/rate-limit.ts
//
// Lightweight, dependency-free rate limiting for backend functions (punch-list A8).
//
// Approach: rather than a separate counter store, we count the CALLER'S OWN recent
// records of the relevant entity. Every Base44 entity carries created_by_id and
// created_date automatically, so "N posts per minute" == "the caller has fewer than
// N Post rows created in the last minute". No new entity or schema change required.
//
// Notes:
//  * Best-effort abuse mitigation, not a hard boundary. Under heavy concurrency a
//    caller could briefly exceed a limit by a small margin; acceptable for
//    spam / flood protection.
//  * Fails OPEN: if the count query errors, the request is allowed (availability
//    over strictness) and the error is logged.
//  * Enforce server-side only; never rely on client throttling.

export interface RateWindow {
  limit: number;      // max records allowed within the window
  windowSec: number;  // window length in seconds
}

export interface RateResult {
  limited: boolean;
  retryAfter: number; // seconds to wait before retrying (0 when not limited)
}

/**
 * Returns { limited: true, retryAfter } if the caller has already created
 * limit-or-more entityName rows within any of the given windows.
 */
export async function checkRateLimit(
  base44: any,
  userId: string,
  entityName: string,
  windows: RateWindow[],
): Promise<RateResult> {
  if (!userId) return { limited: false, retryAfter: 0 };
  const now = Date.now();
  for (const w of windows) {
    const since = new Date(now - w.windowSec * 1000).toISOString();
    try {
      const recent = await base44.asServiceRole.entities[entityName].filter({
        created_by_id: userId,
        created_date: { $gte: since },
      });
      if (Array.isArray(recent) && recent.length >= w.limit) {
        return { limited: true, retryAfter: w.windowSec };
      }
    } catch (err) {
      // Fail open: never block a legitimate user because the counter query hiccuped.
      console.error("[rate-limit] count failed for " + entityName + " user " + userId + ": " + ((err as Error)?.message || err));
    }
  }
  return { limited: false, retryAfter: 0 };
}

/** Standard 429 response with a Retry-After header. */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "RATE_LIMITED", retry_after: retryAfter }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "Retry-After": String(Math.max(1, Math.ceil(retryAfter))),
      },
    },
  );
}
