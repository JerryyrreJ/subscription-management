// npm run dev, then CAPTURE_ORIGIN=http://127.0.0.1:5173 node scripts/capture-docs.mjs
// Records the current app with synthetic local-only data; no account or AI calls.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.CAPTURE_ORIGIN || 'http://127.0.0.1:5173';
const output = fileURLToPath(new URL('../docs-site/images/product/', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'steadyrenew-demo-'));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
 const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'en', timezoneId: 'Asia/Hong_Kong',
  recordVideo: { dir: temporary, size: { width: 1440, height: 900 } },
 });
 const page = await context.newPage();
 await page.clock.setFixedTime(new Date('2026-10-08T04:00:00Z'));
 await page.addInitScript(() => {
  localStorage.setItem('app_locale', 'en');
  localStorage.setItem('theme', 'light');
  localStorage.setItem('subscription-tracker-data', JSON.stringify([
   { name: 'Netflix', amount: 15.49, category: 'Entertainment' },
   { name: 'Spotify', amount: 10.99, category: 'Music' },
   { name: 'iCloud+', amount: 2.99, category: 'Software' },
   { name: 'Notion', amount: 10, category: 'Productivity' },
  ].map((record, index) => ({
   ...record, id: `demo-${index}`, currency: 'USD', period: 'monthly',
   lastPaymentDate: '2026-10-01', nextPaymentDate: '2026-11-01',
   createdAt: '2026-01-01T00:00:00Z', status: 'active',
  }))));
 });
 await page.goto(`${origin}/app`);
 await page.getByRole('button', { name: /CNY/ }).click();
 await page.getByRole('option', { name: /USD/ }).click();
 await page.waitForTimeout(2500);
 await page.screenshot({ path: join(output, 'dashboard-overview.png') });
 await page.waitForTimeout(1500);
 await page.getByRole('button', { name: 'Yearly', exact: true }).click();
 await page.waitForTimeout(2500);
 await page.getByRole('button', { name: 'Monthly', exact: true }).click();
 await page.waitForTimeout(2500);
 const video = page.video();
 await context.close();
 execFileSync('ffmpeg', ['-y', '-i', await video.path(), '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(output, 'dashboard-tour.mp4')], { stdio: 'pipe' });
} finally {
 await browser.close();
 rmSync(temporary, { recursive: true, force: true });
}
