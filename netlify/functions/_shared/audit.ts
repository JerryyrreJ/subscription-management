import type { SupabaseClient } from '@supabase/supabase-js';
import { logEvent } from './logging';

export type AuditAction =
  | 'subscription.create'
  | 'subscription.update'
  | 'subscription.delete';

export interface AuditEntry {
  userId: string;
  apiKeyId: string | null;
  action: AuditAction;
  subscriptionId?: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
}

// Audit writes are best-effort: a logging failure must never turn a successful
// subscription mutation into an error the agent sees. We record what we can and
// downgrade any failure to a warning.
export const recordAudit = async (
  database: SupabaseClient,
  entry: AuditEntry,
  now: Date
): Promise<void> => {
  try {
    const { error } = await database.from('api_audit_log').insert({
      user_id: entry.userId,
      api_key_id: entry.apiKeyId,
      action: entry.action,
      subscription_id: entry.subscriptionId ?? null,
      request_id: entry.requestId,
      metadata: entry.metadata ?? {},
      created_at: now.toISOString(),
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    logEvent('warn', 'Failed to record API audit entry', entry.requestId, {
      action: entry.action,
      subscriptionId: entry.subscriptionId ?? undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
