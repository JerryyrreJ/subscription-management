import Stripe from 'stripe';
import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import {
  getOptionalSupabaseAdminConfig,
  getStripeServerConfig,
  type StripeServerConfig,
  type SupabaseAdminConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent, maskEmail } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';

const premiumMetadataSchema = z.object({
  userId: z.string().uuid(),
  productType: z.literal('premium_lifetime'),
  priceId: z.string().min(1),
});

interface StripeWebhookClient {
  webhooks: {
    constructEvent(body: string, signature: string, secret: string): Stripe.Event;
  };
  checkout: {
    sessions: {
      listLineItems(sessionId: string, params: { limit: number }): Promise<{
        data: Array<{ price?: { id: string } | null }>;
      }>;
    };
  };
}

interface PremiumDatabaseClient {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

interface WebhookDependencies {
  stripeConfig: StripeServerConfig;
  supabaseConfig: SupabaseAdminConfig | null;
  stripe: StripeWebhookClient;
  database: PremiumDatabaseClient | null;
  createRequestId(): string;
}

const createDefaultDependencies = (): WebhookDependencies => {
  const stripeConfig = getStripeServerConfig(process.env);
  const supabaseConfig = getOptionalSupabaseAdminConfig(process.env);

  return {
    stripeConfig,
    supabaseConfig,
    stripe: new Stripe(stripeConfig.secretKey, {
      apiVersion: '2025-09-30.clover',
    }),
    database: supabaseConfig ? createSupabaseAdminClient(supabaseConfig) : null,
    createRequestId: () => crypto.randomUUID(),
  };
};

const getStripeReferenceId = (
  value: string | { id: string } | null
): string | null => typeof value === 'string' ? value : value?.id || null;

const verifyPurchasedPrice = async (
  stripe: StripeWebhookClient,
  sessionId: string,
  expectedPriceId: string
): Promise<void> => {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 1 });
  const purchasedPriceId = lineItems.data[0]?.price?.id;

  if (!purchasedPriceId || purchasedPriceId !== expectedPriceId) {
    throw new HttpError(400, 'unexpected_price', 'Checkout session price does not match configured product');
  }
};

const processCompletedCheckout = async (
  event: Stripe.Event,
  dependencies: WebhookDependencies,
  requestId: string
): Promise<void> => {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    throw new HttpError(400, 'payment_not_completed', 'Checkout session is not a completed payment');
  }

  await verifyPurchasedPrice(
    dependencies.stripe,
    session.id,
    dependencies.stripeConfig.priceId
  );

  const productType = session.metadata?.productType;
  if (productType === 'support_donation') {
    logEvent('info', 'Support payment completed', requestId, {
      eventId: event.id,
      sessionId: session.id,
    });
    return;
  }

  const metadata = premiumMetadataSchema.safeParse(session.metadata);
  if (!metadata.success || metadata.data.priceId !== dependencies.stripeConfig.priceId) {
    throw new HttpError(400, 'invalid_checkout_metadata', 'Checkout session metadata is invalid');
  }

  if (!dependencies.supabaseConfig || !dependencies.database) {
    throw new Error('Premium payment received without Supabase admin configuration');
  }

  const customerEmail = session.customer_details?.email || session.customer_email;
  const { error } = await dependencies.database.rpc('complete_premium_purchase', {
    purchase_user_id: metadata.data.userId,
    purchase_stripe_session_id: session.id,
    purchase_payment_intent_id: getStripeReferenceId(session.payment_intent),
    purchase_customer_id: getStripeReferenceId(session.customer),
    purchase_price_id: dependencies.stripeConfig.priceId,
    purchase_amount_total: session.amount_total || 0,
    purchase_currency: session.currency || 'usd',
    purchase_customer_email: customerEmail,
    purchase_metadata: {
      stripe_event_id: event.id,
      payment_status: session.payment_status,
      checkout_created_at: session.created,
    },
  });

  if (error) {
    throw new Error(`Premium purchase transaction failed: ${error.code || 'database_error'}`);
  }

  logEvent('info', 'Premium purchase completed', requestId, {
    eventId: event.id,
    sessionId: session.id,
    userId: metadata.data.userId,
    email: maskEmail(customerEmail),
  });
};

export const createStripeWebhookHandler = (
  dependenciesFactory: () => WebhookDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent) => {
  const requestId = crypto.randomUUID();

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: 'POST' });
  }

  const signature = event.headers['stripe-signature'];
  if (!signature || !event.body) {
    return jsonResponse(400, {
      error: { code: 'invalid_webhook_request', message: 'Missing Stripe signature or body' },
      requestId,
    });
  }

  let dependencies: WebhookDependencies;
  try {
    dependencies = dependenciesFactory();
  } catch (error) {
    logEvent('error', 'Webhook configuration failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error, requestId);
  }

  const effectiveRequestId = dependencies.createRequestId();
  let stripeEvent: Stripe.Event;

  try {
    stripeEvent = dependencies.stripe.webhooks.constructEvent(
      event.body,
      signature,
      dependencies.stripeConfig.webhookSecret
    );
  } catch {
    return jsonResponse(400, {
      error: { code: 'invalid_webhook_signature', message: 'Webhook signature verification failed' },
      requestId: effectiveRequestId,
    });
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      await processCompletedCheckout(stripeEvent, dependencies, effectiveRequestId);
    }

    return jsonResponse(200, { received: true, requestId: effectiveRequestId });
  } catch (error) {
    logEvent('error', 'Webhook processing failed', effectiveRequestId, {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error, effectiveRequestId);
  }
};

export const handler = createStripeWebhookHandler();
