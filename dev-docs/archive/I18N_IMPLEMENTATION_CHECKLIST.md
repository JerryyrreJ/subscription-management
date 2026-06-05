# 多语言改造清单

这份清单用于指导项目的 i18n 改造顺序。目标是先建立稳定骨架，再逐步替换文案，避免一边翻译一边破坏现有逻辑。

## 目标

- 支持至少两种语言：`en`、`zh-CN`
- 保持现有业务数据结构稳定，不因翻译影响数据库或本地存储
- 前端 UI、日期/金额格式、服务端通知文案都能按用户语言工作
- 已登录用户和未登录用户都能记住自己的语言偏好

## 核心原则

- 业务值不翻译：`monthly`、`yearly`、`custom`、货币代码、数据库字段值继续保持原样
- 只翻译展示层：按钮、标题、提示、错误文案、图表标签、通知正文
- 格式化独立处理：日期、货币、数字、复数规则不要写死 `en-US`
- 服务端也纳入范围：定时通知和测试推送不能只做前端翻译
- 允许渐进迁移：可以分阶段替换，不要求一次性改完全部组件

## 实施顺序

### 阶段 1：建立 i18n 基础设施

- 选定唯一 source locale，建议先以当前主界面语言作为基准
- 接入 React i18n 方案，建议 `react-i18next`
- 建立语言资源目录，例如 `src/locales/en`、`src/locales/zh-CN`
- 建立统一 key 命名规则，按模块拆分：
  - `common`
  - `subscription`
  - `dashboard`
  - `notifications`
  - `auth`
  - `settings`
  - `errors`
- 在应用入口注入 i18n provider
- 建立默认语言检测逻辑：
  - 未登录用户优先读 `localStorage`
  - 否则回退到浏览器语言
  - 最后回退到 source locale

### 阶段 2：抽离高频 UI 文案

- 优先改造核心页面和主要弹窗：
  - `src/App.tsx`
  - `src/components/AddSubscriptionModal.tsx`
  - `src/components/EditSubscriptionModal.tsx`
  - `src/components/NotificationSettingsModal.tsx`
  - `src/components/AuthModal.tsx`
  - `src/components/Dashboard.tsx`
- 替换硬编码的：
  - 标题
  - 按钮
  - placeholder
  - 空状态文案
  - loading 文案
  - alert 文案
  - 表单错误提示
- 建立公共映射函数：
  - `getPeriodLabel(period, t)`
  - `getViewModeLabel(viewMode, t)`
  - `getReminderDaysLabel(days, t)`

### 阶段 3：统一格式化层

- 重构日期格式化函数，支持传入 `locale`
- 重构金额格式化函数，支持 `Intl.NumberFormat`
- 处理图表和报表中的月份、周期、统计标签
- 清理项目里写死的 `en-US` 和默认英文月份格式

重点关注：

- `src/utils/dates.ts`
- `src/utils/currency.ts`
- `src/utils/reportAnalytics.ts`
- `src/components/CustomDatePicker.tsx`

### 阶段 4：补齐通知与服务端语言

- 为通知系统增加 `locale` 概念，来源应与用户语言偏好一致
- 前端 Notification Settings 文案接入 i18n
- 服务端通知正文按用户语言生成
- 测试推送与定时推送使用同一套文案生成规则

重点关注：

- `src/utils/barkPush.ts`
- `src/utils/notifications.ts`
- `netlify/functions/send-scheduled-notifications.ts`

### 阶段 5：持久化用户语言偏好

- 未登录用户：保存在本地
- 已登录用户：保存在用户资料表或专用设置表
- 登录后要处理本地语言与云端语言的合并策略
- 如果通知由服务端发送，服务端必须能读取到最终语言偏好

建议规则：

- 云端有值时优先用云端
- 云端无值时用本地值初始化一次

### 阶段 6：扫尾与质量控制

- 检查所有用户可见字符串是否已抽离
- 检查 fallback 是否正常
- 检查长文本在中英文下是否会撑坏布局
- 检查通知文案、图表标签、日期格式是否随语言变化
- 补充最小必要测试

## 不要做的事

- 不要翻译数据库里的 `period`、`currency`、`category id` 等真实值
- 不要把用户输入的订阅名、类别名自动翻译
- 不要在组件里继续新增硬编码文案
- 不要只改前端页面，遗漏服务端通知

## 建议新增的最小能力

- 语言切换入口
- `useI18n` 或统一的 `t()` 使用规范
- 公共格式化工具：
  - `formatDateByLocale`
  - `formatCurrencyByLocale`
  - `formatRelativeReminderText`
- 缺失翻译 key 的开发期告警

## 第一批建议落地范围

如果按风险和收益排序，第一批建议只做下面这些：

- 接入 i18n 基础设施
- 改造 `App` 和 3 到 5 个核心弹窗
- 统一 `period`、日期、金额的显示函数
- 加入语言持久化

先不要在第一批里处理所有次要页面，否则改造面会过大，回归成本也会明显上升。

## 验收标准

- 可以在 `en` 和 `zh-CN` 间切换
- 核心主流程页面不再包含硬编码主要文案
- 日期和金额显示会跟随当前语言
- 服务端通知至少能按用户语言输出 `en` / `zh-CN`
- 登录前后语言偏好不会丢失
