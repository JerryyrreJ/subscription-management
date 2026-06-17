#!/usr/bin/env node
// MCP server for the Subscription Manager public API.
//
// Single source of truth: it loads docs-site/api/ai-tools.json and exposes every
// tool there over the Model Context Protocol, proxying each call to the REST API
// with a bearer key. Because the tool list, purposes, risk levels, and parameter
// schemas all come from that file, the MCP surface never drifts from the docs.
//
// Required environment:
//   SUBSCRIPTION_MANAGER_BASE_URL   e.g. https://subscriptions.example.com
//   SUBSCRIPTION_MANAGER_API_KEY    a key minted in the dashboard (subm_...)
// Optional:
//   SUBSCRIPTION_MANAGER_TOOLS_SCHEMA   path to an ai-tools.json override

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const baseUrl = process.env.SUBSCRIPTION_MANAGER_BASE_URL;
const apiKey = process.env.SUBSCRIPTION_MANAGER_API_KEY;

if (!baseUrl || !apiKey) {
  console.error(
    'Missing configuration. Set SUBSCRIPTION_MANAGER_BASE_URL and SUBSCRIPTION_MANAGER_API_KEY.'
  );
  process.exit(1);
}

const schemaPath =
  process.env.SUBSCRIPTION_MANAGER_TOOLS_SCHEMA ||
  join(here, '..', '..', 'docs-site', 'api', 'ai-tools.json');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const defs = schema.$defs ?? {};

const normalizedBase = baseUrl.replace(/\/+$/, '');

// Resolve a top-level $ref so each tool's inputSchema has an object root, and
// attach $defs so nested refs (dateOnly, subscriptionPatch) still resolve.
const buildInputSchema = (tool) => {
  let params = tool.parameters ?? { type: 'object', properties: {}, additionalProperties: false };
  if (params.$ref) {
    const name = params.$ref.replace('#/$defs/', '');
    params = defs[name] ?? { type: 'object' };
  }
  return { ...params, $defs: defs };
};

const describeTool = (tool) => {
  const lines = [tool.purpose];
  if (tool.requiresConfirmation) {
    lines.push(`Confirm with the user before calling (riskLevel: ${tool.riskLevel}).`);
  }
  if (tool.requiredScope) {
    lines.push(`Requires the '${tool.requiredScope}' API key scope.`);
  }
  return lines.join(' ');
};

const tools = schema.tools.map((tool) => ({
  name: tool.name,
  description: describeTool(tool),
  inputSchema: buildInputSchema(tool),
}));

const toolByName = new Map(schema.tools.map((tool) => [tool.name, tool]));

// Turn a tool call into a concrete HTTP request using the tool's method/path and
// the conventions encoded in ai-tools.json (path params, fixedBody, patch body).
const buildRequest = (tool, args = {}) => {
  const usedPathParams = new Set();
  const path = tool.path.replace(/\{(\w+)\}/g, (_, key) => {
    usedPathParams.add(key);
    return encodeURIComponent(String(args[key]));
  });

  const rest = {};
  for (const [key, value] of Object.entries(args)) {
    if (!usedPathParams.has(key)) {
      rest[key] = value;
    }
  }

  let body;
  let queryString = '';

  if (tool.fixedBody) {
    body = tool.fixedBody;
  } else if (tool.method === 'POST') {
    body = rest;
  } else if (tool.method === 'PATCH') {
    body = rest.patch ?? rest;
  }

  if (tool.method === 'GET') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    queryString = params.toString();
  }

  return {
    method: tool.method,
    url: `${normalizedBase}${path}${queryString ? `?${queryString}` : ''}`,
    body,
  };
};

const callTool = async (tool, args) => {
  const request = buildRequest(tool, args);
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
};

const server = new Server(
  { name: 'subscription-manager', version: schema.schemaVersion ?? '0.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolByName.get(request.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    };
  }

  try {
    const result = await callTool(tool, request.params.arguments ?? {});
    return {
      isError: !result.ok,
      content: [{ type: 'text', text: result.text || `HTTP ${result.status}` }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Request failed: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Subscription Manager MCP server ready (${tools.length} tools, base ${normalizedBase}).`);
