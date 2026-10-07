export const MARKETING_ORIGIN = 'https://steadyrenew.com';
export const APPLICATION_ORIGIN = MARKETING_ORIGIN;
export const APPLICATION_URL = `${APPLICATION_ORIGIN}/app`;
export const DOCUMENTATION_ORIGIN = 'https://docs.steadyrenew.com';
export const LEGACY_APPLICATION_ORIGINS = ['https://sub.jerrylu.xyz', 'https://sub.jerrylu.app'];

export function isLegacyApplicationOrigin(origin: string): boolean {
  return LEGACY_APPLICATION_ORIGINS.includes(origin);
}

/** Preview deployments keep their own blog links; official app hosts use the main site. */
export function marketingUrl(path: string, currentOrigin: string): string {
  const origin = currentOrigin === APPLICATION_ORIGIN || isLegacyApplicationOrigin(currentOrigin)
    ? MARKETING_ORIGIN : currentOrigin;
  return new URL(path, origin).toString();
}

export function documentationUrl(path: string, locale: string, docsOrigin = DOCUMENTATION_ORIGIN): string {
  return new URL(`/${locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'}/${path.replace(/^\/+/, '')}`, docsOrigin).toString();
}
