import { supabase } from '../supabase';
import type { Subscription } from '../../types';
import type { Category } from '../../utils/categories';
import { decryptVault, encryptVault, importRecoveryKey, type Envelope } from './crypto';
import { clearVaultMemory, protectLocalAccount, privateStorage } from './storage';

export interface VaultData { version: 1; subscriptions: Subscription[]; categories: Category[] }
export interface VaultRow { user_id: string; envelope: Envelope; revision: number }
interface Session { userId: string; key: CryptoKey; data: VaultData; revision: number }
let session: Session | null = null;
let protectedUser: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
export const vaultEnabled = () => protectedUser !== null;
export const vaultUnlocked = (userId: string) => session?.userId === userId;
export function lockVault(): void { session = null; clearVaultMemory(); }
export function setVaultAccount(userId: string | null): void {
  lockVault();
  protectedUser = userId;
  if (userId) protectLocalAccount(userId);
}
function parseData(value: unknown): VaultData {
  const data = value as VaultData;
  if (!data || data.version !== 1 || !Array.isArray(data.subscriptions) || !Array.isArray(data.categories)) throw new Error('Invalid vault data');
  if (data.subscriptions.some(s => !s || typeof s.id !== 'string' || typeof s.name !== 'string') ||
      new Set(data.subscriptions.map(s => s.id)).size !== data.subscriptions.length) throw new Error('Invalid subscriptions');
  return data;
}
export async function fetchVault(userId: string): Promise<VaultRow | null> {
  if (!supabase) throw new Error('Cloud sync unavailable');
  const { data, error } = await supabase.from('encrypted_vaults').select('user_id,envelope,revision').eq('user_id', userId).maybeSingle();
  if (error) throw error; // Never downgrade to plaintext on an outage or missing migration.
  return data as VaultRow | null;
}
function cache(data: VaultData, userId: string) {
  privateStorage.setItem(`subscription-tracker-data:user:${userId}`, JSON.stringify(data.subscriptions));
  privateStorage.setItem(`subscription_categories_v2:user:${userId}`, JSON.stringify(data.categories));
}
export async function unlockVault(userId: string, secret: string): Promise<void> {
  const key = await importRecoveryKey(secret);
  const row = await fetchVault(userId);
  if (!row) throw new Error('Vault unavailable');
  const data = parseData(await decryptVault(key, userId, row.envelope));
  if (protectedUser !== userId) throw new Error('Account changed');
  session = { userId, key, data, revision: row.revision };
  cache(data, userId);
}
function requireSession(): Session {
  if (!session || session.userId !== protectedUser) throw new Error('Unlock your encrypted vault first');
  return session;
}
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}
export async function readVault(): Promise<VaultData> {
  const expected = requireSession();
  return serial(async () => {
    if (session !== expected) throw new Error('Vault locked');
    const row = await fetchVault(expected.userId);
    if (!row) throw new Error('Vault unavailable');
    const data = parseData(await decryptVault(expected.key, expected.userId, row.envelope));
    if (session !== expected) throw new Error('Vault locked');
    expected.data = data; expected.revision = row.revision;
    cache(data, expected.userId);
    return structuredClone(data);
  });
}
export async function mutateVault<T>(mutate: (data: VaultData) => T): Promise<T> {
  const expected = requireSession();
  return serial(async () => {
    if (session !== expected || !supabase) throw new Error('Vault locked');
    const next = structuredClone(expected.data);
    const result = mutate(next);
    const envelope = await encryptVault(expected.key, expected.userId, next);
    if (session !== expected) throw new Error('Vault locked');
    const { data, error } = await supabase.rpc('save_encrypted_vault', { p_expected_revision: expected.revision, p_envelope: envelope });
    if (error) throw error; // Conflicts never silently overwrite another device.
    if (session !== expected) throw new Error('Vault locked');
    expected.data = next; expected.revision = Number(data);
    cache(next, expected.userId);
    return result;
  });
}
export const vaultSubscriptions = {
  async create(subscription: Subscription | Omit<Subscription, 'id'>) {
    return mutateVault(data => {
      const next = { ...subscription, id: 'id' in subscription ? subscription.id : crypto.randomUUID() };
      if (data.subscriptions.some(s => s.id === next.id)) throw new Error('Subscription already exists');
      data.subscriptions.push(next); return next;
    });
  },
  async update(subscription: Subscription) {
    return mutateVault(data => {
      const index = data.subscriptions.findIndex(s => s.id === subscription.id);
      if (index < 0) throw new Error('Subscription no longer exists');
      data.subscriptions[index] = subscription; return subscription;
    });
  },
  async remove(id: string) { await mutateVault(data => { data.subscriptions = data.subscriptions.filter(s => s.id !== id); }); },
};
export const vaultCategories = {
  async put(category: Category) {
    return mutateVault(data => { data.categories = [...data.categories.filter(c => c.id !== category.id), category]; return category; });
  },
  async remove(id: string) { await mutateVault(data => { data.categories = data.categories.filter(c => c.id !== id); }); },
  async order(categories: Category[]) {
    await mutateVault(data => { data.categories = data.categories.map(c => ({ ...c, order: categories.find(next => next.id === c.id)?.order ?? c.order })); });
  },
};

/** Detect enablement on another device before using a legacy plaintext path. */
export async function requirePlaintextClient(userId: string): Promise<void> {
  const row = await fetchVault(userId);
  if (row) {
    setVaultAccount(userId);
    window.dispatchEvent(new Event('e2ee-changed'));
    throw new Error('Encryption enabled on another device. Unlock your vault.');
  }
}
export function handlePlaintextRejection(error: unknown, userId: string): void {
  if (error && typeof error === 'object' && 'message' in error && String(error.message).includes('E2EE enabled')) {
    setVaultAccount(userId);
    window.dispatchEvent(new Event('e2ee-changed'));
  }
}
