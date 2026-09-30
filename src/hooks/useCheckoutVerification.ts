import { useEffect, useRef, useState } from 'react';
import { getCheckoutStatus, type CheckoutStatus } from '../services/payment';
import { startCheckoutPolling } from '../utils/checkoutPolling';

export function useCheckoutVerification(
 isOpen: boolean, sessionId: string | null, accessToken: string | undefined,
 refreshProfile: () => Promise<void>,
) {
 const [attempt, setAttempt] = useState(0);
 const [status, setStatus] = useState<CheckoutStatus | null>(null);
 const [checking, setChecking] = useState(false);
 const [timedOut, setTimedOut] = useState(false);
 const [error, setError] = useState(false);
 const refreshRef = useRef(refreshProfile);
 refreshRef.current = refreshProfile;
 useEffect(() => {
  setStatus(null); setError(false); setTimedOut(false); setChecking(false);
  if (!isOpen || !sessionId || !accessToken) return;
  setChecking(true);
  let cancelled = false;
  const stop = startCheckoutPolling({
   check: signal => getCheckoutStatus(accessToken, sessionId, signal),
   onStatus: next => {
    setStatus(next); setError(false);
    if (next !== 'pending') {
     setChecking(false);
     void refreshRef.current().catch(() => { if (!cancelled) setError(true); });
    }
   },
   onError: () => setError(true),
   onTimeout: () => { setChecking(false); setTimedOut(true); },
  });
  return () => { cancelled = true; stop(); };
 }, [isOpen, sessionId, accessToken, attempt]);
 return { status, checking, timedOut, error, retry: () => setAttempt(value => value + 1) };
}
