import { runtimeEnvironment, webHandler } from './_shared/webHandler';
import type { Config } from '@netlify/functions';
import Stripe from 'stripe';
import { fulfillPremiumCheckout, reconcilePayment, referenceId, type FulfillmentStripe, type PaymentDatabase } from './_shared/paymentLifecycle';
import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  getOptionalSupabaseAdminConfig,
  getStripeServerConfig,
  type StripeServerConfig,
  type SupabaseAdminConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';

interface StripeWebhookClient extends FulfillmentStripe {
  webhooks: { constructEvent(body: string, signature: string, secret: string): Stripe.Event };
  charges: { retrieve(id: string): Promise<Pick<Stripe.Charge, 'payment_intent'>> };
}

interface WebhookDependencies {
  stripeConfig: StripeServerConfig;
  supabaseConfig: SupabaseAdminConfig | null;
  stripe: StripeWebhookClient;
  database: PaymentDatabase | null;
  createRequestId(): string;
}

const createDefaultDependencies = (): WebhookDependencies => {
  const stripeConfig = getStripeServerConfig(runtimeEnvironment);
  const supabaseConfig = getOptionalSupabaseAdminConfig(runtimeEnvironment);

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

const processCompletedCheckout = async (
  event: Stripe.Event, dependencies: WebhookDependencies, requestId: string,
): Promise<void> => {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'payment') throw new HttpError(400, 'payment_not_completed', 'Checkout is not a payment');
  if (session.payment_status !== 'paid') return;
  if (session.metadata?.productType === 'support_donation') {
    const items = await dependencies.stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    if (items.data[0]?.price?.id !== dependencies.stripeConfig.priceId) {
      throw new HttpError(400, 'unexpected_price', 'Checkout session price does not match configured product');
    }
    logEvent('info', 'Support payment completed', requestId, { eventId: event.id, sessionId: session.id });
    return;
  }
  if (!dependencies.database) throw new Error('Premium database is unavailable');
  const state = await fulfillPremiumCheckout(session, dependencies.stripe, dependencies.database, dependencies.stripeConfig.priceId, event.id);
  logEvent('info', 'Premium payment reconciled', requestId, { eventId: event.id, sessionId: session.id, state });
};

const adjustmentEvents = new Set([
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
]);

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
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body,
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
    if (stripeEvent.type === 'checkout.session.completed' || stripeEvent.type === 'checkout.session.async_payment_succeeded') {
      await processCompletedCheckout(stripeEvent, dependencies, effectiveRequestId);
    } else if (adjustmentEvents.has(stripeEvent.type) && dependencies.database) {
      const object = stripeEvent.data.object as Stripe.Charge | Stripe.Refund | Stripe.Dispute;
      let intentId = referenceId(object.payment_intent);
      if (!intentId && 'charge' in object) {
        const chargeId = referenceId(object.charge);
        if (chargeId) intentId = referenceId((await dependencies.stripe.charges.retrieve(chargeId)).payment_intent);
      }
      if (intentId) await reconcilePayment(dependencies.stripe, dependencies.database, intentId);
    }
    // Failed asynchronous sessions are queried from Stripe by checkout-status.
    // Never mark an unpaid session successful from its redirect URL.

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

export default webHandler(createStripeWebhookHandler());
export const config: Config = {};
