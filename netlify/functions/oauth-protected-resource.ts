import type { Config } from '@netlify/functions';
import { getOptionalSupabasePublicConfig, type Environment } from './_shared/env';
import { runtimeEnvironment } from './_shared/webHandler';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version',
};

const KNOWN_PATH_PREFIXES = [
  '/.well-known/oauth-protected-resource',
  '/.netlify/functions/oauth-protected-resource',
];

const extractResourceSuffix = (pathname: string): string | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  for (const prefix of KNOWN_PATH_PREFIXES) {
    if (normalized === prefix) {
      return '';
    }
    if (normalized.startsWith(`${prefix}/`)) {
      return normalized.slice(prefix.length);
    }
  }
  return null;
};

const resolveAuthorizationServer = (env: Environment): string => {
  const explicit = env.MCP_OAUTH_AUTHORIZATION_SERVER?.trim();
  if (explicit) {
    const parsed = new URL(explicit);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Invalid MCP_OAUTH_AUTHORIZATION_SERVER URL');
    }
    return parsed.toString().replace(/\/+$/, '');
  }

  const supabaseConfig = getOptionalSupabasePublicConfig(env);
  if (!supabaseConfig) {
    throw new Error('Supabase public configuration is missing');
  }

  return `${new URL(supabaseConfig.url).origin}/auth/v1`;
};

export const createOAuthProtectedResourceHandler = (
  env: Environment = runtimeEnvironment
) => async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        Allow: 'GET, HEAD, OPTIONS',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({
      error: {
        code: 'method_not_allowed',
        message: 'Method not allowed',
      },
    }), {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        Allow: 'GET, HEAD, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const url = new URL(request.url);
  const suffix = extractResourceSuffix(url.pathname);
  if (suffix === null || (suffix !== '' && suffix !== '/api/mcp')) {
    return new Response(JSON.stringify({
      error: {
        code: 'not_found',
        message: 'Protected resource metadata not found',
      },
    }), {
      status: 404,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const authorizationServer = resolveAuthorizationServer(env);
    const origin = url.origin;
    const metadata = {
      resource: `${origin}/api/mcp`,
      resource_name: 'SteadyRenew',
      authorization_servers: [authorizationServer],
      scopes_supported: ['openid', 'email', 'profile'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${origin}/docs/en/user-guide/agent-setup`,
    };

    return new Response(request.method === 'HEAD' ? null : JSON.stringify(metadata), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({
      error: {
        code: 'oauth_configuration_unavailable',
        message: 'OAuth protected resource metadata is temporarily unavailable',
      },
    }), {
      status: 503,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
};

export default createOAuthProtectedResourceHandler();
export const config: Config = {};
