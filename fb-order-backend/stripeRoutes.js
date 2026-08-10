const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Initialize Stripe & Supabase from env variables with fallback test keys
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wpykjqedncfwqvcaqrni.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

/**
 * POST /api/stripe/create-checkout
 * Creates a Stripe Checkout Session for restaurant subscription.
 */
router.post('/create-checkout', async (req, res) => {
  try {
    const { tenant_id, customer_email, plan_type = 'starter', months = 4, success_url, cancel_url } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id parameter is required.' });
    }

    // BACKEND GUARD: Prevent double subscriptions
    if (supabase && tenant_id !== 'demo-restaurant') {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('subscription_status, stripe_subscription_id')
        .eq('id', tenant_id)
        .single();
        
      if (tenantData && tenantData.stripe_subscription_id && tenantData.subscription_status !== 'canceled') {
        return res.status(400).json({ error: 'Pelan langganan anda masih wujud (Aktif/Tertunggak). Sila guna portal bil (Urus Langganan) untuk menukar pelan atau kad, bagi mengelakkan bayaran bertindih.' });
      }
    }

    // 1. FREE PLAN HANDLER
    if (plan_type === 'free' || plan_type === 'percuma') {
      if (supabase && tenant_id !== 'demo-restaurant') {
        await supabase
          .from('tenants')
          .update({
            subscription_status: 'active',
            plan_type: 'free',
          })
          .eq('id', tenant_id);
      }
      return res.json({ url: success_url || `http://localhost:5173/staff?subscription=success` });
    }

    // 2. PAID PLANS CHECKOUT (4 / 8 / 12 MONTHS)
    if (!stripe) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured on backend.' });
    }

    let priceAmountCents = 49600; // Default 4 Bulan: RM 496 (in cents)
    let planName = 'LajuQ SaaS - Pelan 4 Bulan';
    let planCode = '4months';
    let intervalCount = 4;

    if (months === 12 || plan_type === 'vps') {
      priceAmountCents = 139000; // 12 Bulan: RM 1,390
      planName = 'LajuQ SaaS - Pelan 12 Bulan (Server VPS Khas)';
      planCode = '12months';
      intervalCount = 12;
    } else if (months === 8 || plan_type === 'pro') {
      priceAmountCents = 93000; // 8 Bulan: RM 930
      planName = 'LajuQ SaaS - Pelan 8 Bulan (Diskaun RM62)';
      planCode = '8months';
      intervalCount = 8;
    } else {
      priceAmountCents = 49600; // 4 Bulan: RM 496
      planName = 'LajuQ SaaS - Pelan 4 Bulan';
      planCode = '4months';
      intervalCount = 4;
    }

    const price4M = process.env.STRIPE_PRICE_4MONTHS;
    const price8M = process.env.STRIPE_PRICE_8MONTHS;
    const price12M = process.env.STRIPE_PRICE_12MONTHS;

    let selectedPriceId;
    if (planCode === '12months') {
      selectedPriceId = price12M;
    } else if (planCode === '8months') {
      selectedPriceId = price8M;
    } else {
      selectedPriceId = price4M;
    }

    if (!selectedPriceId || selectedPriceId.includes('YOUR_')) {
      return res.status(500).json({ error: 'STRIPE_PRICE_IDs are not configured on backend. Sila kemaskini fail .env.' });
    }

    // Validation Logging: Check if the Stripe dashboard price matches expected amount
    try {
      const priceObj = await stripe.prices.retrieve(selectedPriceId);
      if (priceObj.unit_amount !== priceAmountCents) {
        console.warn(`[Stripe Config Warning] Price ID ${selectedPriceId} unit_amount (${priceObj.unit_amount}) does not match expected code value (${priceAmountCents}). Please check Stripe Dashboard!`);
      }

      const priceIntervalCount = priceObj.recurring?.interval_count;
      if (priceIntervalCount !== intervalCount) {
        console.warn(`[Stripe Config Warning] Price ID ${selectedPriceId} ada interval_count=${priceIntervalCount || 'tiada'} tetapi dijangka ${intervalCount} — pelanggan mungkin dicaj pada kekerapan bil yang salah! Sila check Stripe Dashboard!`);
      }
    } catch (err) {
      console.warn(`[Stripe Config Warning] Failed to retrieve Price ID ${selectedPriceId} for validation:`, err.message);
    }

    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      allow_promotion_codes: true,
      line_items: [
        {
          price: selectedPriceId,
          quantity: 1,
        },
      ],
      metadata: {
        tenant_id,
        plan_type: planCode,
      },
      subscription_data: {
        metadata: {
          tenant_id,
        }
      },
      success_url: success_url || `http://localhost:5173/staff?subscription=success&tenant_id=${tenant_id}`,
      cancel_url: cancel_url || `http://localhost:5173/staff?subscription=cancelled`,
    };

    if (customer_email) {
      sessionParams.customer_email = customer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe Checkout Error]:', err.message);
    return res.status(500).json({ error: err.message || 'Gagal mencipta pautan bayaran Stripe Checkout.' });
  }
});

