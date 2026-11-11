import { FREE_PRICE_USD, PREMIUM_PRICE_USD } from './pricingFacts.ts';
import { MARKETING_ORIGIN } from './siteUrls.ts';

export const STEADYRENEW_SAME_AS = 'https://github.com/JerryyrreJ/subscription-management';

export function marketingStructuredData(options: {
  description: string;
  inLanguage: string;
  url?: string;
  origin?: string;
  faqs?: ReadonlyArray<ReadonlyArray<string>>;
}) {
  const siteOrigin = (options.origin ?? MARKETING_ORIGIN).replace(/\/$/, '');
  const homeUrl = `${siteOrigin}/`;
  const pageUrl = options.url ?? homeUrl;
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
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: pageUrl,
      inLanguage: options.inLanguage,
      description: options.description,
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
