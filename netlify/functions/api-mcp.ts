import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config, Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import aiToolsSchema from '../../docs-site/api/ai-tools.json' with { type: 'json' };
import { identifyApiKey } from './_shared/apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './_shared/env';
import { errorResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';
import { runtimeEnvironment } from './_shared/webHandler';
import { createAnalyticsApiHandler } from './api-v1-analytics';
import { createAuditApiHandler } from './api-v1-audit';
import { createNotificationSettingsApiHandler } from './api-v1-notification-settings';
import { createSubscriptionsApiHandler } from './api-v1-subscriptions';

interface ApiMcpDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
}

interface RawToolDef {
  name: string;
  method: string;
  path: string;
  purpose: string;
  riskLevel?: string;
  requiresConfirmation?: boolean;
  requiredScope?: string;
  requiresPremium?: boolean;
  useWhen?: string[];
  doNotUseWhen?: string[];
  fixedBody?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

const MAX_MCP_REQUEST_BYTES = 256 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Mcp-Session-Id, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
};

const defs = (aiToolsSchema.$defs ?? {}) as Record<string, Record<string, unknown>>;

const inlineSchemaRefs = (node: unknown, seen: Set<string> = new Set()): unknown => {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(item => inlineSchemaRefs(item, seen));
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === 'string' && obj.$ref.startsWith('#/$defs/')) {
    const defName = obj.$ref.slice('#/$defs/'.length);
    if (seen.has(defName) || !defs[defName]) {
      return { type: 'object' };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(defName);
    const resolved = inlineSchemaRefs(defs[defName], nextSeen) as Record<string, unknown>;
    const siblings = { ...obj };
    delete siblings.$ref;
    return {
      ...resolved,
      ...(inlineSchemaRefs(siblings, nextSeen) as Record<string, unknown>),
    };
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$defs') continue;
    output[key] = inlineSchemaRefs(value, seen);
  }
  return output;
};

const describeTool = (tool: RawToolDef): string => {
  const lines = [tool.purpose];
  if (tool.requiresConfirmation) {
    lines.push(`Confirm with the user before calling (riskLevel: ${tool.riskLevel}).`);
  }
  if (tool.requiredScope) {
    lines.push(`Requires the '${tool.requiredScope}' API key scope.`);
  }
  if (tool.requiresPremium && !tool.purpose.toLowerCase().includes('premium')) {
    lines.push('Requires SteadyRenew Premium.');
  }
  if (Array.isArray(tool.useWhen) && tool.useWhen.length > 0) {
    lines.push(`Use when: ${tool.useWhen.join(' ')}`);
  }
  if (Array.isArray(tool.doNotUseWhen) && tool.doNotUseWhen.length > 0) {
    lines.push(`Do not use when: ${tool.doNotUseWhen.join(' ')}`);
  }
  if (aiToolsSchema.globalConventions?.outOfScope) {
    lines.push(aiToolsSchema.globalConventions.outOfScope);
  }
  return lines.join(' ');
};

const schemaTools = aiToolsSchema.tools as unknown as RawToolDef[];

const mcpTools = schemaTools.map(tool => ({
  name: tool.name,
  description: describeTool(tool),
  inputSchema: inlineSchemaRefs(
    tool.parameters ?? { type: 'object', properties: {}, additionalProperties: false }
  ) as Record<string, unknown>,
  annotations: {
    readOnlyHint: tool.method === 'GET',
    destructiveHint: tool.method !== 'GET' && tool.method !== 'POST',
    openWorldHint: false,
  },
}));

const toolByName = new Map(schemaTools.map(tool => [tool.name, tool]));

const createDefaultDependencies = (): ApiMcpDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(runtimeEnvironment);
  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(runtimeEnvironment),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const buildToolInvocation = (
  tool: RawToolDef,
  rawArgs: unknown
): {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string | null;
} => {
  const safeArgs = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
    ? (rawArgs as Record<string, unknown>)
    : {};
  const usedPathParams = new Set<string>();

  const path = tool.path.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = safeArgs[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    usedPathParams.add(key);
    return encodeURIComponent(String(value));
  });

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(safeArgs)) {
    if (!usedPathParams.has(key)) {
      rest[key] = value;
    }
  }

  const query: Record<string, string> = {};
  let payload: unknown;

  if (tool.fixedBody) {
    payload = tool.fixedBody;
  } else if (tool.method === 'POST') {
    payload = rest;
  } else if (tool.method === 'PATCH') {
    payload = rest.patch ?? rest;
  }

  if (tool.method === 'GET') {
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null) {
        query[key] = String(value);
      }
    }
  }

  return {
    method: tool.method,
    path,
    query,
    body: payload !== undefined ? JSON.stringify(payload) : null,
  };
};

const withMcpHeaders = (response: Response, extraHeaders: Record<string, string> = {}): Response => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const handlerResponseToWeb = (res: HandlerResponse): Response => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers ?? {})) {
    if (value !== undefined) headers.set(key, String(value));
  }
  if (res.statusCode === 401 && !headers.has('WWW-Authenticate')) {
    headers.set('WWW-Authenticate', 'Bearer realm="SteadyRenew MCP"');
  }
  return withMcpHeaders(new Response(res.body ?? null, {
    status: res.statusCode,
    headers,
  }));
};

