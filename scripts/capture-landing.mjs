// Run with the local Vite server: node scripts/capture-landing.mjs
// Screenshots use the real /app route in isolated browser contexts, with demo records only.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const origin = process.env.CAPTURE_ORIGIN || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
try {
  for (const locale of ['en', 'zh-CN']) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, locale, timezoneId: 'Asia/Shanghai' });
      await page.clock.setFixedTime(new Date('2026-10-08T04:00:00Z'));
      await page.addInitScript(({ locale, theme }) => {
        localStorage.setItem('app_locale', locale);
        localStorage.setItem('theme', theme);
        localStorage.setItem('subscription-tracker-data', JSON.stringify([
          { name: 'Netflix', amount: 15.49, category: 'Entertainment' },
          { name: 'Spotify', amount: 10.99, category: 'Music' },
          { name: 'iCloud+', amount: 2.99, category: 'Software' },
          { name: 'Notion', amount: 10, category: 'Productivity' },
        ].map((record, index) => ({
          ...record,
          id: `sample-${index}`,
          currency: 'USD',
          period: 'monthly',
          lastPaymentDate: `2026-10-${['01', '08', '12', '21'][index]}`,
          nextPaymentDate: `2026-11-${['01', '08', '12', '21'][index]}`,
          status: 'active',
        }))));
      }, { locale, theme });
      await page.goto(`${origin}/app`);
      await page.getByRole('button', { name: /CNY/ }).click();
      await page.getByRole('option', { name: /USD/ }).click();
      // Wait for the real dashboard's number animation to finish.
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: fileURLToPath(new URL(`../public/product-${locale}-${theme}.jpg`, import.meta.url)),
        type: 'jpeg', quality: 90,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
