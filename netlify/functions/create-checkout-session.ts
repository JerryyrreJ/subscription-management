import { createHash } from 'node:crypto';
import { runtimeEnvironment, webHandler } from './_shared/webHandler';
import type { Config } from '@netlify/functions';
import Stripe from 'stripe';
import type { Handler, HandlerEvent } from '@netlify/functions';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import {
  getOptionalSupabasePublicConfig,
  getSupabaseAdminConfig,
  getStripeServerConfig,
  type StripeServerConfig,
  type SupabasePublicConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent, maskEmail } from './_shared/logging';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';

interface CheckoutSession {
  id: string;
  url: string | null;
}

export interface CheckoutStripeClient {
  prices: { retrieve(id: string): Promise<Pick<Stripe.Price, "active" | "currency" | "unit_amount" | "type" | "livemode">> };
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions): Promise<CheckoutSession>;
    };
  };
}

interface CheckoutDependencies {
  stripeConfig: StripeServerConfig;
  supabaseConfig: SupabasePublicConfig | null;
  stripe: CheckoutStripeClient;
  createAuthClient(config: SupabasePublicConfig): AuthClient;
  createRequestId(): string;
  isPremium(userId: string): Promise<boolean>;
}

const createDefaultDependencies = (): CheckoutDependencies => {
  const env = runtimeEnvironment;
  const stripeConfig = getStripeServerConfig(env);
  const supabaseConfig = getOptionalSupabasePublicConfig(env);

  return {
    stripeConfig,
    supabaseConfig,
    stripe: new Stripe(stripeConfig.secretKey, {
      apiVersion: '2025-09-30.clover',
    }),
    createAuthClient: createSupabaseAuthClient,
    isPremium: async userId => {
      const database = createSupabaseAdminClient(getSupabaseAdminConfig(env));
      const { data, error } = await database.from('user_profiles').select('is_premium').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return Boolean(data?.is_premium);
    },
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
      if (await dependencies.isPremium(userId)) {
        throw new HttpError(409, 'already_premium', 'This account already has Premium');
      }
    }

    if (isPremiumPurchase) {
      const price = await dependencies.stripe.prices.retrieve(dependencies.stripeConfig.priceId);
      const expectsLive = dependencies.stripeConfig.secretKey.startsWith('sk_live_') || dependencies.stripeConfig.secretKey.startsWith('rk_live_');
      if (!price.active || price.type !== 'one_time' || price.currency !== 'usd' || price.unit_amount !== 900 || price.livemode !== expectsLive) {
        throw new HttpError(503, 'invalid_premium_price', 'Premium checkout is temporarily unavailable');
      }
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
    }, isPremiumPurchase ? {
      // Repeated clicks/tabs within this window return the same checkout session.
      idempotencyKey: 'premium:' + createHash('sha256').update([userId, dependencies.stripeConfig.priceId, Math.floor(Date.now() / 600_000)].join(':')).digest('hex'),
    } : undefined);

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

export default webHandler(createCheckoutHandler());
export const config: Config = {};
