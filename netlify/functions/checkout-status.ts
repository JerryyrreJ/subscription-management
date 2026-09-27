import type { Config, Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import { getSupabaseAdminConfig, getStripeServerConfig } from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { readCheckoutState, type PaymentDatabase } from './_shared/paymentLifecycle';
import type { PremiumCheckoutStripe } from './_shared/premiumCheckout';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';
import { runtimeEnvironment, webHandler } from './_shared/webHandler';

interface Dependencies {
  auth: AuthClient;
  stripe: PremiumCheckoutStripe;
  database: PaymentDatabase;
  priceId: string;
}
const defaults = (): Dependencies => {
  const stripeConfig = getStripeServerConfig(runtimeEnvironment);
  const supabaseConfig = getSupabaseAdminConfig(runtimeEnvironment);
  return {
    auth: createSupabaseAuthClient(supabaseConfig),
    stripe: new Stripe(stripeConfig.secretKey, { apiVersion: '2025-09-30.clover' }),
    database: createSupabaseAdminClient(supabaseConfig), priceId: stripeConfig.priceId,
  };
};
export const createCheckoutStatusHandler = (factory: () => Dependencies = defaults): Handler => async event => {
  const requestId = crypto.randomUUID();
  const headers = { 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: { code: 'method_not_allowed' } }, { ...headers, Allow: 'GET' });
  try {
    const deps = factory();
    const user = await authenticateRequest(event.headers, deps.auth);
    const id = event.queryStringParameters?.session_id;
    if (!id || !/^cs_[a-zA-Z0-9_]{1,240}$/.test(id)) throw new HttpError(400, 'invalid_session_id', 'Invalid checkout session');
    let session: Stripe.Checkout.Session;
    try { session = await deps.stripe.checkout.sessions.retrieve(id); }
    catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') {
        throw new HttpError(404, 'checkout_not_found', 'Checkout not found');
      }
      throw error;
    }
    // Ownership must be checked BEFORE any fulfillment or payment details are returned.
    if (session.metadata?.userId !== user.userId || session.metadata?.productType !== 'premium_lifetime') {
      throw new HttpError(404, 'checkout_not_found', 'Checkout not found');
    }
    const status = await readCheckoutState(session, deps.stripe, deps.database, deps.priceId);
    return jsonResponse(200, { status, sessionId: session.id, requestId }, headers);
  } catch (error) {
    const response = errorResponse(error, requestId);
    return { ...response, headers: { ...response.headers, ...headers } };
  }
};
export default webHandler(createCheckoutStatusHandler());
export const config: Config = {};
