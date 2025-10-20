import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with publishable key
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

export interface CreateCheckoutParams {
  priceId: string;
  userId?: string;
  userEmail?: string;
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

/**
 * Create a Stripe Checkout session and redirect to payment page
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutSessionResponse> {
  if (!stripePromise) {
    throw new Error('Stripe is not configured. Please add VITE_STRIPE_PUBLISHABLE_KEY to your environment variables.');
  }

  try {
    // Call Netlify Function to create checkout session
    const response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create checkout session');
    }

    const data: CheckoutSessionResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe Checkout
 */
export async function redirectToCheckout(params: CreateCheckoutParams): Promise<void> {
  try {
    const { url } = await createCheckoutSession(params);

    // Redirect to Stripe Checkout page
    window.location.href = url;
  } catch (error) {
    console.error('Failed to redirect to checkout:', error);
    throw error;
  }
}

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
  return !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
}

/**
 * Get Stripe Price ID from environment
 */
export function getStripePriceId(): string {
  const priceId = import.meta.env.VITE_STRIPE_PRICE_ID;

  if (!priceId) {
    throw new Error('VITE_STRIPE_PRICE_ID is not configured');
  }

  return priceId;
}
