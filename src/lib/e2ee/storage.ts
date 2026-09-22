/** Sensitive legacy caches are memory-only for encrypted accounts. */
const memory = new Map<string, string>();
const protectedUsers = new Set<string>();
export const modeKey = (userId: string) => `subscription-e2ee:${userId}`;
const sensitivePrefixes = ['subscription-tracker-data', 'subscription-tracker-pending-sync-operations', 'subscription_categories_v2', 'subscription_categories_pending_sync', 'notification_settings'];
const protectedKey = (key: string): boolean => {
  const match = key.match(/:user:(.+)$/);
  return Boolean(match && sensitivePrefixes.some(prefix => key.startsWith(`${prefix}:user:`)) &&
    (protectedUsers.has(match[1]) || localStorage.getItem(modeKey(match[1])) === 'enabled'));
};
export function protectLocalAccount(userId: string): void {
  protectedUsers.add(userId);
  // Mark first: other updated tabs must not write plaintext while clearing caches.
  localStorage.setItem(modeKey(userId), 'enabled');
  for (const prefix of sensitivePrefixes) localStorage.removeItem(`${prefix}:user:${userId}`);
  const owner = localStorage.getItem('subscription-tracker-local-owner');
  if (owner && JSON.parse(owner).userId === userId) {
    for (const prefix of sensitivePrefixes) localStorage.removeItem(prefix);
    localStorage.removeItem('subscription_custom_categories');
    localStorage.removeItem('subscription-tracker-local-owner');
  }
}
export const clearVaultMemory = () => memory.clear();
export const privateStorage = {
  getItem(key: string): string | null { return protectedKey(key) ? memory.get(key) ?? null : localStorage.getItem(key); },
  setItem(key: string, value: string): void {
    if (protectedKey(key)) { localStorage.removeItem(key); memory.set(key, value); }
    else localStorage.setItem(key, value);
  },
  removeItem(key: string): void { memory.delete(key); localStorage.removeItem(key); },
};
