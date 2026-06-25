# 开放 API

v1 API 通过 Developer API Key 提供订阅生命周期管理、分析和审计访问能力。

AI Agent 可以使用 `docs-site/api/ai-tools.json` 获取 tool/function 定义、风险等级、确认提示和错误恢复建议。OpenAPI schema 位于 `docs-site/api/openapi.yaml`。

## 访问权限

在用户菜单的 **开发者 API** 中创建 API Key。完整 Key 只显示一次，请像密码一样保存。

默认限额：

- 普通用户：1 个可用 Key，每用户每小时 60 次请求
- Premium 用户：5 个可用 Key，每用户每小时 1000 次请求

API Key 带有 scopes：

- `read`：查询和读取订阅；调用分析和审计端点
- `write`：包含 `read` 的能力，并额外允许创建、更新、取消、暂停、恢复和删除

## 鉴权

```bash
Authorization: Bearer subm_xxx
```

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/subscriptions` | 查询订阅列表 |
| `GET` | `/api/v1/subscriptions/:id` | 查询单个订阅 |
| `POST` | `/api/v1/subscriptions` | 创建订阅 |
| `PATCH` | `/api/v1/subscriptions/:id` | 更新可写字段，包括 `status` |
| `DELETE` | `/api/v1/subscriptions/:id` | 永久删除订阅 |
| `GET` | `/api/v1/analytics/summary` | 按币种/分类汇总支出并返回即将续费项 |
| `GET` | `/api/v1/analytics/duplicates` | 查找重复订阅候选 |
| `GET` | `/api/v1/analytics/optimizations` | 返回不虚构折扣的优化候选 |
| `GET` | `/api/v1/audit` | 开放 API 写操作审计日志 |

## 订阅

可写字段使用 camelCase：

```json
{
  "name": "Netflix",
  "category": "Streaming",
  "amount": 15.99,
  "currency": "USD",
  "period": "monthly",
  "lastPaymentDate": "2026-06-01",
  "customDate": null,
  "notificationEnabled": true,
  "status": "active"
}
```

`id`、`nextPaymentDate`、`createdAt` 和 `updatedAt` 由服务端管理。`customDate` 只用于自定义扣费周期。

`status` 可以是 `active`、`paused` 或 `cancelled`。当用户希望保留历史时，优先使用 `PATCH {"status":"cancelled"}` 或 `PATCH {"status":"paused"}`；只有需要永久移除记录时才使用 `DELETE`。

## 列表过滤

`GET /api/v1/subscriptions` 支持分页、过滤和排序：

| 参数 | 规则 |
| --- | --- |
| `limit` | 1-100，默认 50 |
| `offset` | 默认 0 |
| `status` | `active`、`paused` 或 `cancelled` |
| `category` | 分类精确匹配 |
| `period` | `monthly`、`yearly` 或 `custom` |
| `q` | 对订阅名称不区分大小写搜索 |
| `expiringBefore` | `YYYY-MM-DD`；结合 `status=active` 查询即将续费 |
| `sort` | `createdAt`、`-createdAt`、`nextPaymentDate`、`-nextPaymentDate`、`amount`、`-amount`、`name`、`-name` |

## 分析和审计

分析端点只读，并按币种分别报告金额，不做跨币种换算：

- `/api/v1/analytics/summary?horizonDays=30`
- `/api/v1/analytics/duplicates`
- `/api/v1/analytics/optimizations`

每一次成功的开放 API create、update 和 delete 都会记录到 `/api/v1/audit`。可以用 `limit`、`offset` 和可选的 `subscriptionId` 分页或过滤审计记录。

## 错误与限流

错误格式：

```json
{
  "error": {
    "code": "invalid_subscription",
    "message": "Invalid option",
    "field": "period",
    "suggestedFix": "Use one of the supported billing periods: monthly, yearly, custom."
  },
  "requestId": "..."
}
```

当服务端能给出明确修复建议时，错误中可能包含 `field`、`suggestedFix`、`allowedValues` 和 `writableFields`。

API 响应包含：

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

校验错误（`400`）会在扣减限额之前被拒绝。`429` 响应会带 `Retry-After` header。

完整示例见 Mintlify API 指南：`docs-site/zh-CN/api/`。
