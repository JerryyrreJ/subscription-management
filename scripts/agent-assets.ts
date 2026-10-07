import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

// Package from an explicit allowlist: no checkout, credentials, or node_modules.
export function buildAgentAssets(root: string): Map<string, Buffer> {
  const staging = mkdtempSync(path.join(tmpdir(), 'subscription-mcp-'));
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'mcp/package.json'), 'utf8'));
    delete manifest.scripts;
    writeFileSync(path.join(staging, 'package.json'), JSON.stringify(manifest));
    for (const [source, destination] of [
      ['mcp/src/server.mjs', 'src/server.mjs'],
      ['docs-site/api/ai-tools.json', 'schema/ai-tools.json'],
      ['mcp/README.md', 'README.md'],
      ['LICENSE', 'LICENSE'],
    ]) {
      mkdirSync(path.dirname(path.join(staging, destination)), { recursive: true });
      writeFileSync(path.join(staging, destination), readFileSync(path.join(root, source)));
    }
    const output = execFileSync('npm', ['pack', '--ignore-scripts', '--json'], {
      cwd: staging, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [{ filename }] = JSON.parse(output) as { filename: string }[];
    return new Map([
      ['/downloads/subscription-manager-mcp.tgz', readFileSync(path.join(staging, filename))],
      ['/agent/setup.md', readFileSync(path.join(root, 'docs/agent-setup.md'))],
      ['/agent/ai-tools.json', readFileSync(path.join(root, 'docs-site/api/ai-tools.json'))],
      ['/agent/openapi.yaml', readFileSync(path.join(root, 'docs-site/api/openapi.yaml'))],
    ]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function agentAssetsPlugin(): Plugin {
  let root = process.cwd();
  let assets: Map<string, Buffer> | undefined;
  return {
    name: 'subscription-manager-agent-assets',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.watcher.add([path.join(root, 'mcp'), path.join(root, 'docs/agent-setup.md'), path.join(root, 'docs-site/api')]);
      server.watcher.on('change', file => {
        if (file.startsWith(path.join(root, 'mcp')) || file.includes('docs-site/api') || file.endsWith('agent-setup.md')) assets = undefined;
      });
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (!['/downloads/subscription-manager-mcp.tgz', '/agent/setup.md', '/agent/ai-tools.json', '/agent/openapi.yaml'].includes(pathname)) return next();
        try {
          assets ??= buildAgentAssets(root);
          res.setHeader('Content-Type', pathname.endsWith('.tgz') ? 'application/gzip' : pathname.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8');
          res.end(assets.get(pathname));
        } catch (error) { next(error); }
      });
    },
    generateBundle() {
      for (const [url, source] of buildAgentAssets(root)) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source });
      }
    },
  };
}
