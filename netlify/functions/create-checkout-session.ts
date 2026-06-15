import Stripe from 'stripe';
import type { Handler, HandlerEvent } from '@netlify/functions';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import {
  getOptionalSupabasePublicConfig,
  getStripeServerConfig,
  type StripeServerConfig,
  type SupabasePublicConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent, maskEmail } from './_shared/logging';
import { createSupabaseAuthClient } from './_shared/supabase';

interface CheckoutSession {
  id: string;
  url: string | null;
}

export interface CheckoutStripeClient {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<CheckoutSession>;
    };
  };
}

interface CheckoutDependencies {
  stripeConfig: StripeServerConfig;
  supabaseConfig: SupabasePublicConfig | null;
  stripe: CheckoutStripeClient;
  createAuthClient(config: SupabasePublicConfig): AuthClient;
  createRequestId(): string;
}

const createDefaultDependencies = (): CheckoutDependencies => {
  const env = process.env;
  const stripeConfig = getStripeServerConfig(env);
  const supabaseConfig = getOptionalSupabasePublicConfig(env);

  return {
    stripeConfig,
    supabaseConfig,
    stripe: new Stripe(stripeConfig.secretKey, {
      apiVersion: '2025-09-30.clover',
    }),
    createAuthClient: createSupabaseAuthClient,
    createRequestId: () => crypto.randomUUID(),
  };
};

export const createCheckoutHandler = (
  dependenciesFactory: () => CheckoutDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent) => {
  let requestId: string = crypto.randomUUID();

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: 'POST' });
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const isPremiumPurchase = Boolean(dependencies.supabaseConfig);
    let userId = 'guest';
    let userEmail: string | undefined;

    if (dependencies.supabaseConfig) {
      const authenticated = await authenticateRequest(
        event.headers,
        dependencies.createAuthClient(dependencies.supabaseConfig)
      );
      userId = authenticated.userId;
      userEmail = authenticated.email;
    }

    const productType = isPremiumPurchase ? 'premium_lifetime' : 'support_donation';
    const session = await dependencies.stripe.checkout.sessions.create({
      line_items: [{ price: dependencies.stripeConfig.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${dependencies.stripeConfig.siteUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${dependencies.stripeConfig.siteUrl}?payment=cancelled`,
      customer_email: userEmail,
      billing_address_collection: 'auto',
      metadata: {
        userId,
        productType,
        priceId: dependencies.stripeConfig.priceId,
      },
    });

    if (!session.url) {
      throw new HttpError(502, 'checkout_url_missing', 'Stripe did not return a checkout URL');
    }

    logEvent('info', 'Checkout session created', requestId, {
      sessionId: session.id,
      productType,
      userId,
      email: maskEmail(userEmail),
    });

    return jsonResponse(200, {
      url: session.url,
      sessionId: session.id,
      requestId,
    });
  } catch (error) {
    logEvent('error', 'Checkout session creation failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error, requestId);
  }
};

export const handler = createCheckoutHandler();
