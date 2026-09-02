import { base44 } from "@/api/base44Client";

/**
 * Call a Base44 backend function and always get back a usable result.
 *
 * The SDK throws on any non-2xx response, and the thrown error's message is the
 * bare "Request failed with status code 422" — the backend's actual explanation
 * sits unread on `error.response.data`. Catching without digging it out shows
 * the user a status code and nothing else, which is worse than useless when the
 * backend went to the trouble of saying which field was wrong.
 *
 * Returns { ok, data, error, status } and never throws, so callers handle
 * success and failure the same way.
 */
export async function invokeFn(name, payload) {
  try {
    const res = await base44.functions.invoke(name, payload);
    const data = res?.data ?? res;
    if (data && data.ok === false) {
      return { ok: false, data, status: res?.status ?? 200, error: readError(data) };
    }
    return { ok: true, data, status: res?.status ?? 200, error: null };
  } catch (e) {
    const body = e?.response?.data;
    const status = e?.response?.status ?? null;
    return {
      ok: false,
      data: body ?? null,
      status,
      error: readError(body) || humanStatus(status) || String(e?.message || e),
    };
  }
}

/**
 * Pull the most specific message out of a backend error body. Our functions
 * reply as { error: CODE, details: { field: reason } }, so a field-level reason
 * is the most useful thing to show and the code is the fallback.
 */
function readError(body) {
  if (!body || typeof body !== "object") return null;
  const details = body.details || body.error?.details;
  if (details && typeof details === "object") {
    if (typeof details.message === "string" && details.message.trim()) return details.message;
    // Only fields that carry an explanation. An identifier is not a reason:
    // "business_id: 6a98112e..." tells a person nothing about what went wrong,
    // and showing it buries the code that actually explains the failure.
    const reason = Object.entries(details).find(
      ([k, v]) => typeof v === "string" && v.trim() && !isIdentifier(k, v),
    );
    if (reason) return `${humanField(reason[0])}: ${reason[1]}`;
  }
  if (typeof body.error === "string") return prettyCode(body.error);
  if (typeof body.error?.message === "string") return body.error.message;
  if (typeof body.message === "string") return body.message;
  return null;
}

/** True for fields whose value is an id or opaque token rather than a reason. */
function isIdentifier(key, value) {
  return /(^|_)id$/i.test(key) || /^[0-9a-f]{16,}$/i.test(String(value).trim());
}

function humanField(key) {
  return String(key).replace(/_/g, " ");
}

/** Turn SCREAMING_CODES into something a person can read. */
function prettyCode(code) {
  const known = {
    AUTH_REQUIRED: "You need to be signed in.",
    PERMISSION_DENIED: "You don't have access to that business.",
    BUSINESS_REQUEST_PENDING: "You already have a business waiting for review.",
    CONNECTION_NOT_VERIFIED: "This store isn't verified yet.",
    ENCRYPTION_NOT_CONFIGURED: "Credential encryption isn't configured on the server.",
    SITE_UNREACHABLE: "We couldn't reach that website.",
    STORE_FETCH_FAILED: "We couldn't read that store.",
    VALIDATION_FAILED: "Some details weren't accepted.",
  };
  return known[code] || String(code).toLowerCase().replace(/_/g, " ");
}

function humanStatus(status) {
  if (status === 404) {
    // The most common cause during rollout: the frontend shipped but the
    // backend function it calls has not been deployed yet.
    return "That feature isn't available on the server yet — it may still be deploying.";
  }
  if (status === 403) return "You don't have permission to do that.";
  if (status === 401) return "You need to be signed in.";
  if (status === 503) return "That feature isn't configured on the server yet.";
  return null;
}
