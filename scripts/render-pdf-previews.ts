/**
 * 用与浏览器导出相同的 HTML/CSS 打印路径，重渲 README 里的 A4 预览图。
 *
 * 需要本机 Chrome 与 pdftoppm（poppler-utils）：
 *   npx tsx --tsconfig tsconfig.app.json scripts/render-pdf-previews.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { resources } from '../src/i18n/resources.ts';
import type { Subscription } from '../src/types.ts';
import { generateReportData } from '../src/utils/reportAnalytics.ts';
import { buildPdfReportData } from '../src/utils/pdfReportData.ts';
import { PdfReportDocument } from '../src/components/pdf/PdfReportDocument.tsx';

const workspace = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(workspace, 'docs-site/images/product');
const NOW = '2026-07-26T12:00:00.000Z';
const EXCHANGE_RATES = { CNY: 1, USD: 0.147 };
const EXCHANGE_RATES_UPDATED_AT = new Date('2026-07-26T12:00:00.000Z').getTime();

const withMockedNow = <T>(isoDateTime: string, run: () => T): T => {
 const RealDate = Date;

 class MockDate extends RealDate {
  constructor(...args: [] | [string | number | Date] | [number, number, number]) {
   if (args.length === 0) {
    super(isoDateTime);
   } else if (args.length === 1) {
    super(args[0]);
   } else {
    super(args[0], args[1], args[2]);
   }
  }

  static now() {
   return new RealDate(isoDateTime).getTime();
  }
 }

 MockDate.parse = RealDate.parse;
 MockDate.UTC = RealDate.UTC;
 globalThis.Date = MockDate as unknown as DateConstructor;

 try {
  return run();
 } finally {
  globalThis.Date = RealDate;
 }
};

const sub = (overrides: Partial<Subscription> & Pick<Subscription, 'id' | 'name'>): Subscription => ({
 id: overrides.id,
 name: overrides.name,
 category: overrides.category || 'Other',
 amount: overrides.amount ?? 0,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-06-26',
 nextPaymentDate: overrides.nextPaymentDate || '2026-08-26',
 createdAt: overrides.createdAt || '2025-01-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-06-26T00:00:00.000Z',
 notificationEnabled: true,
});

const subscriptions: Subscription[] = [
 sub({ id: 'supabase', name: 'Supabase Pro', category: 'Cloud Services', amount: 25, nextPaymentDate: '2026-08-20', createdAt: '2025-08-01T00:00:00.000Z' }),
 sub({ id: 'cursor', name: 'Cursor Pro', category: 'AI Tools', amount: 20, nextPaymentDate: '2026-08-15', createdAt: '2026-07-01T00:00:00.000Z' }),
 sub({ id: 'perplexity', name: 'Perplexity Pro', category: 'AI Tools', amount: 20, nextPaymentDate: '2026-08-22', createdAt: '2026-02-01T00:00:00.000Z' }),
 sub({ id: 'claude', name: 'Claude Pro', category: 'AI Tools', amount: 20, nextPaymentDate: '2026-08-14', createdAt: '2026-01-01T00:00:00.000Z' }),
 sub({ id: 'vercel', name: 'Vercel Pro', category: 'Cloud Services', amount: 20, nextPaymentDate: '2026-08-12', createdAt: '2025-11-01T00:00:00.000Z' }),
 sub({ id: 'chatgpt', name: 'ChatGPT Plus', category: 'AI Tools', amount: 20, nextPaymentDate: '2026-08-10', createdAt: '2025-10-01T00:00:00.000Z' }),
 sub({ id: 'netlify', name: 'Netlify Pro', category: 'Cloud Services', amount: 19, nextPaymentDate: '2026-07-26', createdAt: '2025-09-01T00:00:00.000Z' }),
 sub({ id: 'jetbrains', name: 'JetBrains All Products', category: 'Developer Tools', amount: 173, period: 'yearly', nextPaymentDate: '2027-03-01', lastPaymentDate: '2026-03-01', createdAt: '2025-08-15T00:00:00.000Z' }),
 sub({ id: 'youtube', name: 'YouTube Premium', category: 'Entertainment', amount: 13.99, nextPaymentDate: '2026-08-19', createdAt: '2025-08-01T00:00:00.000Z' }),
 sub({ id: 'spotify', name: 'Spotify Premium', category: 'Entertainment', amount: 11.99, nextPaymentDate: '2026-08-09', createdAt: '2025-08-01T00:00:00.000Z' }),
 sub({ id: 'copilot', name: 'GitHub Copilot', category: 'Developer Tools', amount: 10, nextPaymentDate: '2026-08-05', createdAt: '2026-01-15T00:00:00.000Z' }),
 sub({ id: 'setapp', name: 'Setapp', category: 'Productivity', amount: 9.99, nextPaymentDate: '2026-08-18', createdAt: '2025-12-01T00:00:00.000Z' }),
 sub({ id: 'notion', name: 'Notion Plus', category: 'Productivity', amount: 96, period: 'yearly', nextPaymentDate: '2027-01-15', lastPaymentDate: '2026-01-15', createdAt: '2025-08-01T00:00:00.000Z' }),
 sub({ id: 'bilibili', name: 'Bilibili Premium', category: 'Entertainment', amount: 25, currency: 'CNY', nextPaymentDate: '2026-08-16', createdAt: '2026-03-01T00:00:00.000Z' }),
 sub({ id: 'icloud', name: 'iCloud+ 200GB', category: 'Personal', amount: 21, currency: 'CNY', nextPaymentDate: '2026-08-08', createdAt: '2025-08-01T00:00:00.000Z' }),
];

await i18n.use(initReactI18next).init({
 resources,
 lng: 'en',
 fallbackLng: 'en',
 ns: Object.keys(resources.en),
 defaultNS: 'common',
 interpolation: { escapeValue: false },
 react: { useSuspense: false },
});

const t = i18n.t.bind(i18n) as unknown as TFunction;
const css = readFileSync(join(workspace, 'src/styles/print-report.css'), 'utf8');
const tmp = '/tmp/pdf-report-previews';
mkdirSync(tmp, { recursive: true });

const renderVariant = (variant: 'snapshot' | 'annual') =>
 withMockedNow(NOW, () => {
  const reportData = generateReportData(subscriptions, 'CNY', EXCHANGE_RATES, t, 'en');
  const data = buildPdfReportData({
   subscriptions,
   reportData,
   baseCurrency: 'CNY',
   exchangeRates: EXCHANGE_RATES,
   exchangeRatesUpdatedAt: EXCHANGE_RATES_UPDATED_AT,
   t,
   locale: 'en',
   timeZone: 'UTC',
  });

  const markup = renderToStaticMarkup(
   createElement(I18nextProvider, { i18n }, createElement(PdfReportDocument, { data, variant }))
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${variant} report</title>
<style>${css}</style>
</head>
<body>${markup}</body>
</html>`;
 });

const chrome = '/usr/bin/google-chrome';
const printPdf = (htmlPath: string, pdfPath: string) => {
 execFileSync(
  chrome,
  [
   '--headless=new',
   '--disable-gpu',
   '--no-pdf-header-footer',
   '--no-first-run',
   '--no-default-browser-check',
   '--virtual-time-budget=8000',
   `--print-to-pdf=${pdfPath}`,
   htmlPath,
  ],
  { stdio: 'inherit' }
 );
};

const rasterPage1 = (pdfPath: string, pngPath: string) => {
 try {
  execFileSync('pdftoppm', ['-png', '-r', '192', '-f', '1', '-l', '1', '-singlefile', pdfPath, pngPath.replace(/\.png$/, '')], {
   stdio: 'inherit',
  });
  return;
 } catch {
  execFileSync(
   'gs',
   [
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=png16m',
    '-r192',
    '-dFirstPage=1',
    '-dLastPage=1',
    `-sOutputFile=${pngPath}`,
    pdfPath,
   ],
   { stdio: 'inherit' }
  );
 }
};

for (const variant of ['snapshot', 'annual'] as const) {
 const html = renderVariant(variant);
 const htmlPath = join(tmp, `${variant}.html`);
 const pdfPath = join(tmp, `${variant}.pdf`);
 const pngPath = join(outDir, `pdf-report-${variant}.png`);
 writeFileSync(htmlPath, html);
 printPdf(htmlPath, pdfPath);
 execFileSync('pdfinfo', [pdfPath], { stdio: 'inherit' });
 rasterPage1(pdfPath, pngPath);
 console.log(`wrote ${pngPath}`);
}
