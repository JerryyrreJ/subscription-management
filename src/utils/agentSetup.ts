export type AgentConnectionMode = 'mcp' | 'api';

export function buildAgentSetupPrompt(options: {
 origin: string;
 locale: string;
 mode: AgentConnectionMode;
 apiKey?: string;
}): string {
 const origin = new URL(options.origin).origin;
 const zh = options.locale.startsWith('zh');
 const mode = options.mode === 'mcp'
  ? (zh ? '优先配置本地 stdio MCP；若当前客户端不支持，但可以发送 HTTP 请求，则使用 API，并说明最终采用的方式。' : 'Prefer local stdio MCP. If this client cannot use it but can make HTTP requests, use the API and report the mode actually connected.')
  : (zh ? '直接使用 REST API，不需要安装 MCP。' : 'Use the REST API directly; no MCP installation is needed.');
 return zh ? `请帮我连接 SteadyRenew，让我可以用自然语言查询、新增、修改和删除云端订阅记录。

网站地址：${origin}
接入说明：${origin}/agent/setup.md
工具定义：${origin}/agent/ai-tools.json
OpenAPI：${origin}/agent/openapi.yaml
MCP 安装包：${origin}/downloads/subscription-manager-mcp.tgz

1. 先阅读接入说明与工具定义。${mode}
2. ${options.apiKey ? '本次授权使用的 API Key 见下方；仅保存到私有配置或环境变量，不要回显、写入日志或提交到仓库。' : '从我的私有环境或客户端密钥设置读取 SUBSCRIPTION_MANAGER_API_KEY；如果没有，请引导我在网站「设置 → API & MCP」创建并私下提供。不要把密钥前缀当作完整密钥。'}
3. MCP 方式请检查 Node.js 20+，下载安装包并在持久目录安装，将服务器合并到当前客户端配置，保留其他配置。网站地址使用 SUBSCRIPTION_MANAGER_BASE_URL=${origin}。
4. 只查询一条订阅验证连接（MCP: list_subscriptions，limit=1；API: GET /api/v1/subscriptions?limit=1）。空列表也算成功。不要创建测试记录；只有实际调用成功才报告连接完成。如果需要重启客户端，说明尚待验证。
5. 后续写操作先确认具体变更，删除前确认名称与 id；删除记录不等于向服务商退订。缺少必要信息时询问我，不要猜测。
${options.apiKey ? `\nSUBSCRIPTION_MANAGER_API_KEY=${options.apiKey}\n` : ''}` : `Connect SteadyRenew so I can list, create, update, and delete my cloud subscription records using natural language.

Site origin: ${origin}
Setup guide: ${origin}/agent/setup.md
Tool definitions: ${origin}/agent/ai-tools.json
OpenAPI: ${origin}/agent/openapi.yaml
MCP package: ${origin}/downloads/subscription-manager-mcp.tgz

1. Read the setup guide and tool definitions first. ${mode}
2. ${options.apiKey ? 'The API key authorized for this connection is below. Store it only in private configuration or environment variables; never echo, log, or commit it.' : 'Read SUBSCRIPTION_MANAGER_API_KEY from my private environment or client secret settings. If unavailable, guide me to create one in Settings → API & MCP and provide it privately. A key prefix is not a complete key.'}
3. For MCP, check Node.js 20+, download and install the package in a persistent directory, and merge the server into this client’s configuration while preserving existing settings. Set SUBSCRIPTION_MANAGER_BASE_URL=${origin}.
4. Verify by reading one subscription (MCP: list_subscriptions with limit=1; API: GET /api/v1/subscriptions?limit=1). An empty list succeeds. Do not create sample records. Only report a verified connection after a successful call; if a client restart is needed, report verification as pending.
5. Confirm specific changes before writes and the name/id before deletion. Deleting a record does not cancel a provider’s service. Ask for missing information instead of guessing.
${options.apiKey ? `\nSUBSCRIPTION_MANAGER_API_KEY=${options.apiKey}\n` : ''}`;
}
