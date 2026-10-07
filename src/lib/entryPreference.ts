import { applicationEntryCookie, hasPreviousApplicationUsage, prefersApplication } from '../utils/entryPreference';

export function shouldOpenApplication(): boolean {
  try {
    if (prefersApplication(document.cookie)) return true;
  } catch { /* Storage restrictions must not prevent either page from opening. */ }
  return hasPreviousApplicationUsage(
    key => window.localStorage.getItem(key),
    key => window.sessionStorage.getItem(key),
    import.meta.env.VITE_SUPABASE_URL,
  );
}

export function rememberApplicationEntry(): void {
  try {
    document.cookie = applicationEntryCookie(window.location.protocol);
  } catch { /* The app still works when cookies are unavailable. */ }
}
