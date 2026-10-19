import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: { code: "PERMISSION_DENIED" } }, { status: 403 });
    const b = base44.asServiceRole;

    // Gather metrics from all entities
    const listings = await b.entities.Listing.list('-created_date', 500);
    const posts = await b.entities.CommunityPost.list('-created_date', 200);
    const comments = await b.entities.Comment.list('-created_date', 200);
    const offers = await b.entities.Offer.list('-created_date', 500);
    const bids = await b.entities.Bid.list('-created_date', 200);
    const events = await b.entities.Event.list('-created_date', 200);
    const giveaways = await b.entities.Giveaway.list('-created_date', 100);
    const giveawayEntries = await b.entities.GiveawayEntry.list('-created_date', 500);
    const messages = await b.entities.Message.list('-created_date', 500);
    const conversations = await b.entities.Conversation.list('-created_date', 200);
    const notifications = await b.entities.Notification.list('-created_date', 200);
    const garageCars = await b.entities.GarageCar.list('-created_date', 200);
    const follows = await b.entities.Follow.list('-created_date', 200);
    const stories = await b.entities.Story.list('-created_date', 100);
    const partnerDiscounts = await b.entities.PartnerDiscount.list('-created_date', 100);

    // Calculate key metrics
    const activeListings = listings.filter(l => l.status === 'active');
    const soldListings = listings.filter(l => l.status === 'sold');
    const pendingOffers = offers.filter(o => o.status === 'pending');
    const acceptedOffers = offers.filter(o => o.status === 'accepted');
    const activeGiveaways = giveaways.filter(g => g.status === 'active');
    const unreadNotifications = notifications.filter(n => !n.read);
    const auctionListings = listings.filter(l => l.selling_format === 'auction');
    const featuredListings = listings.filter(l => l.featured || l.homepage_feature || l.top_of_search);

    // Recent activity (last 24h)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentListings = listings.filter(l => l.created_date && new Date(l.created_date) > yesterday);
    const recentPosts = posts.filter(p => p.created_date && new Date(p.created_date) > yesterday);
    const recentOffers = offers.filter(o => o.created_date && new Date(o.created_date) > yesterday);

    // Revenue estimation
    const subscriptionRevenue = 0; // Would need Stripe data
    const promotionRevenue = featuredListings.reduce((sum, l) => {
      let r = 0;
      if (l.featured) r += 9.99;
      if (l.top_of_search) r += 9.99;
      if (l.urgent) r += 4.99;
      if (l.homepage_feature) r += 14.99;
      if (l.auction_pro) r += 24.99;
      return sum + r;
    }, 0);
    const raffleRevenue = giveawayEntries.filter(e => e.entry_type === 'raffle_ticket').reduce((sum, e) => sum + (e.tickets || 1) * 5, 0);
    const auctionRevenue = auctionListings.reduce((sum, l) => {
      let r = 0;
      r += l.auction_duration === 14 ? 14.99 : 9.99;
      if (l.reserve_price) r += 4.99;
      if (l.auto_relist) r += 4.99;
      if (l.auction_pro) r += 24.99;
      return sum + r;
    }, 0);
    const estimatedRevenue = promotionRevenue + raffleRevenue + auctionRevenue;

    const metrics = {
      total_listings: listings.length,
      active_listings: activeListings.length,
      sold_listings: soldListings.length,
      recent_listings_24h: recentListings.length,
      total_posts: posts.length,
      recent_posts_24h: recentPosts.length,
      total_comments: comments.length,
      total_offers: offers.length,
      pending_offers: pendingOffers.length,
      accepted_offers: acceptedOffers.length,
      recent_offers_24h: recentOffers.length,
      total_bids: bids.length,
      auction_listings: auctionListings.length,
      featured_listings: featuredListings.length,
      total_events: events.length,
      active_giveaways: activeGiveaways.length,
      total_giveaway_entries: giveawayEntries.length,
      total_messages: messages.length,
      total_conversations: conversations.length,
      unread_notifications: unreadNotifications.length,
      total_garage_cars: garageCars.length,
      total_follows: follows.length,
      total_stories: stories.length,
      partner_discounts: partnerDiscounts.length,
      estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
      promotion_revenue: Math.round(promotionRevenue * 100) / 100,
      raffle_revenue: Math.round(raffleRevenue * 100) / 100,
      auction_revenue: Math.round(auctionRevenue * 100) / 100,
    };

    // Generate executive report using InvokeLLM
    const llmResponse = await b.integrations.Core.InvokeLLM({
      prompt: `You are the Master Orchestrator of Honda Hub, an Australian Honda marketplace and community platform. Generate a comprehensive daily executive report based on the following metrics.

METRICS:
${JSON.stringify(metrics, null, 2)}

Produce the daily report with these sections:
1. Overall app health score (0-100)
2. Executive summary (2-3 sentences)
3. Critical issues (array of strings)
4. High priority issues (array of strings)
5. Revenue opportunities (array of strings)
6. Security risks (array of strings)
7. Performance issues (array of strings)
8. Customer experience score (0-100)
9. Suggested improvements (array of strings)

Consider:
- Low listing counts or low recent activity may indicate engagement issues
- Pending offers that haven't been accepted may indicate friction
- Unread notifications count
- Revenue opportunities from featured listings, auctions, and raffle tickets
- Any anomalies in the data

Be specific and actionable. Each array item should be a clear, specific finding or recommendation.`,
      response_json_schema: {
        type: "object",
        properties: {
          health_score: { type: "number" },
          executive_summary: { type: "string" },
          critical_issues: { type: "array", items: { type: "string" } },
          high_priority_issues: { type: "array", items: { type: "string" } },
          revenue_opportunities: { type: "array", items: { type: "string" } },
          security_risks: { type: "array", items: { type: "string" } },
          performance_issues: { type: "array", items: { type: "string" } },
          customer_experience_score: { type: "number" },
          suggested_improvements: { type: "array", items: { type: "string" } }
        }
      }
    });

    const report = llmResponse;

    // Build markdown content
    const markdownContent = `# Daily Executive Report — ${now.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Executive Summary
${report.executive_summary}

## Scores
- **App Health Score:** ${report.health_score}/100
- **Customer Experience Score:** ${report.customer_experience_score}/100

## Critical Issues
${report.critical_issues?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## High Priority Issues
${report.high_priority_issues?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## Revenue Opportunities
${report.revenue_opportunities?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## Security Risks
${report.security_risks?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## Performance Issues
${report.performance_issues?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## Suggested Improvements
${report.suggested_improvements?.map((i, idx) => `${idx + 1}. ${i}`).join('\n') || 'None identified'}

## Key Metrics
- Total Listings: ${metrics.total_listings} (${metrics.active_listings} active, ${metrics.sold_listings} sold)
- New Listings (24h): ${metrics.recent_listings_24h}
- Community Posts: ${metrics.total_posts} (${metrics.recent_posts_24h} in last 24h)
- Total Offers: ${metrics.total_offers} (${metrics.pending_offers} pending)
- Total Bids: ${metrics.total_bids}
- Auction Listings: ${metrics.auction_listings}
- Featured Listings: ${metrics.featured_listings}
- Active Giveaways: ${metrics.active_giveaways} (${metrics.total_giveaway_entries} entries)
- Total Messages: ${metrics.total_messages} across ${metrics.total_conversations} conversations
- Garage Cars: ${metrics.total_garage_cars}
- Total Follows: ${metrics.total_follows}
- Unread Notifications: ${metrics.unread_notifications}
- Estimated Revenue: $${metrics.estimated_revenue}
  - Promotions: $${metrics.promotion_revenue}
  - Raffle: $${metrics.raffle_revenue}
  - Auctions: $${metrics.auction_revenue}`;

    // Save report to entity
    const savedReport = await b.entities.Report.create({
      report_type: 'daily_executive',
      title: `Daily Executive Report — ${now.toLocaleDateString('en-AU')}`,
      summary: report.executive_summary,
      content: markdownContent,
      health_score: report.health_score,
      customer_experience_score: report.customer_experience_score,
      critical_issues: report.critical_issues || [],
      high_priority_issues: report.high_priority_issues || [],
      revenue_opportunities: report.revenue_opportunities || [],
      security_risks: report.security_risks || [],
      suggested_improvements: report.suggested_improvements || [],
      metrics: JSON.stringify(metrics),
      status: 'active'
    });

    return Response.json({
      success: true,
      report_id: savedReport.id,
      health_score: report.health_score,
      customer_experience_score: report.customer_experience_score,
      critical_issues_count: (report.critical_issues || []).length,
      summary: report.executive_summary
    });
  } catch (error) {
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});