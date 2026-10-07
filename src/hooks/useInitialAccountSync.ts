import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAccountTaskGuard } from './useAccountTaskGuard';

export function useInitialAccountSync(
 userId: string | undefined,
 ready: boolean,
 synchronize: (isCurrent: () => boolean) => Promise<void>
) {
 const latestSynchronize = useRef(synchronize);
 const isCurrentAccount = useAccountTaskGuard(userId);
 useLayoutEffect(() => { latestSynchronize.current = synchronize; });

 // Callback identity and refreshed access tokens must not cancel initialization.
 useEffect(() => {
  if (!userId || !ready) return;
  let cancelled = false;
  const isCurrent = () => !cancelled && isCurrentAccount();
  void latestSynchronize.current(isCurrent).catch(error => {
   console.error('Failed to perform initial sync:', error);
  });
  return () => { cancelled = true; };
 }, [userId, ready, isCurrentAccount]);
}
