/**
 * Honda Hub — shared Media URL resolution helper.
 *
 * Resolves a Media FK (logo/cover/avatar) to its file_url for display. Read-only
 * (uses asServiceRole so any backend function can resolve regardless of the
 * originating user's entity permissions).
 */

export async function resolveMediaUrl(base44: any, mediaId?: string | null): Promise<string | null> {
  if (!mediaId) return null;
  const m = await base44.asServiceRole.entities.Media.get(mediaId).catch(() => null);
  return m?.file_url || null;
}