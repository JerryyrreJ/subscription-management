export interface CheckoutSessionResponse {
 url: string;
 sessionId: string;
 requestId?: string;
}

export function assertAllowedCheckoutRedirectUrl(
 url: string,
 currentOrigin?: string
): string {
 let parsed: URL;
 try {
  parsed = new URL(url);
 } catch {
  throw new Error('Invalid checkout redirect URL');
 }

 if (parsed.username !== '' || parsed.password !== '') {
  throw new Error('Checkout redirect URL must not include credentials');
 }

 const resolvedOrigin = currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
 const isSameOrigin = Boolean(
  resolvedOrigin &&
  parsed.origin === resolvedOrigin &&
  (parsed.protocol === 'https:' || parsed.protocol === 'http:')
 );
 const hostname = parsed.hostname.toLowerCase();
 const isStripeHostedCheckout =
  parsed.protocol === 'https:' &&
  (hostname === 'checkout.stripe.com' || hostname.endsWith('.stripe.com'));

 if (!isSameOrigin && !isStripeHostedCheckout) {
  throw new Error('Untrusted checkout redirect URL');
 }

 return parsed.toString();
}

export async function createCheckoutSession(
 accessToken?: string
): Promise<CheckoutSessionResponse> {
 const headers: Record<string, string> = {
 'Content-Type': 'application/json',
 };

 if (accessToken) {
 headers.Authorization = `Bearer ${accessToken}`;
 }

 try {
 const response = await fetch('/.netlify/functions/create-checkout-session', {
 method: 'POST',
 headers,
 body: JSON.stringify({}),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.error?.message || 'Failed to create checkout session');
 }

 return await response.json() as CheckoutSessionResponse;
 } catch (error) {
 console.error('Error creating checkout session:', error);
 throw error;
 }
}

export async function redirectToCheckout(accessToken?: string): Promise<void> {
 try {
 const { url } = await createCheckoutSession(accessToken);
 window.location.href = assertAllowedCheckoutRedirectUrl(url);
 } catch (error) {
 console.error('Failed to redirect to checkout:', error);
 throw error;
 }
}

export function isStripeConfigured(): boolean {
 return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}

export type CheckoutStatus = 'active' | 'pending' | 'open' | 'failed' | 'expired' | 'refunded' | 'disputed' | 'lost';
const checkoutStatuses = new Set<CheckoutStatus>(['active', 'pending', 'open', 'failed', 'expired', 'refunded', 'disputed', 'lost']);
export async function getCheckoutStatus(accessToken: string, sessionId: string, signal?: AbortSignal): Promise<CheckoutStatus> {
 const response = await fetch(`/.netlify/functions/checkout-status?session_id=${encodeURIComponent(sessionId)}`, {
  headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal,
 });
 if (!response.ok) throw new Error('Unable to confirm checkout');
 const data = await response.json();
 if (!checkoutStatuses.has(data.status)) throw new Error('Invalid checkout status');
 return data.status as CheckoutStatus;
}

export function pendingCheckout(userId: string, value?: string | null): string | null {
 try {
  const key = `premium-checkout:${userId}`;
  if (value === null) sessionStorage.removeItem(key);
  else if (value !== undefined) sessionStorage.setItem(key, value);
  return sessionStorage.getItem(key);
 } catch { return null; }
}
