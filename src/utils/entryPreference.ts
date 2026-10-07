export const ENTRY_COOKIE_NAME = 'steadyrenew_entry';
export const ENTRY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
export const WEBSITE_PATH = '/about';

/** A navigation preference only. Never use this cookie to authorize a request. */
export function prefersApplication(cookieHeader: string): boolean {
  return cookieHeader.split(';').some(cookie => cookie.trim() === `${ENTRY_COOKIE_NAME}=app`);
}

export function applicationEntryCookie(protocol: string): string {
  return `${ENTRY_COOKIE_NAME}=app; Path=/; Max-Age=${ENTRY_COOKIE_MAX_AGE}; SameSite=Lax${protocol === 'https:' ? '; Secure' : ''}`;
}

type ReadStorage = (key: string) => string | null;

/** Bridge existing users on their first visit after this preference is introduced. */
export function hasPreviousApplicationUsage(
  readLocal: ReadStorage,
  readSession: ReadStorage,
  supabaseUrl?: string,
): boolean {
  const exists = (read: ReadStorage, key: string): boolean => {
    try { return Boolean(read(key)); } catch { return false; }
  };
  if (
    exists(readLocal, 'subscription-tracker-data') ||
    exists(readLocal, 'subscription-tracker-last-local-owner')
  ) return true;

  if (!supabaseUrl) return false;
  try {
    // Supabase's default key. Check presence only; never copy session data into cookies.
    const project = new URL(supabaseUrl).hostname.split('.')[0];
    const key = `sb-${project}-auth-token`;
    return exists(readLocal, key) || exists(readSession, key);
  } catch { return false; }
}
