import type { CheckoutStatus } from '../services/payment';

interface CheckoutPollingOptions {
 check(signal: AbortSignal): Promise<CheckoutStatus>;
 onStatus(status: CheckoutStatus): void;
 onError(): void;
 onTimeout(): void;
}

// Sequential polling with an overall deadline. Cleanup prevents late responses
// from updating a closed dialog or a different signed-in account.
export function startCheckoutPolling({ check, onStatus, onError, onTimeout }: CheckoutPollingOptions): () => void {
 let stopped = false;
 let pollTimer: ReturnType<typeof setTimeout> | undefined;
 let requestTimer: ReturnType<typeof setTimeout> | undefined;
 let controller: AbortController | undefined;
 const stop = () => {
  stopped = true; controller?.abort(); clearTimeout(deadline); clearTimeout(pollTimer); clearTimeout(requestTimer);
 };
 const deadline = setTimeout(() => { stop(); onTimeout(); }, 60_000);
 const poll = async () => {
  controller = new AbortController();
  requestTimer = setTimeout(() => controller?.abort(), 10_000);
  try {
   const next = await check(controller.signal);
   if (stopped) return;
   onStatus(next);
   if (next !== 'pending') { stop(); return; }
  } catch {
   if (stopped) return;
   onError();
  } finally { clearTimeout(requestTimer); }
  if (!stopped) pollTimer = setTimeout(() => { void poll(); }, 3000);
 };
 void poll();
 return stop;
}