export const createApiMcpHandler = (
  dependenciesFactory: () => ApiMcpDependencies = createDefaultDependencies
) => async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return withMcpHeaders(new Response(null, {
      status: 204,
      headers: { Allow: 'POST, OPTIONS' },
    }));
  }

  // Stateless serverless Streamable HTTP endpoint: standalone GET SSE streams and
  // stateful session DELETE are intentionally unsupported and return HTTP 405 per
  // the MCP Streamable HTTP specification.
  if (request.method !== 'POST') {
    return withMcpHeaders(new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for stateless Streamable HTTP MCP requests.',
      },
      id: null,
    }), {
      status: 405,
      headers: {
        Allow: 'POST, OPTIONS',
        'Content-Type': 'application/json',
      },
    }));
  }

  let requestId: string = crypto.randomUUID();

  const payloadTooLargeResponse = () => withMcpHeaders(new Response(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: `Request body exceeds ${MAX_MCP_REQUEST_BYTES} bytes.`,
    },
    id: null,
  }), {
    status: 413,
    headers: { 'Content-Type': 'application/json' },
  }));

  try {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_REQUEST_BYTES) {
      return payloadTooLargeResponse();
    }

    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_MCP_REQUEST_BYTES) {
      return payloadTooLargeResponse();
    }

    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const now = dependencies.now();
    const incomingHeaders = Object.fromEntries(request.headers);

    // Authenticate the API key upfront on every MCP request (initialize, tools/list,
    // tools/call). Per-minute tool call quota is charged inside the target API route
    // handler only when tools/call executes a valid request.
    const authenticatedIdentity = await identifyApiKey(
      incomingHeaders,
      dependencies.database,
      dependencies.limits,
      now,
      requestId
    );

    const authedDependencies = { ...dependencies, authenticatedIdentity };
    const subscriptionsHandler = createSubscriptionsApiHandler(() => authedDependencies);
    const analyticsHandler = createAnalyticsApiHandler(() => authedDependencies);
    const auditHandler = createAuditApiHandler(() => authedDependencies);
    const notificationSettingsHandler = createNotificationSettingsApiHandler(() => authedDependencies);

    const resolveRouteHandler = (path: string): Handler => {
      if (path.startsWith('/api/v1/subscriptions')) return subscriptionsHandler;
      if (path.startsWith('/api/v1/analytics')) return analyticsHandler;
      if (path.startsWith('/api/v1/audit')) return auditHandler;
      if (path.startsWith('/api/v1/notification-settings')) return notificationSettingsHandler;
      throw new Error(`Unsupported tool path: ${path}`);
    };

    const mcpServer = new McpServer(
      {
        name: 'subscription-manager',
        title: 'SteadyRenew',
        version: aiToolsSchema.schemaVersion ?? '1.1.0',
      },
      { capabilities: { tools: {} } }
    );

    mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: mcpTools,
    }));

    mcpServer.server.setRequestHandler(CallToolRequestSchema, async mcpReq => {
      const tool = toolByName.get(mcpReq.params.name);
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${mcpReq.params.name}` }],
        };
      }

      try {
        const invocation = buildToolInvocation(tool, mcpReq.params.arguments ?? {});
        const routeHandler = resolveRouteHandler(invocation.path);
        const queryString = new URLSearchParams(invocation.query).toString();
        const origin = new URL(request.url).origin;
        const syntheticEvent: HandlerEvent = {
          rawUrl: `${origin}${invocation.path}${queryString ? `?${queryString}` : ''}`,
          rawQuery: queryString,
          path: invocation.path,
          httpMethod: invocation.method,
          headers: {
            ...incomingHeaders,
            ...(invocation.body !== null ? { 'content-type': 'application/json' } : {}),
          },
          multiValueHeaders: {},
          queryStringParameters: invocation.query,
          multiValueQueryStringParameters: {},
          body: invocation.body,
          isBase64Encoded: false,
        };

        const routeResponse = (await routeHandler(syntheticEvent, {} as never)) as HandlerResponse;
        return {
          isError: routeResponse.statusCode >= 400,
          content: [
            {
              type: 'text',
              text: routeResponse.body || `HTTP ${routeResponse.statusCode}`,
            },
          ],
        };
      } catch (toolError) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Request failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
            },
          ],
        };
      }
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      keepAliveMs: 0,
    });

    await mcpServer.connect(transport);

    // Ensure simple JSON-RPC HTTP clients that send Accept: application/json or */*
    // work alongside strict MCP clients that send Accept: application/json, text/event-stream.
    const patchedHeaders = new Headers(request.headers);
    const accept = request.headers.get('accept') ?? '';
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      patchedHeaders.set('Accept', 'application/json, text/event-stream');
    }
    const normalizedRequest = new Request(request.url, {
      method: request.method,
      headers: patchedHeaders,
      body: rawBody,
    });

    const mcpResponse = await transport.handleRequest(normalizedRequest);
    return withMcpHeaders(mcpResponse);
  } catch (error) {
    logEvent('error', 'Remote MCP request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return handlerResponseToWeb(errorResponse(error, requestId));
  }
};

export default createApiMcpHandler();
export const config: Config = {};