/**
 * POST /api/stripe/create-portal
 * Creates a Customer Portal session for managing subscriptions.
 */
router.post('/create-portal', async (req, res) => {
  try {
    const { tenant_id, return_url } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id parameter is required.' });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured on backend.' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client is not configured.' });
    }

    // Fetch tenant from Supabase
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', tenant_id)
      .single();

    if (error || !tenant || !tenant.stripe_customer_id) {
      return res.status(404).json({ error: 'Maklumat pelanggan Stripe tidak dijumpai untuk restoran ini.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: return_url || 'http://localhost:5173/staff',
    });

    return res.json({ url: portalSession.url });
  } catch (err) {
    console.error('[Stripe Portal Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stripe/webhook
 * Listens for Stripe webhook events (checkout.session.completed, customer.subscription.deleted).
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret && sig && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In local dev without secret, parse JSON directly from raw buffer
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    console.error('[Stripe Webhook Verification Error]:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const eventId = event.id;

    // 1. IDEMPOTENCY CHECK
    if (supabase) {
      const { data: existingEvent } = await supabase
        .from('stripe_webhook_events')
        .select('id')
        .eq('id', eventId)
        .single();
      
      if (existingEvent) {
        console.log(`[Stripe Webhook] Event ${eventId} already processed. Skipping.`);
        return res.json({ received: true, skipped: true });
      }

      // Record the event to prevent duplicate processing
      await supabase.from('stripe_webhook_events').insert([{ id: eventId }]);
    }

    // 2. PROCESS EVENTS
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const planType = session.metadata?.plan_type || '4months';

        console.log(`[Stripe Webhook] Subscription ACTIVATED for tenant: ${tenantId}, plan: ${planType}`);

        if (tenantId && supabase) {
          await supabase
            .from('tenants')
            .update({
              subscription_status: 'active',
              stripe_customer_id: session.customer || null,
              stripe_subscription_id: session.subscription || null,
              plan_type: planType,
              subscription_past_due: false
            })
            .eq('id', tenantId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subId = subscription.id;
        const status = subscription.status; // e.g., 'active', 'past_due', 'canceled'
        const tenantId = subscription.metadata?.tenant_id;
        const endDate = new Date(subscription.current_period_end * 1000).toISOString();
        
        let mappedStatus = 'active';
        if (status === 'past_due' || status === 'unpaid') mappedStatus = 'past_due';
        if (status === 'canceled') mappedStatus = 'canceled';

        // Derive plan_type from static Price IDs to handle Billing Portal upgrades/downgrades securely
        let derivedPlanType = null;
        if (subscription.items && subscription.items.data && subscription.items.data.length > 0) {
          const currentPriceId = subscription.items.data[0].price.id;
          
          if (currentPriceId === process.env.STRIPE_PRICE_4MONTHS) {
            derivedPlanType = '4months';
          } else if (currentPriceId === process.env.STRIPE_PRICE_8MONTHS) {
            derivedPlanType = '8months';
          } else if (currentPriceId === process.env.STRIPE_PRICE_12MONTHS) {
            derivedPlanType = '12months';
          } else {
            console.warn(`[Stripe Webhook Warning] Unrecognized price ID: ${currentPriceId} for sub: ${subId}. Plan type will not be updated.`);
          }
        }

        console.log(`[Stripe Webhook] Subscription UPDATED for sub: ${subId}, status: ${status}, plan: ${derivedPlanType || 'unchanged'}`);

        if (subId && supabase) {
          const updateData = { 
            subscription_status: mappedStatus,
            subscription_end_date: endDate,
            subscription_past_due: mappedStatus === 'past_due'
          };
          if (derivedPlanType) {
            updateData.plan_type = derivedPlanType;
          }

          await supabase
            .from('tenants')
            .update(updateData)
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subId = subscription.id;

        console.log(`[Stripe Webhook] Subscription DELETED for sub: ${subId}`);

        if (subId && supabase) {
          await supabase
            .from('tenants')
            .update({ 
              subscription_status: 'canceled',
              subscription_past_due: false,
              stripe_subscription_id: null
            })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;

        console.log(`[Stripe Webhook] Invoice PAYMENT FAILED for sub: ${subId}`);

        if (subId && supabase) {
          await supabase
            .from('tenants')
            .update({ 
              subscription_status: 'past_due',
              subscription_past_due: true 
            })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Event ignored: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook Processing Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

