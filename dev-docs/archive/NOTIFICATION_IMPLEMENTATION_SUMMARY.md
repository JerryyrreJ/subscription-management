# 离线推送通知系统 - 实现总结

## 核心改进

### ✅ 问题解决

**原问题**：用户关闭网页后无法收到订阅到期通知

**解决方案**：
1. 移除前端定时检查逻辑
2. 使用 Netlify Scheduled Function 实现后端定时任务
3. 通知数据存储在 Supabase 云端
4. **24/7 自动运行，完全离线推送**

---

## 架构设计

### 数据流

```
┌─────────────────────────────────────────┐
│ 用户配置通知（NotificationSettingsModal）│
│ - Bark Server URL                        │
│ - Device Key                             │
│ - Days Before (1/3/7/14)                 │
└───────────────┬─────────────────────────┘
                │ 自动同步
                ↓
┌─────────────────────────────────────────┐
│ Supabase 数据库                          │
│ ┌─────────────────────────────────────┐ │
│ │ subscriptions                        │ │
│ │ - notification_enabled ✅ (新字段)  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ user_notification_settings (新表)   │ │
│ │ - bark_enabled                       │ │
│ │ - bark_server_url                    │ │
│ │ - bark_device_key                    │ │
│ │ - bark_days_before                   │ │
│ │ - bark_history (JSON)                │ │
│ └─────────────────────────────────────┘ │
└───────────────┬─────────────────────────┘
                │ Service Role Key
                ↓
┌─────────────────────────────────────────┐
│ Netlify Scheduled Function (每小时)     │
│                                          │
│ 执行逻辑：                                │
│ 1. 查询启用 Bark 的用户                  │
│ 2. 遍历用户的订阅                         │
│    └─ 过滤: notification_enabled=true   │
│ 3. 计算距离到期天数                      │
│ 4. 匹配 daysBefore && 今天未推送         │
│ 5. 调用 Bark API                         │
│ 6. 更新 bark_history                     │
│ 7. 清理 30 天前的历史记录                │
└───────────────┬─────────────────────────┘
                │ HTTP POST
                ↓
┌─────────────────────────────────────────┐
│ Bark 推送服务器                           │
│ - 官方: https://api.day.app              │
│ - 自托管: Docker (finb/bark-server)      │
└───────────────┬─────────────────────────┘
                ↓
              📱 iOS 设备
```

---

## 文件修改清单

### 1. 类型定义
- `src/types.ts`
  - ✅ Subscription 添加 `notificationEnabled?: boolean`
  - ✅ ReminderSettings 简化（移除 browserNotification）

### 2. 数据库架构
- `supabase/01_add_notification_enabled.sql` ✨ 新建
  - 为 subscriptions 表添加 notification_enabled 字段
  - 创建索引优化查询性能

- `supabase/02_create_notification_settings.sql` ✨ 新建
  - 创建 user_notification_settings 表
  - 设置 RLS 策略（用户 + Service Role）
  - 自动更新 updated_at 触发器

### 3. 服务层
- `src/services/subscriptionService.ts`
  - ✅ 添加 notification_enabled 字段处理
  - ✅ transformFromSupabase/transformToSupabase 更新

- `src/services/notificationSettingsService.ts` ✨ 新建
  - ✅ getSettings() - 从云端加载
  - ✅ saveSettings() - 保存到云端
  - ✅ updateHistory() - 更新推送历史

### 4. 前端 UI
- `src/components/AddSubscriptionModal.tsx`
  - ✅ 添加通知开关 UI（Bell/BellOff 图标）
  - ✅ 默认启用通知

- `src/components/EditSubscriptionModal.tsx`
  - ✅ 添加通知开关 UI
  - ✅ useEffect 同步 notificationEnabled

- `src/components/NotificationSettingsModal.tsx`
  - ✅ 移除浏览器通知部分
  - ✅ 只保留 Bark 配置
  - ✅ 添加全局提示（自动推送说明）

### 5. 工具函数
- `src/utils/storage.ts`
  - ✅ loadSubscriptions 添加 notificationEnabled 默认值

- `src/utils/notificationChecker.ts`
  - ✅ 移除 `checkAndSendNotifications` 函数
  - ✅ 移除 `recordBrowserNotification` 函数
  - ✅ 简化 getDefaultNotificationSettings

- `src/App.tsx`
  - ✅ 移除前端定时检查 useEffect
  - ✅ 移除 checkAndSendNotifications import

