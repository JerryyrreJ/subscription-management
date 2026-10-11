import { FREE_PRICE_USD, PREMIUM_PRICE_USD } from './pricingFacts.ts';
import { MARKETING_ORIGIN } from './siteUrls.ts';

export const STEADYRENEW_SAME_AS = 'https://github.com/JerryyrreJ/subscription-management';

export function marketingStructuredData(options: { description: string; inLanguage: string }) {
  const url = `${MARKETING_ORIGIN}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'SteadyRenew',
        url,
        sameAs: STEADYRENEW_SAME_AS,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'SteadyRenew',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url,
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
    ],
  };
}

export function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
