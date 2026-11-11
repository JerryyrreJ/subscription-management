export const publicPages = {
  '/': { locale: 'en', kind: 'home', canonicalPath: '/' },
  '/about': { locale: 'en', kind: 'home', canonicalPath: '/' },
  '/zh': { locale: 'zh-CN', kind: 'home', canonicalPath: '/zh/' },
  '/pricing': { locale: 'en', kind: 'pricing', canonicalPath: '/pricing/' },
  '/zh/pricing': { locale: 'zh-CN', kind: 'pricing', canonicalPath: '/zh/pricing/' },
  '/privacy': { locale: 'en', kind: 'privacy', canonicalPath: '/privacy' },
  '/terms': { locale: 'en', kind: 'terms', canonicalPath: '/terms' },
  '/zh/privacy': { locale: 'zh-CN', kind: 'privacy', canonicalPath: '/zh/privacy' },
  '/zh/terms': { locale: 'zh-CN', kind: 'terms', canonicalPath: '/zh/terms' },
} as const;

export function getPublicPage(path: string) {
  return publicPages[(path.replace(/\/$/, '') || '/') as keyof typeof publicPages];
}
