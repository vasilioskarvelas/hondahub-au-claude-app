import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};

      // Handle listing features (auction, promotions, boosts, buy_now)
      if (metadata.features && metadata.listing_id) {
        const features = metadata.features.split(',').filter(Boolean);
        const listingId = metadata.listing_id;
        const isRelist = metadata.relist === 'true';

        const updates = {};

        for (const feature of features) {
          if (feature === 'auction_7' || feature === 'auction_14') {
            const duration = feature === 'auction_7' ? 7 : 14;
            updates.auction_status = 'active';
            updates.auction_end_date = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString();
            if (isRelist) {
              updates.current_highest_bid = 0;
              updates.highest_bidder_name = '';
            }
          }
          if (feature === 'auction_pro') {
            updates.auction_pro = true;
            updates.featured = true;
            updates.top_of_search = true;
          }
          if (feature === 'auto_relist') {
            updates.auto_relist = true;
          }
          if (feature === 'boost' || feature === 'feature_listing') {
            updates.featured = true;
          }
          if (feature === 'top_search') {
            updates.top_of_search = true;
          }
          if (feature === 'urgent_badge') {
            updates.urgent = true;
          }
          if (feature === 'homepage_feature') {
            updates.homepage_feature = true;
          }
          if (feature === 'buy_now') {
            updates.status = 'sold';
          }
        }

        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Listing.update(listingId, updates);
          console.log(`Listing ${listingId} updated with features: ${features.join(', ')}`);
        }
      }

      // Handle raffle
      if (metadata.type === 'raffle' && metadata.giveaway_id) {
        await base44.asServiceRole.entities.GiveawayEntry.create({
          giveaway_id: metadata.giveaway_id,
          user_name: metadata.buyer_name || 'Guest',
          entry_type: 'raffle_ticket',
          tickets: 1,
        });
        const giveaway = await base44.asServiceRole.entities.Giveaway.get(metadata.giveaway_id);
        if (giveaway) {
          await base44.asServiceRole.entities.Giveaway.update(metadata.giveaway_id, {
            total_entries: (giveaway.total_entries || 0) + 1,
          });
        }
        console.log(`Raffle ticket purchased for giveaway ${metadata.giveaway_id}`);
      }

      // Handle subscription
      if (metadata.user_id) {
        const priceId = session.line_items?.data?.[0]?.price?.id;
        let tier = 'free';
        if (priceId === 'price_1Tq4mgBoLwMT73MxeCC7vib2') tier = 'pro';
        if (priceId === 'price_1Tq4mgBoLwMT73MxkslPo770') tier = 'dealer';
        await base44.asServiceRole.entities.User.update(metadata.user_id, { subscription_tier: tier });
        console.log(`User ${metadata.user_id} subscribed to ${tier}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id;
      if (userId) {
        await base44.asServiceRole.entities.User.update(userId, { subscription_tier: 'free' });
        console.log(`User ${userId} subscription cancelled`);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});