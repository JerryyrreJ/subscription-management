import { useEffect, useState } from 'react';
import {
  E2EE_STATE_CHANGED_EVENT,
  getVaultSnapshot,
  type VaultStateSnapshot,
} from '../lib/e2ee/vaultSession';

export function useVaultState(): VaultStateSnapshot {
  const [snapshot, setSnapshot] = useState<VaultStateSnapshot>(() => getVaultSnapshot());

  useEffect(() => {
    const sync = () => {
      setSnapshot(getVaultSnapshot());
    };
    sync();
    window.addEventListener(E2EE_STATE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(E2EE_STATE_CHANGED_EVENT, sync);
    };
  }, []);

  return snapshot;
}
