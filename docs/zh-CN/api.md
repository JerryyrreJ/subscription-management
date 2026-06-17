# 开放 API

v1 API 通过 API Key 开放订阅 CRUD。

AI Agent 可以使用 `docs-site/api/ai-tools.json` 获取 tool/function 定义、风险等级、确认提示和错误恢复建议。OpenAPI schema 位于 `docs-site/api/openapi.yaml`。

## 访问权限

在用户菜单的 **开发者 API** 中创建 API Key。完整 Key 只显示一次，请像密码一样保存。

默认限额：

- 普通用户：1 个可用 Key，每用户每小时 60 次请求
- Premium 用户：5 个可用 Key，每用户每小时 1000 次请求

## 鉴权

```bash
Authorization: Bearer subm_xxx
```

## 订阅

基础路径：

```text
/api/v1/subscriptions
```

接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/subscriptions` | 查询当前 API Key 所属用户的订阅 |
| `GET` | `/api/v1/subscriptions/:id` | 查询单个订阅 |
| `POST` | `/api/v1/subscriptions` | 创建订阅 |
| `PATCH` | `/api/v1/subscriptions/:id` | 更新可写字段 |
| `DELETE` | `/api/v1/subscriptions/:id` | 删除订阅 |

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
  "notificationEnabled": true
}
```

`id`、`nextPaymentDate`、`createdAt` 和 `updatedAt` 由服务端管理。`customDate` 只用于自定义扣费周期。

对于 AI Agent，查询属于低风险，可以直接执行。创建和更新属于中风险，应先确认。删除属于高风险，必须确认准确的订阅名称和 id 后再执行。

示例：

```bash
curl -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  https://your-site.example/api/v1/subscriptions
```

```bash
curl -X POST \
  -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Netflix","category":"Streaming","amount":15.99,"currency":"USD","period":"monthly","lastPaymentDate":"2026-06-01"}' \
  https://your-site.example/api/v1/subscriptions
```

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
