# 订阅通知系统部署指南

## 功能概述

这个订阅管理应用现在支持**完全离线的 Bark 推送通知**：
- ✅ 用户关闭网页也能收到推送
- ✅ 后端定时任务自动运行（Netlify Scheduled Function）
- ✅ 每个订阅独立控制是否接收通知
- ✅ 支持官方 Bark 服务器或自托管 Docker 版本

---

## 部署步骤

### 第 1 步：数据库架构更新

在 Supabase Dashboard 中执行以下 SQL 脚本：

#### 1.1 为订阅表添加通知字段

```sql
-- 文件位置: supabase/01_add_notification_enabled.sql

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_subscriptions_notification_enabled
ON subscriptions(notification_enabled);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_notification
ON subscriptions(user_id, notification_enabled);

COMMENT ON COLUMN subscriptions.notification_enabled IS '是否为该订阅启用通知提醒（默认 true）';
```

#### 1.2 创建通知设置表

```sql
-- 文件位置: supabase/02_create_notification_settings.sql

CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bark Push Settings
  bark_enabled BOOLEAN DEFAULT false,
  bark_server_url TEXT DEFAULT 'https://api.day.app',
  bark_device_key TEXT DEFAULT '',
  bark_days_before INTEGER DEFAULT 3,
  bark_history JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id
ON user_notification_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_settings_bark_enabled
ON user_notification_settings(bark_enabled)
WHERE bark_enabled = true;

-- 启用 RLS
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;

-- 用户策略
CREATE POLICY "Users can view their own notification settings"
  ON user_notification_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings"
  ON user_notification_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
  ON user_notification_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification settings"
  ON user_notification_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- 服务角色策略（重要！）
CREATE POLICY "Service role can read all notification settings"
  ON user_notification_settings
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can update all notification settings"
  ON user_notification_settings
  FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON user_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_settings_updated_at();

-- 注释
COMMENT ON TABLE user_notification_settings IS '用户通知设置表（简化版 - 只保留 Bark 推送）';
COMMENT ON COLUMN user_notification_settings.bark_history IS '存储已发送推送的记录，格式: {"subscription_id": "2024-01-01T00:00:00.000Z"}';
```

---

### 第 2 步：获取 Supabase Service Role Key

⚠️ **重要**：Scheduled Function 需要使用 Service Role Key 来绕过 RLS 读取所有用户数据。

1. 登录 Supabase Dashboard
2. 进入项目设置 → API
3. 找到 **Project API keys** 部分
4. 复制 `service_role` secret key（**不是 anon public key**）

⚠️ **安全提示**：
- Service Role Key 拥有完全权限，请妥善保管
- **永远不要**将它提交到 Git 仓库
- 只在服务器端（Netlify Functions）使用

---

### 第 3 步：配置环境变量

在 **Netlify Dashboard** 中配置以下环境变量：

```env
# Supabase 配置（前端和后端都需要）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Supabase Service Role Key（仅后端使用）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**配置步骤**：
1. Netlify Dashboard → 选择你的项目
2. Site settings → Environment variables
3. 点击 "Add a variable"
4. 添加上述三个环境变量

---

### 第 4 步：配置 netlify.toml

⚠️ **关键步骤**：必须在 `netlify.toml` 中明确声明 Scheduled Function。

在项目根目录的 `netlify.toml` 文件末尾添加以下配置：

```toml
# Scheduled Functions
# Docs: https://docs.netlify.com/functions/scheduled-functions/
[[functions]]
  # Path to the function (relative to functions directory)
  path = "send-scheduled-notifications"

  # Schedule (runs every hour at minute 0)
  # Format: "minute hour day month weekday"
  # @hourly = "0 * * * *"
  schedule = "0 * * * *"
```

**为什么需要这一步？**
- Netlify 不会自动检测 scheduled functions
- 虽然代码中导出了 `config.schedule`，但这种方式已过时
- **必须**在 `netlify.toml` 中配置才能启用定时任务

---

### 第 5 步：部署到 Netlify

#### 5.1 推送代码到 Git

```bash
git add .
git commit -m "feat: add scheduled Bark notification system"
git push origin main
```

#### 5.2 Netlify 自动部署

Netlify 会自动构建并部署你的应用和 Scheduled Function。

#### 5.3 验证部署

1. 登录 Netlify Dashboard
2. 进入你的项目 → Functions
3. 查看 `send-scheduled-notifications` 函数
4. 确认状态为 **Scheduled** 且运行频率为 **@hourly** 或 **0 * * * ***
5. 等待一小时后检查 Function logs，应该看到执行记录

---

### 第 6 步：测试通知系统

#### 6.1 在应用中配置 Bark

1. 打开你的订阅管理应用
2. 点击右上角用户菜单 → **Notification Settings**
3. 启用 **Bark Push Notifications**
4. 填写配置：
   - Server URL: `https://api.day.app`（或你的自托管地址）
   - Device Key: 从 Bark iOS App 获取
   - Days Before: 选择提前几天提醒（1/3/7/14）
