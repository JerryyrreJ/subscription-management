import { FREE_PRICE_USD, PREMIUM_PRICE_USD } from './pricingFacts.ts';
import { MARKETING_ORIGIN } from './siteUrls.ts';

export const STEADYRENEW_SAME_AS = 'https://github.com/JerryyrreJ/subscription-management';
export const STEADYRENEW_AUTHOR_NAME = 'Jerry Lu';
export const STEADYRENEW_AUTHOR_URL = 'https://github.com/JerryyrreJ';

const FEATURE_LIST = {
  en: [
    'Manual subscription and free-trial tracking without bank login',
    'Multi-currency monthly and yearly spending totals',
    'Bark push reminders before renewal and trial dates',
    'AI screenshot and short-note draft capture',
    'Free JSON backup import and export',
    'Developer REST API and MCP server integration',
  ],
  'zh-CN': [
    '无需绑定银行卡的个人订阅与免费试用记录',
    '多币种月度与年度支出自动折算汇总',
    'Bark 续费与免费试用到期前推送提醒',
    '截图与一句话 AI 草稿录入',
    '免费 JSON 备份导入与导出',
    '开放 REST API 与 MCP 服务接入',
  ],
} as const;

export function marketingStructuredData(options: {
  description: string;
  inLanguage: string;
  url?: string;
  origin?: string;
  faqs?: ReadonlyArray<ReadonlyArray<string>>;
}) {
  const siteOrigin = (options.origin ?? MARKETING_ORIGIN).replace(/\/$/, '');
  const isZh = options.inLanguage === 'zh-CN';
  const homeUrl = `${siteOrigin}/`;
  const localeHomeUrl = isZh ? `${siteOrigin}/zh/` : homeUrl;
  const pageUrl = options.url ?? homeUrl;
  const screenshotUrl = `${siteOrigin}/product-${isZh ? 'zh-CN' : 'en'}-light.jpg`;
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      name: 'SteadyRenew',
      url: homeUrl,
      logo: `${siteOrigin}/icon.png`,
      sameAs: STEADYRENEW_SAME_AS,
    },
    {
      '@type': 'WebSite',
      name: 'SteadyRenew',
      url: homeUrl,
      inLanguage: options.inLanguage,
    },
    {
      '@type': 'SoftwareApplication',
      name: 'SteadyRenew',
      applicationCategory: 'FinanceApplication',
      applicationSubCategory: 'Subscription Tracker',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      url: pageUrl,
      inLanguage: options.inLanguage,
      description: options.description,
      screenshot: screenshotUrl,
      featureList: isZh ? [...FEATURE_LIST['zh-CN']] : [...FEATURE_LIST.en],
      author: {
        '@type': 'Person',
        name: STEADYRENEW_AUTHOR_NAME,
        url: STEADYRENEW_AUTHOR_URL,
      },
      offers: [
        {
          '@type': 'Offer',
          name: 'Free',
          price: FREE_PRICE_USD,
          priceCurrency: 'USD',
        },
        {
          '@type': 'Offer',
          name: 'Premium',
          price: PREMIUM_PRICE_USD,
          priceCurrency: 'USD',
        },
      ],
      sameAs: STEADYRENEW_SAME_AS,
    },
  ];

  if (pageUrl.endsWith('/pricing/')) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: isZh ? '首页' : 'Home',
          item: localeHomeUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: isZh ? '价格' : 'Pricing',
          item: pageUrl,
        },
      ],
    });
  }

  if (options.faqs?.length) {
    graph.push({
      '@type': 'FAQPage',
      url: pageUrl,
      inLanguage: options.inLanguage,
      mainEntity: options.faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
