import { base44 } from "@/api/base44Client";

/**
 * Client-side data integrity sweep.
 * Runs entirely in the browser using the SDK — no backend function,
 * no LLM calls, no integration credits consumed.
 * Only uses database reads/writes (included in your plan).
 */
export async function runAutoSweep() {
  const b = base44.entities;
  const issues = [];
  const fixes = [];

  // Fetch all entities in parallel
  const [
    listings, posts, offers, stories,
    conversations, messages, comments,
    giveaways, entries, notifications
  ] = await Promise.all([
    b.Listing.list("-created_date", 100),
    b.CommunityPost.list("-created_date", 100),
    b.Offer.list("-created_date", 100),
    b.Story.list("-created_date", 100),
    b.Conversation.list("-created_date", 100),
    b.Message.list("-created_date", 100),
    b.Comment.list("-created_date", 100),
    b.Giveaway.list("-created_date", 50),
    b.GiveawayEntry.list("-created_date", 200),
    b.Notification.list("-created_date", 100),
  ]);

  // Check Listings
  for (const l of listings) {
    if (!l.title || !l.title.trim()) issues.push(`Listing ${l.id}: Missing title`);
    if (!l.description || !l.description.trim()) issues.push(`Listing ${l.id}: Missing description`);
    if (l.price === null || l.price === undefined) {
      issues.push(`Listing ${l.id}: Null price`);
      try {
        await b.Listing.update(l.id, { price: 0 });
        fixes.push(`Listing ${l.id}: Set null price to 0`);
      } catch (e) { /* skip */ }
    }
  }

  // Check CommunityPosts
  for (const p of posts) {
    if (!p.caption || !p.caption.trim()) issues.push(`CommunityPost ${p.id}: Missing caption`);
  }

  // Check Offers
  for (const o of offers) {
    if (o.amount === null || o.amount === undefined) {
      issues.push(`Offer ${o.id}: Null amount`);
      try {
        await b.Offer.update(o.id, { amount: 0 });
        fixes.push(`Offer ${o.id}: Set null amount to 0`);
      } catch (e) { /* skip */ }
    }
  }

  // Check Stories
  for (const s of stories) {
    if (!s.caption || !s.caption.trim()) issues.push(`Story ${s.id}: Missing caption`);
  }

  // Check Conversations
  for (const c of conversations) {
    if (!c.last_message || !c.last_message.trim()) issues.push(`Conversation ${c.id}: Empty last_message`);
  }

  // Check messages per conversation
  for (const c of conversations) {
    if (!messages.some((m) => m.conversation_id === c.id)) {
      issues.push(`Conversation ${c.id}: No messages`);
    }
  }

  // Check giveaway entries
  for (const g of giveaways) {
    if (!entries.some((e) => e.giveaway_id === g.id)) {
      issues.push(`Giveaway ${g.id} (${g.title || "Untitled"}): No entries`);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const summary = {
    timestamp: new Date().toISOString(),
    issues_found: issues.length,
    fixes_applied: fixes.length,
    unread_notifications: unreadCount,
    issues,
    fixes,
    counts: {
      listings: listings.length,
      posts: posts.length,
      offers: offers.length,
      stories: stories.length,
      conversations: conversations.length,
      messages: messages.length,
      comments: comments.length,
      notifications: notifications.length,
      giveaways: giveaways.length,
      giveaway_entries: entries.length,
    },
  };

  // Save report (database write — no integration credits)
  try {
    await b.Report.create({
      report_type: "database_health",
      title: `Auto-Sweep — ${new Date().toLocaleString("en-AU")}`,
      summary: `Found ${issues.length} issues, applied ${fixes.length} fixes. Unread: ${unreadCount}`,
      content: JSON.stringify(summary, null, 2),
      health_score: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 5),
      customer_experience_score: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 7),
      critical_issues: issues,
      status: "active",
    });
  } catch (e) {
    console.error("Report save failed:", e);
  }

  return summary;
}