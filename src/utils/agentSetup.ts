export type AgentConnectionMode = 'mcp' | 'api';

export interface AgentClientConfigSnippets {
 remoteHttpUrl: string;
 claudeCodeRemoteCmd: string;
 claudeDesktopJson: string;
 codexToml: string;
}

export function buildAgentClientConfigSnippets(options: {
 origin: string;
 apiKey?: string;
}): AgentClientConfigSnippets {
 const origin = new URL(options.origin).origin;
 const token = options.apiKey?.trim() || '<SUBSCRIPTION_MANAGER_API_KEY>';
 const remoteHttpUrl = `${origin}/api/mcp`;

 const claudeCodeRemoteCmd = `claude mcp add --transport http steadyrenew ${remoteHttpUrl} --header "Authorization: Bearer ${token}"`;

 const claudeDesktopJson = JSON.stringify(
  {
   mcpServers: {
    'subscription-manager': {
     command: 'node',
     args: ['/absolute/path/to/steadyrenew-mcp.mjs'],
     env: {
      SUBSCRIPTION_MANAGER_BASE_URL: origin,
      SUBSCRIPTION_MANAGER_API_KEY: token,
     },
    },
   },
  },
  null,
  2
 );

 const codexToml = `[mcp_servers.steadyrenew]
command = "node"
args = ["/absolute/path/to/steadyrenew-mcp.mjs"]

[mcp_servers.steadyrenew.env]
SUBSCRIPTION_MANAGER_BASE_URL = "${origin}"
SUBSCRIPTION_MANAGER_API_KEY = "${token}"`;

 return {
  remoteHttpUrl,
  claudeCodeRemoteCmd,
  claudeDesktopJson,
  codexToml,
 };
}

