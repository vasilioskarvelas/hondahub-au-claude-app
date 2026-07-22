import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * MediaService (Phase 02) — media lifecycle for the platform (ADR-011).
 *
 * Uploads are a two-step flow: the caller first persists the file via the
 * UploadFile integration (returns file_url), then calls MediaService.create
 * with that URL + metadata. MediaService owns the Media record and enforces
 * ownership on every mutating action.
 *
 * Actions:
 *   create — create a Media record owned by the current user (created_by_id).
 *   list   — list the current user's own media.
 *   get    — resolve a single Media record (public fields, any caller).
 *   delete — delete a Media record; owner or admin only.
 */

const ALLOWED_SOURCES = ["user", "business", "marketplace", "event", "community", "system"];

function inferMediaType(mime_type: string | undefined, declared: string | undefined): string {
  if (declared === "image" || declared === "video") return declared;
  if (mime_type && mime_type.startsWith("video/")) return "video";
  return "image";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    if (action === 'create') {
      const { file_url, media_type, mime_type, width, height, alt_text, source, is_public, thumbnail_url } = body;
      if (!file_url) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { file_url: 'required' } }, { status: 422 });
      }
      const type = inferMediaType(mime_type, media_type);
      if (type !== 'image' && type !== 'video') {
        return Response.json({ error: 'VALIDATION_FAILED', details: { media_type: 'invalid' } }, { status: 422 });
      }
      const src = source && ALLOWED_SOURCES.includes(source) ? source : 'user';
      const media = await base44.entities.Media.create({
        file_url,
        media_type: type,
        mime_type: mime_type || null,
        width: width || null,
        height: height || null,
        alt_text: alt_text || null,
        source: src,
        is_public: is_public !== false,
        thumbnail_url: thumbnail_url || null,
      });
      return Response.json({ ok: true, media });
    }

    if (action === 'list') {
      const limit = Math.min(Number(body.limit) || 50, 100);
      const media = await base44.entities.Media.filter({ created_by_id: user.id }, '-created_date', limit);
      return Response.json({ ok: true, media });
    }

    if (action === 'get') {
      const { media_id } = body;
      if (!media_id) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { media_id: 'required' } }, { status: 422 });
      }
      const media = await base44.entities.Media.get(media_id);
      return Response.json({ ok: true, media });
    }

    if (action === 'delete') {
      const { media_id } = body;
      if (!media_id) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { media_id: 'required' } }, { status: 422 });
      }
      const media = await base44.entities.Media.get(media_id);
      if (media.created_by_id !== user.id && user.role !== 'admin') {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }
      await base44.entities.Media.delete(media_id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'VALIDATION_FAILED', details: { action: 'unknown' } }, { status: 422 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});