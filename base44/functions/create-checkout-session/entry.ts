import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.0.0';

const FEATURE_PRICING = {
  auction_7: { amount: 999, name: '7-Day Auction Listing' },
  auction_14: { amount: 1499, name: '14-Day Auction Listing' },
  reserve_price: { amount: 499, name: 'Reserve Price Add-on' },
  auto_relist: { amount: 499, name: 'Auto-Relist Add-on' },
  auction_pro: { amount: 2499, name: 'Auction Pro Bundle' },
  feature_listing: { amount: 999, name: 'Feature Listing' },
  top_search: { amount: 999, name: 'Top of Search Boost' },
  urgent_badge: { amount: 499, name: 'Urgent Sale Badge' },
  homepage_feature: { amount: 1499, name: 'Homepage Feature' },
  boost: { amount: 1000, name: 'Featured Listing Boost' },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { listing_id, mode, price_id, items } = body;
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const origin = req.headers.get('origin') || 'https://app.base44.com';

    // Subscription mode
    if (mode === 'subscribe') {
      if (!price_id) {
        return Response.json({ error: 'price_id is required for subscriptions' }, { status: 400 });
      }
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: price_id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${origin}/profile?sub=success`,
        cancel_url: `${origin}/pricing?sub=cancelled`,
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          user_id: user.id,
        },
      });
      return Response.json({ url: session.url });
    }

    // Raffle mode
    if (mode === 'raffle') {
      const { giveaway_id, buyer_name } = body;
      if (!giveaway_id) {
        return Response.json({ error: 'giveaway_id is required' }, { status: 400 });
      }
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: 'price_1Tq5moBoLwMT73MxA6sn2tiP', quantity: 1 }],
        mode: 'payment',
        success_url: `${origin}/giveaway?raffle=success`,
        cancel_url: `${origin}/giveaway?raffle=cancelled`,
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          giveaway_id,
          buyer_name: buyer_name || 'Guest',
          type: 'raffle',
        },
      });
      return Response.json({ url: session.url });
    }

    // Features mode (auction fees, promotions, bundles, relist)
    if (mode === 'features') {
      if (!listing_id) {
        return Response.json({ error: 'listing_id is required' }, { status: 400 });
      }
      if (!items || items.length === 0) {
        return Response.json({ error: 'items array is required' }, { status: 400 });
      }

      const line_items = items.map((item) => {
        const pricing = FEATURE_PRICING[item];
        if (!pricing) throw new Error(`Unknown feature: ${item}`);
        return {
          price_data: {
            currency: 'aud',
            product_data: { name: pricing.name },
            unit_amount: pricing.amount,
          },
          quantity: 1,
        };
      });

      const isRelist = body.relist === true;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        success_url: `${origin}/listing/${listing_id}?promo=success`,
        cancel_url: `${origin}/listing/${listing_id}?promo=cancelled`,
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          listing_id,
          features: items.join(','),
          ...(isRelist ? { relist: 'true' } : {}),
        },
      });
      return Response.json({ url: session.url });
    }

    // Legacy boost mode
    if (mode === 'boost') {
      if (!listing_id) {
        return Response.json({ error: 'listing_id is required' }, { status: 400 });
      }
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: { name: 'Featured Listing Boost' },
            unit_amount: 1000,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${origin}/listing/${listing_id}?boost=success`,
        cancel_url: `${origin}/profile?boost=cancelled`,
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          listing_id,
          features: 'boost',
        },
      });
      return Response.json({ url: session.url });
    }

    // Default: Buy Now (listing purchase)
    if (listing_id) {
      const listing = await base44.asServiceRole.entities.Listing.get(listing_id);
      if (!listing) {
        return Response.json({ error: 'Listing not found' }, { status: 404 });
      }
      if (listing.status === 'sold') {
        return Response.json({ error: 'This listing has already been sold' }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: listing.title,
              description: listing.description ? listing.description.slice(0, 200) : undefined,
            },
            unit_amount: Math.round(listing.price * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${origin}/listing/${listing_id}?payment=success`,
        cancel_url: `${origin}/listing/${listing_id}?payment=cancelled`,
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          listing_id,
          features: 'buy_now',
        },
      });
      return Response.json({ url: session.url });
    }

    return Response.json({ error: 'listing_id or mode is required' }, { status: 400 });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});