5. 点击 **Test Push** 测试是否成功
6. 保存设置

#### 6.2 添加测试订阅

1. 添加一个即将到期的订阅：
   - Name: Test Subscription
   - Last Payment Date: 设置为 N 天前（N = 你设置的提前天数）
   - ✅ **确保 "Enable notifications" 开关已打开**

#### 6.3 等待推送

- Scheduled Function 每小时整点运行一次
- 第一次运行可能需要等待最多 1 小时
- 查看 Netlify Function logs 确认执行情况

---

## 使用 Docker 自托管 Bark 服务器

如果你想使用自己的 Bark 服务器（数据隐私或离线环境）：

### Docker 部署

```bash
docker run -d --name bark-server \
  -p 8080:8080 \
  finb/bark-server:latest
```

### 配置应用

在通知设置中填写：
- Server URL: `http://your-server-ip:8080`（公网访问）
- Server URL: `http://192.168.x.x:8080`（内网访问）

---

## 系统架构

```
用户设置通知
    ↓
保存到 Supabase（user_notification_settings 表）
    ↓
Netlify Scheduled Function（每小时运行）
    ├─ 查询所有启用了 Bark 的用户
    ├─ 遍历用户的订阅（仅 notification_enabled=true）
    ├─ 计算距离到期天数
    ├─ 如果 = daysBefore && 今天未推送
    │   └─ 调用 Bark API 发送推送
    └─ 更新 bark_history 记录
    ↓
推送到用户 iOS 设备 📱
```

---

## 常见问题

### Q1: 为什么没有收到推送？

**检查清单**：
1. ✅ **netlify.toml 中已配置 scheduled function**（最常见问题！）
2. ✅ Bark 全局开关已启用
3. ✅ 订阅的 "Enable notifications" 开关已打开
4. ✅ Device Key 配置正确
5. ✅ 距离到期天数 = 你设置的提前天数
6. ✅ Netlify Function 正常运行（查看 logs）
7. ✅ 今天是否已经推送过（每个订阅每天只推送一次）
8. ✅ 环境变量 SUPABASE_SERVICE_ROLE_KEY 已配置

**快速诊断**：运行诊断脚本
```bash
node scripts/diagnose-notifications.js
```

### Q2: 如何查看 Scheduled Function 运行日志？

1. Netlify Dashboard → Functions
2. 点击 `send-scheduled-notifications`
3. 查看 **Function logs** 标签页

### Q3: 可以自定义推送频率吗？

可以！修改 `netlify.toml` 中的 schedule 配置：

```toml
[[functions]]
  path = "send-scheduled-notifications"
  schedule = "0 * * * *"        # 每小时（默认）
  # schedule = "0 8,20 * * *"   # 每天 8:00 和 20:00
  # schedule = "0 */2 * * *"    # 每 2 小时
  # schedule = "*/30 * * * *"   # 每 30 分钟
```

修改后需要重新部署才能生效。

### Q4: Service Role Key 泄露了怎么办？

立即在 Supabase Dashboard 中重新生成新的 Service Role Key，并更新 Netlify 环境变量。

### Q5: 支持 Android 推送吗？

目前仅支持 Bark（iOS）。如需 Android 支持，可以集成其他推送服务（如 FCM、Gotify 等）。

---

## 费用估算

### Netlify Functions

- **免费额度**: 每月 125,000 次函数调用
- **实际用量**: 假设 100 用户，每小时 1 次 = 720 次/月
- **结论**: 完全在免费额度内 ✅

### Supabase

- **免费额度**: 500 MB 数据库，50,000 每月活跃用户
- **实际用量**: 通知设置表非常轻量（<1 KB/用户）
- **结论**: 完全在免费额度内 ✅

---

## 技术细节

### 去重逻辑

通过 `bark_history` 字段存储推送记录：

```json
{
  "subscription-id-1": "2024-01-15T08:00:00Z",
  "subscription-id-2": "2024-01-14T08:00:00Z"
}
```

检查逻辑：
```typescript
const todayStr = new Date().toDateString()
const lastPushStr = new Date(history[subId]).toDateString()
if (todayStr === lastPushStr) {
  return // 今天已推送，跳过
}
```

### 历史记录清理

每次运行时自动清理 30 天前的记录，防止 JSONB 字段过大。

---

## 贡献者

如有问题或建议，请提交 Issue 或 Pull Request。

---

**最后更新**: 2024-01-15
