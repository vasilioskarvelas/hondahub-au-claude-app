import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const b = base44.asServiceRole;

    const issues = [];
    const fixes = [];

    // Check Listings for missing fields
    const listings = await b.entities.Listing.list("-created_date", 100);
    for (const l of listings) {
      if (!l.title || l.title.trim() === "") {
        issues.push(`Listing ${l.id}: Missing title`);
      }
      if (!l.description || l.description.trim() === "") {
        issues.push(`Listing ${l.id}: Missing description`);
      }
      if (l.price === null || l.price === undefined) {
        issues.push(`Listing ${l.id}: Null price`);
        try {
          await b.entities.Listing.update(l.id, { price: 0 });
          fixes.push(`Listing ${l.id}: Set null price to 0`);
        } catch (e) {
          console.error(`Failed to fix listing ${l.id} price:`, e.message);
        }
      }
    }

    // Check CommunityPosts for missing caption
    const posts = await b.entities.CommunityPost.list("-created_date", 100);
    for (const p of posts) {
      if (!p.caption || p.caption.trim() === "") {
        issues.push(`CommunityPost ${p.id}: Missing caption`);
      }
    }

    // Check Offers for null amounts
    const offers = await b.entities.Offer.list("-created_date", 100);
    for (const o of offers) {
      if (o.amount === null || o.amount === undefined) {
        issues.push(`Offer ${o.id}: Null amount`);
        try {
          await b.entities.Offer.update(o.id, { amount: 0, type: "swap" });
          fixes.push(`Offer ${o.id}: Set null amount to 0`);
        } catch (e) {
          console.error(`Failed to fix offer ${o.id} amount:`, e.message);
        }
      }
    }

    // Check Stories for missing captions
    const stories = await b.entities.Story.list("-created_date", 100);
    for (const s of stories) {
      if (!s.caption || s.caption.trim() === "") {
        issues.push(`Story ${s.id}: Missing caption`);
      }
    }

    // Check Conversations for empty last_message
    const conversations = await b.entities.Conversation.list("-created_date", 100);
    for (const c of conversations) {
      if (!c.last_message || c.last_message.trim() === "") {
        issues.push(`Conversation ${c.id}: Empty last_message`);
      }
    }

    // Check Messages exist
    const messages = await b.entities.Message.list("-created_date", 100);
    for (const c of conversations) {
      const msgCount = messages.filter((m) => m.conversation_id === c.id).length;
      if (msgCount === 0) {
        issues.push(`Conversation ${c.id}: No messages`);
      }
    }

    // Check Comments exist
    const comments = await b.entities.Comment.list("-created_date", 100);
    if (comments.length === 0) {
      issues.push("System: No comments in entire system");
    }

    // Check GiveawayEntries distribution
    const giveaways = await b.entities.Giveaway.list("-created_date", 50);
    const entries = await b.entities.GiveawayEntry.list("-created_date", 200);
    for (const g of giveaways) {
      const entryCount = entries.filter((e) => e.giveaway_id === g.id).length;
      if (entryCount === 0) {
        issues.push(`Giveaway ${g.id} (${g.title}): No entries`);
      }
    }

    // Count unread notifications
    const notifications = await b.entities.Notification.list("-created_date", 100);
    const unreadCount = notifications.filter((n) => !n.read).length;

    // Build summary
    const summary = {
      timestamp: new Date().toISOString(),
      issues_found: issues.length,
      fixes_applied: fixes.length,
      unread_notifications: unreadCount,
      issues: issues,
      fixes: fixes,
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

    // Save sweep report
    try {
      await b.entities.Report.create({
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
      console.error("Report save failed:", e.message);
    }

    return Response.json({
      success: true,
      sweep_time: summary.timestamp,
      issues_found: issues.length,
      fixes_applied: fixes.length,
      summary: summary,
    });
  } catch (error) {
    console.error("Auto-sweep error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});