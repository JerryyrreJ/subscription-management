import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

// A new login lifetime gets a new identity, including A -> B -> A transitions.
export function useAccountTaskGuard(userId: string | undefined) {
 const account = useMemo(() => ({ userId, active: true }), [userId]);
 const currentAccount = useRef(account);

 useLayoutEffect(() => {
  currentAccount.current = account;
  account.active = true;
  return () => { account.active = false; };
 }, [account]);

 return useCallback(() => account.active && currentAccount.current === account, [account]);
}