export function buildAgentSetupPrompt(options: {
 origin: string;
 locale: string;
 mode: AgentConnectionMode;
 apiKey?: string;
 scopes?: readonly string[];
}): string {
 const origin = new URL(options.origin).origin;
 const zh = options.locale.startsWith('zh');
 const isReadOnly = Array.isArray(options.scopes) && !options.scopes.includes('write');

 const mode = options.mode === 'mcp'
  ? (zh
   ? '若当前客户端支持远程 Streamable HTTP MCP，优先直接连接远程 MCP 端点；若支持本地 stdio MCP，可运行零依赖单文件脚本或安装独立包；若仅支持 HTTP 请求，则使用 REST API，并说明最终采用的方式。'
   : 'If this client supports remote Streamable HTTP MCP, connect directly to the remote MCP endpoint; if it uses local stdio MCP, run the zero-dependency script or standalone package; otherwise use the REST API and report the mode actually connected.')
  : (zh ? '直接使用 REST API，不需要安装 MCP。' : 'Use the REST API directly; no MCP installation is needed.');

 const goalLineZh = isReadOnly
  ? '请帮我连接 SteadyRenew（只读模式），让我可以用自然语言查询和分析云端订阅记录。当前密钥仅具 read 权限，请勿尝试新增、修改或删除。'
  : '请帮我连接 SteadyRenew，让我可以用自然语言查询、新增、修改和删除云端订阅记录。';

 const goalLineEn = isReadOnly
  ? 'Connect SteadyRenew in read-only mode so I can list, inspect, and analyze my cloud subscription records using natural language. This key only has the read scope; do not attempt create, update, or delete writes.'
  : 'Connect SteadyRenew so I can list, create, update, and delete my cloud subscription records using natural language.';

 const writeSafetyZh = isReadOnly
  ? '5. 当前为只读密钥，仅执行查询与开销分析；若我要求写入或删除，请提示需要切换为读写密钥。缺少必要筛选信息时询问我，不要猜测。'
  : '5. 后续写操作先确认具体变更，删除前确认名称与 id；删除记录不等于向服务商退订。缺少必要信息时询问我，不要猜测。';

 const writeSafetyEn = isReadOnly
  ? '5. Keep operations read-only with this key; if I ask to create, update, or delete, remind me that a read/write key is required. Ask for missing details instead of guessing.'
  : '5. Confirm specific changes before writes and the name/id before deletion. Deleting a record does not cancel a provider’s service. Ask for missing information instead of guessing.';

 return zh ? `${goalLineZh}

网站地址：${origin}
接入说明：${origin}/agent/setup.md
工具定义：${origin}/agent/ai-tools.json
OpenAPI：${origin}/agent/openapi.yaml
远程 MCP（Streamable HTTP）：${origin}/api/mcp
MCP 单文件脚本：${origin}/downloads/steadyrenew-mcp.mjs
MCP 安装包：${origin}/downloads/subscription-manager-mcp.tgz

1. 先阅读接入说明与工具定义。${mode}
2. ${options.apiKey ? '本次授权使用的 API Key 见下方；仅保存到私有配置或环境变量，不要回显、写入日志或提交到仓库。' : '从我的私有环境或客户端密钥设置读取 SUBSCRIPTION_MANAGER_API_KEY；如果没有，请引导我在网站「设置 → API & MCP」创建并私下提供。不要把密钥前缀当作完整密钥。'}
3. 远程 MCP 直接使用 POST ${origin}/api/mcp 并附带 Authorization: Bearer <SUBSCRIPTION_MANAGER_API_KEY>。本地 stdio MCP 请检查 Node.js 20+：可直接下载零依赖单文件脚本 steadyrenew-mcp.mjs 用 node 启动，或在空目录安装下载的 .tgz 安装包（不要装进已有 npm 项目或 workspace；npm 10+ 可直接 npm install，npm 9.2 会报 Tracker "idealTree" already exists，此时解压安装包并用 bun install）。将服务器合并到当前客户端配置，保留其他配置，设置 SUBSCRIPTION_MANAGER_BASE_URL=${origin} 与 SUBSCRIPTION_MANAGER_API_KEY。
4. 只查询一条订阅验证连接（MCP: list_subscriptions，limit=1；API: GET /api/v1/subscriptions?limit=1）。空列表也算成功。不要创建测试记录；只有实际调用成功才报告连接完成。如果需要重启客户端，说明尚待验证。
${writeSafetyZh}
${options.apiKey ? `\nSUBSCRIPTION_MANAGER_API_KEY=${options.apiKey}\n` : ''}` : `${goalLineEn}

Site origin: ${origin}
Setup guide: ${origin}/agent/setup.md
Tool definitions: ${origin}/agent/ai-tools.json
OpenAPI: ${origin}/agent/openapi.yaml
Remote MCP (Streamable HTTP): ${origin}/api/mcp
MCP single-file script: ${origin}/downloads/steadyrenew-mcp.mjs
MCP package: ${origin}/downloads/subscription-manager-mcp.tgz

1. Read the setup guide and tool definitions first. ${mode}
2. ${options.apiKey ? 'The API key authorized for this connection is below. Store it only in private configuration or environment variables; never echo, log, or commit it.' : 'Read SUBSCRIPTION_MANAGER_API_KEY from my private environment or client secret settings. If unavailable, guide me to create one in Settings → API & MCP and provide it privately. A key prefix is not a complete key.'}
3. For remote MCP, connect directly to ${origin}/api/mcp with Authorization: Bearer <SUBSCRIPTION_MANAGER_API_KEY>. For local stdio MCP, check Node.js 20+ and either run the zero-dependency script steadyrenew-mcp.mjs directly with node, or install the downloaded .tgz package in an empty directory (not inside an existing npm project or workspace; npm 10+ can npm install it, while npm 9.2 fails with Tracker "idealTree" already exists — unpack the archive and bun install in that case). Merge the server into this client’s configuration while preserving existing settings. Set SUBSCRIPTION_MANAGER_BASE_URL=${origin} and SUBSCRIPTION_MANAGER_API_KEY.
4. Verify by reading one subscription (MCP: list_subscriptions with limit=1; API: GET /api/v1/subscriptions?limit=1). An empty list succeeds. Do not create sample records. Only report a verified connection after a successful call; if a client restart is needed, report verification as pending.
${writeSafetyEn}
${options.apiKey ? `\nSUBSCRIPTION_MANAGER_API_KEY=${options.apiKey}\n` : ''}`;
}
