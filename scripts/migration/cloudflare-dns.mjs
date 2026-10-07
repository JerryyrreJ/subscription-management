import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../../ops/steadyrenew/domains.json', import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/migration/cloudflare-dns.mjs [--apply]');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN privately with Zone:Read and DNS:Edit for steadyrenew.com.');
const request = async (path, method = 'GET', body) => {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${method} failed (${response.status}); error codes: ${(data.errors ?? []).map(error => error.code).join(',')}`);
  return data.result;
};
const zones = await request('/zones?name=steadyrenew.com&status=active');
if (zones.length !== 1 || zones[0].name !== 'steadyrenew.com') throw new Error('Expected exactly one active steadyrenew.com zone. No changes made.');
const base = `/zones/${zones[0].id}/dns_records`;
const plan = [];
for (const record of manifest.dns) {
  const existing = await request(`${base}?name=${encodeURIComponent(record.name)}&per_page=100`);
  const matches = existing.filter(item => item.type === record.type && item.content.replace(/\.$/, '') === record.content);
  const conflicts = existing.filter(item => ['A', 'AAAA', 'CNAME'].includes(item.type) && !matches.some(match => match.id === item.id));
  if (conflicts.length || matches.length > 1) throw new Error(`Conflicting address records for ${record.name}. Review manually; no records have been changed.`);
  if (matches.length && matches[0].proxied !== record.proxied) throw new Error(`${record.name} uses a different proxy mode. Review manually; no records have been changed.`);
  plan.push({ record, action: matches.length ? 'keep' : 'create' });
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', zone: zones[0].name, plan }, null, 2));
if (apply) {
  for (const { record, action } of plan) {
    if (action === 'keep') continue;
    const result = await request(base, 'POST', record);
    if (result.name !== record.name || result.content !== record.content || result.proxied !== false) throw new Error(`Unexpected DNS response for ${record.name}; inspect before continuing.`);
    console.log(JSON.stringify({ created: result.name, type: result.type, content: result.content, proxied: result.proxied }));
  }
}
