export interface CheckoutSessionResponse {
 url: string;
 sessionId: string;
 requestId?: string;
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
 window.location.href = url;
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
