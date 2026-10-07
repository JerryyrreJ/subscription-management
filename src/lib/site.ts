import { DOCUMENTATION_ORIGIN, documentationUrl, marketingUrl } from '../utils/siteUrls';

export const getDocumentationUrl = (path: string, locale: string) =>
  documentationUrl(path, locale, import.meta.env.VITE_DOCS_URL || DOCUMENTATION_ORIGIN);

export const getMarketingUrl = (path: string) => marketingUrl(path, window.location.origin);
