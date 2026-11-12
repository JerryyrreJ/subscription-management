import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import type { Plugin } from 'vite';

const DEFAULT_PUBLIC_ORIGIN = 'https://steadyrenew.com';

const AGENT_ASSET_PATHS = new Set([
  '/downloads/subscription-manager-mcp.tgz',
  '/downloads/steadyrenew-mcp.mjs',
  '/agent/setup.md',
  '/agent/ai-tools.json',
  '/agent/openapi.yaml',
]);

export function resolveAgentSiteOrigin(explicitOrigin?: string): string {
  const candidates = [
    explicitOrigin,
    process.env.VITE_SITE_URL,
    process.env.SITE_URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.URL,
    DEFAULT_PUBLIC_ORIGIN,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      return new URL(trimmed).origin;
    } catch {
      // Ignore malformed env values and fall through to next candidate.
    }
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

const rewriteAiToolsOrigin = (rawJson: string, origin: string): Buffer => {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  parsed.baseUrl = origin;
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
};

const rewriteOpenApiOrigin = (rawYaml: string, origin: string): Buffer => {
  const updated = rawYaml.replace(
    /^(\s*-\s*url:\s*)(?:https?:\/\/[^\s]+)(\s*)$/m,
    `$1${origin}$2`
  );
  return Buffer.from(updated, 'utf8');
};

// Package from an explicit allowlist: no checkout, credentials, or node_modules.
export function buildAgentAssets(root: string, explicitOrigin?: string): Map<string, Buffer> {
  const origin = resolveAgentSiteOrigin(explicitOrigin);
  const staging = mkdtempSync(path.join(tmpdir(), 'subscription-mcp-'));
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'mcp/package.json'), 'utf8')) as {
      version?: string;
      scripts?: unknown;
    };
    const mcpVersion = manifest.version ?? '0.2.0';
    delete manifest.scripts;
    writeFileSync(path.join(staging, 'package.json'), JSON.stringify(manifest));

    const rawAiTools = readFileSync(path.join(root, 'docs-site/api/ai-tools.json'), 'utf8');
    const rawOpenApi = readFileSync(path.join(root, 'docs-site/api/openapi.yaml'), 'utf8');

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
      cwd: staging,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [{ filename }] = JSON.parse(output) as { filename: string }[];

    // Emit a zero-dependency single-file ESM bundle so local stdio clients can run
    // `node steadyrenew-mcp.mjs` directly without unpacking or running npm install.
    const bundledMcp = buildSync({
      entryPoints: [path.join(root, 'mcp/src/server.mjs')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      write: false,
      define: {
        'globalThis.__STEADYRENEW_AI_TOOLS_SCHEMA__': rawAiTools,
        'globalThis.__STEADYRENEW_MCP_VERSION__': JSON.stringify(mcpVersion),
      },
    });
    const bundledCode = Buffer.from(bundledMcp.outputFiles[0].contents);

    return new Map([
      ['/downloads/subscription-manager-mcp.tgz', readFileSync(path.join(staging, filename))],
      ['/downloads/steadyrenew-mcp.mjs', bundledCode],
      ['/agent/setup.md', readFileSync(path.join(root, 'docs/agent-setup.md'))],
      ['/agent/ai-tools.json', rewriteAiToolsOrigin(rawAiTools, origin)],
      ['/agent/openapi.yaml', rewriteOpenApiOrigin(rawOpenApi, origin)],
    ]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const getAssetContentType = (pathname: string): string => {
  if (pathname.endsWith('.tgz')) return 'application/gzip';
  if (pathname.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  if (pathname.endsWith('.yaml')) return 'application/yaml; charset=utf-8';
  return 'text/markdown; charset=utf-8';
};

export function agentAssetsPlugin(): Plugin {
  let root = process.cwd();
  let cachedOrigin = '';
  let assets: Map<string, Buffer> | undefined;
  return {
    name: 'subscription-manager-agent-assets',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.watcher.add([
        path.join(root, 'mcp'),
        path.join(root, 'docs/agent-setup.md'),
        path.join(root, 'docs-site/api'),
      ]);
      server.watcher.on('change', file => {
        if (
          file.startsWith(path.join(root, 'mcp')) ||
          file.includes('docs-site/api') ||
          file.endsWith('agent-setup.md')
        ) {
          assets = undefined;
        }
      });
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (!AGENT_ASSET_PATHS.has(pathname)) return next();
        try {
          const requestOrigin = req.headers.host ? `http://${req.headers.host}` : undefined;
          const resolvedOrigin = resolveAgentSiteOrigin(requestOrigin);
          if (!assets || cachedOrigin !== resolvedOrigin) {
            assets = buildAgentAssets(root, resolvedOrigin);
            cachedOrigin = resolvedOrigin;
          }
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', getAssetContentType(pathname));
          res.end(assets.get(pathname));
        } catch (error) {
          next(error);
        }
      });
    },
    generateBundle() {
      for (const [url, source] of buildAgentAssets(root)) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source });
      }
    },
  };
}
