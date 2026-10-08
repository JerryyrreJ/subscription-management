export const publicPages = {
  '/': { locale: 'en', kind: 'home', canonicalPath: '/' },
  '/about': { locale: 'en', kind: 'home', canonicalPath: '/' },
  '/zh': { locale: 'zh-CN', kind: 'home', canonicalPath: '/zh' },
  '/pricing': { locale: 'en', kind: 'pricing', canonicalPath: '/pricing' },
  '/zh/pricing': { locale: 'zh-CN', kind: 'pricing', canonicalPath: '/zh/pricing' },
} as const;

export function getPublicPage(path: string) {
  return publicPages[(path.replace(/\/$/, '') || '/') as keyof typeof publicPages];
}
