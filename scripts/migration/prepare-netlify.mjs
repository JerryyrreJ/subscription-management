import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('../../ops/steadyrenew/domains.json', import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/migration/prepare-netlify.mjs [--apply]');
const call = (method, data) => JSON.parse(execFileSync('netlify', ['api', method, '--data', JSON.stringify(data)], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}));
const current = call('getSite', { site_id: manifest.netlifySiteId });
if (current.name !== manifest.netlifySiteName) throw new Error('Unexpected Netlify site; no changes made.');
const aliases = [...new Set([...(current.domain_aliases ?? []), ...manifest.netlifyAliases])];
const snapshot = site => ({
  siteId: site.id,
  name: site.name,
  primaryDomain: site.custom_domain,
  aliases: site.domain_aliases,
  publishedDeployId: site.published_deploy?.id,
});
const before = snapshot(current);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', before, proposedAliases: aliases }, null, 2));
if (apply) {
  // Add aliases only. Keep the live primary domain, environment and deployment.
  const result = aliases.length === (current.domain_aliases ?? []).length ? current
    : call('updateSite', { site_id: manifest.netlifySiteId, body: { domain_aliases: aliases } });
  const after = snapshot(call('getSite', { site_id: result.id }));
  if (after.primaryDomain !== before.primaryDomain || after.publishedDeployId !== before.publishedDeployId) {
    throw new Error('Unexpected concurrent production change; inspect the site before continuing.');
  }
  if (!manifest.netlifyAliases.every(domain => after.aliases.includes(domain))) throw new Error('Domain alias verification failed.');
  const output = fileURLToPath(new URL('../../ops/steadyrenew/netlify-preparation.json', import.meta.url));
  writeFileSync(output, JSON.stringify({ preparedAt: new Date().toISOString(), before, after }, null, 2) + '\n');
  console.log(JSON.stringify({ verified: true, after }, null, 2));
}
