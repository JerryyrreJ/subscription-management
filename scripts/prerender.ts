import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { publicPages } from '../src/utils/publicPages.ts';
import { landingCopy } from '../src/components/landing/copy.ts';

const root = process.cwd();
const out = path.join(root, 'dist');
const template = await readFile(path.join(out, 'index.html'), 'utf8');
const origin = template.match(/rel="canonical" href="([^"]+)"/)![1].replace(/\/$/, '');
const assets = await readdir(path.join(out, 'assets'));
const css = assets.filter(file => /^LandingPage-.*\.css$/.test(file));
if (css.length !== 1) throw new Error('Expected one landing page stylesheet');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function head(html: string, title: string, description: string, canonical: string, locale: string, index: boolean) {
  return html.replace('<html lang="en">', `<html lang="${locale}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g, `$1${escape(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escape(title)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${canonical}`)
    .replace('</head>', `<meta name="robots" content="${index ? 'index, follow' : 'noindex, follow'}" />\n</head>`);
}

// Unknown SPA paths use this shell too, never the indexable marketing document.
await mkdir(path.join(out, 'app'), { recursive: true });
await writeFile(path.join(out, 'app/index.html'), head(template, 'SteadyRenew', 'Manage your subscriptions.', `${origin}/app`, 'en', false));

// Render the actual shared React component, not a separately maintained SEO copy.
const server = await createServer({ configFile: false, root, mode: 'production', plugins: [react()], server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: i18n } = await server.ssrLoadModule('/src/i18n/index.ts');
  const { default: LandingPage } = await server.ssrLoadModule('/src/components/landing/LandingPage.tsx');
  for (const [route, page] of Object.entries(publicPages)) {
    await i18n.changeLanguage(page.locale);
    const copy = landingCopy[page.locale];
    const pricing = page.kind === 'pricing';
    const html = renderToString(createElement(LandingPage, { pricingOnly: pricing }));
    const en = pricing ? '/pricing' : '/';
    const zh = pricing ? '/zh/pricing' : '/zh';
    const alternates = `<link rel="alternate" hreflang="en" href="${origin}${en}" />\n<link rel="alternate" hreflang="zh-CN" href="${origin}${zh}" />\n<link rel="alternate" hreflang="x-default" href="${origin}${en}" />`;
    const result = head(template, pricing ? `${copy.pricing} — SteadyRenew` : copy.title, pricing ? copy.priceIntro : copy.description, origin + page.canonicalPath, page.locale, true)
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
      .replace('</head>', `${alternates}\n<link rel="stylesheet" href="/assets/${css[0]}" />\n</head>`);
    const destination = path.join(out, route, 'index.html');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, result);
    console.log(`Prerendered ${route}`);
  }
} finally {
  await server.close();
}