### 6. 后端函数
- `netlify/functions/send-scheduled-notifications.ts` ✨ 新建
  - ✅ Scheduled Function（@hourly）
  - ✅ 查询启用 Bark 的用户
  - ✅ 发送 Bark 推送
  - ✅ 更新推送历史
  - ✅ 清理过期记录
  - ✅ 详细日志记录

---

## 核心特性

### 1. 双层开关设计

**全局开关**（NotificationSettingsModal）:
- 控制用户整体是否接收推送
- 配置 Bark 服务器和密钥
- 设置全局提前天数

**订阅级开关**（Add/Edit Subscription）:
- 每个订阅独立控制
- 默认启用，用户可关闭
- 只有**两个开关都启用**才会推送

### 2. 去重机制

通过 `bark_history` JSON 字段记录推送历史：
```json
{
  "sub-id-1": "2024-01-15T08:00:00Z",
  "sub-id-2": "2024-01-14T08:00:00Z"
}
```

检查逻辑：
- 每个订阅每天最多推送一次
- 比较日期字符串（toDateString）
- 自动清理 30 天前的记录

### 3. 错误处理

- 单个用户推送失败不影响其他用户
- Bark 服务器不可达会记录日志并继续
- Service Role Key 缺失会返回 500 错误
- 详细的日志记录便于调试

---

## 部署要求

### 环境变量

```env
# 前端 + 后端
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 仅后端（重要！）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Netlify 配置

无需手动配置！Netlify 会自动检测并部署：
- 函数入口: `netlify/functions/send-scheduled-notifications.ts`
- 运行频率: `@hourly`（每小时整点）
- 超时时间: 默认 10 秒（可调整）

---

## 测试流程

### 1. 手动测试

1. **配置 Bark**
   - 打开应用 → 用户菜单 → Notification Settings
   - 启用 Bark Push
   - 填写 Server URL 和 Device Key
   - 点击 "Test Push" 验证配置

2. **添加测试订阅**
   - 创建一个即将到期的订阅
   - 确保 "Enable notifications" 开关已打开
   - Last Payment Date = 今天 - daysBefore 天

3. **等待推送**
   - Scheduled Function 会在下个整点运行
   - 检查 Netlify Function logs 确认执行

### 2. 查看日志

```bash
# Netlify CLI
netlify functions:logs send-scheduled-notifications

# 或在 Netlify Dashboard
Functions → send-scheduled-notifications → Logs
```

---

## 性能与成本

### Netlify Functions

- **免费额度**: 125,000 次/月
- **实际消耗**: 720 次/月（每小时 1 次 × 30 天 × 24 小时）
- **占用率**: 0.58% ✅

### Supabase

- **存储**: ~1 KB/用户（通知设置）
- **查询**: 每小时 1 次（启用 Bark 的用户数）
- **流量**: 极低 ✅

### Bark 推送

- **官方服务**: 免费无限制
- **自托管**: Docker 资源占用极低（<50 MB 内存）

---

## 优势总结

### ✅ 完全离线
- 用户关闭网页也能收到推送
- 后端定时任务 24/7 运行

### ✅ 灵活配置
- 全局 + 订阅双层开关
- 支持官方和自托管 Bark 服务器
- 自定义提前天数（1/3/7/14）

### ✅ 数据安全
- 通知设置存储在云端
- RLS 策略保护用户隐私
- Service Role Key 仅后端使用

### ✅ 零成本运行
- Netlify 和 Supabase 免费额度充足
- 无需额外服务器
- 自动扩展，无需运维

### ✅ 易于部署
- 推送代码自动部署
- 无需手动配置 cron
- 完整的部署文档

---

## 下一步优化建议

### 1. 支持更多推送渠道
- [ ] Telegram Bot
- [ ] Email 通知
- [ ] WebPush（桌面通知）

### 2. 高级功能
- [ ] 自定义推送内容模板
- [ ] 多语言支持
- [ ] 推送历史查看（前端 UI）
- [ ] 推送统计分析

### 3. 性能优化
- [ ] 批量推送优化
- [ ] 推送失败重试机制
- [ ] 用户时区支持

---

## 相关文档

- 📖 [完整部署指南](./NOTIFICATION_DEPLOYMENT_GUIDE.md)
- 🗄️ [数据库架构脚本](../supabase/)
- 🔧 [Netlify Function 源码](../netlify/functions/send-scheduled-notifications.ts)

---

**实现日期**: 2024-01-15
**版本**: v1.10.0
