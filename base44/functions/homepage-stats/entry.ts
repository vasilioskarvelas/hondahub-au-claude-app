import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Homepage stats — public count endpoint for the hero stats row.
 * Returns live counts of listings, garage builds, and members.
 * Uses service role to bypass RLS (User count is unreadable for non-admins).
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const e = base44.asServiceRole.entities;
    const [marketplaceListings, legacyListings, vehicles, users] = await Promise.all([
      e.MarketplaceListing.filter({ status: { $in: ["active", "reserved", "completed"] } }, "-created_date", 500).catch(() => []),
      e.Listing.filter({ status: "active" }, "-created_date", 500).catch(() => []),
      e.Vehicle.list("-created_date", 500).catch(() => []),
      e.User.list("-created_date", 500).catch(() => []),
    ]);

    return Response.json({
      ok: true,
      counts: {
        listings: (marketplaceListings as any[]).length + (legacyListings as any[]).length,
        garage_builds: (vehicles as any[]).length,
        members: (users as any[]).length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}