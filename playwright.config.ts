import { defineConfig } from '@playwright/test';

export default defineConfig({
 testDir: './tests/e2e',
 workers: 1,
 retries: 0,
 timeout: 180_000,
 expect: { timeout: 20_000 },
 reporter: 'list',
 use: {
  browserName: 'chromium',
  locale: 'en-US',
  actionTimeout: 30_000,
  navigationTimeout: 45_000,
  screenshot: 'only-on-failure',
  // Auth requests contain credentials. Do not persist network traces or videos.
  trace: 'off',
  video: 'off',
 },
});
