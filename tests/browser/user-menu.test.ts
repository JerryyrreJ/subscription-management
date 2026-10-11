import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium, webkit, type Browser } from '@playwright/test';

let bundle: string;
const browsers: Browser[] = [];
before(async () => {
  const result = await build({
    configFile: false, logLevel: 'silent',
    esbuild: { jsx: 'automatic' },
    define: { 'process.env.NODE_ENV': '"development"' },
    build: {
      lib: { entry: fileURLToPath(new URL('./user-menu-harness.tsx', import.meta.url)), name: 'UserMenuRegression', formats: ['iife'] },
      write: false, minify: false,
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  bundle = outputs.flatMap(output => 'output' in output ? output.output : [])
    .filter(output => output.type === 'chunk').map(output => output.code).join('\n');
});
after(async () => { await Promise.all(browsers.map(browser => browser.close())); });

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: touch actions survive null-target blur; dismissal and keyboard navigation still work`, async () => {
    const browser = await engine.launch();
    browsers.push(browser);
    const page = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 844 } });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle });
    const trigger = page.locator('[aria-haspopup="menu"]');
    for (const [index, name] of ['login', 'settings', 'premium'].entries()) {
      await trigger.tap();
      const item = page.getByRole('menuitem').nth(index);
      // Reproduce the problematic ordering deterministically, independently of
      // the host browser's tap-to-focus policy: pointerdown -> blur -> click.
      await item.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true });
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      assert.equal(await page.getByRole('menu').count(), 1);
      assert.equal(await page.locator('#result').textContent(), ['login', 'settings', 'premium'].slice(0, index).map(x => `${x},`).join(''));
      await item.tap();
      assert.equal(await page.getByRole('menu').count(), 0);
      assert.ok((await page.locator('#result').textContent())?.endsWith(`${name},`));
    }
    assert.equal(await page.locator('#result').textContent(), 'login,settings,premium,');
    await trigger.tap();
    await page.locator('#blank').tap();
    assert.equal(await page.getByRole('menu').count(), 0);
    await trigger.tap();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('menuitem').nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await trigger.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
    assert.equal(await page.locator('#outside').evaluate(el => el === document.activeElement), true);
    await page.close();
  });
}
