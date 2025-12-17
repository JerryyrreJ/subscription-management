#!/bin/bash

# 本地测试 Netlify Scheduled Function
# 用法: ./scripts/test-notifications-local.sh

echo "🧪 测试 Netlify Scheduled Function"
echo "=================================="
echo ""

# 检查是否存在 .env.local
if [ ! -f .env.local ]; then
  echo "❌ 错误: 未找到 .env.local 文件"
  echo "请创建 .env.local 文件并添加必需的环境变量"
  exit 1
fi

# 检查 SUPABASE_SERVICE_ROLE_KEY
if ! grep -q "SUPABASE_SERVICE_ROLE_KEY" .env.local; then
  echo "⚠️  警告: .env.local 中缺少 SUPABASE_SERVICE_ROLE_KEY"
  echo ""
  echo "请添加以下行到 .env.local:"
  echo "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here"
  echo ""
  echo "获取 Service Role Key:"
  echo "1. 登录 Supabase Dashboard"
  echo "2. Settings → API"
  echo "3. 复制 'service_role' key (不是 anon key)"
  echo ""
  read -p "是否继续测试? (y/n): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "📋 测试方法选择:"
echo "1. 快速测试 (需要先运行 netlify dev)"
echo "2. 启动完整开发环境 (自动启动 netlify dev)"
echo ""
read -p "请选择 (1/2): " -n 1 -r
echo ""

if [[ $REPLY == "1" ]]; then
  echo ""
  echo "方法 1: 使用 netlify functions:invoke"
  echo "-----------------------------------"
  echo "⚠️  确保你已在另一个终端运行: netlify dev"
  echo ""
  read -p "是否已启动 netlify dev? (y/n): " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "请先在另一个终端运行: netlify dev"
    echo "然后重新运行此脚本"
    exit 1
  fi

  netlify functions:invoke send-scheduled-notifications --no-identity

elif [[ $REPLY == "2" ]]; then
  echo ""
  echo "方法 2: 启动完整开发环境"
  echo "-----------------------------------"
  echo "将启动 netlify dev，按 Ctrl+C 退出后可以查看日志"
  echo ""
  read -p "按 Enter 继续..."

  # 在后台启动 netlify dev
  echo "启动开发服务器..."
  netlify dev > /tmp/netlify-dev.log 2>&1 &
  NETLIFY_PID=$!

  # 等待服务器启动
  echo "等待服务器启动 (10秒)..."
  sleep 10

  # 调用函数
  echo ""
  echo "调用通知函数..."
  netlify functions:invoke send-scheduled-notifications --no-identity

  # 停止服务器
  echo ""
  echo "停止开发服务器..."
  kill $NETLIFY_PID 2>/dev/null

  # 等待进程退出
  sleep 3

  # 强制清理所有相关进程（防止僵尸进程）
  echo "清理相关进程..."
  pkill -f "netlify dev" 2>/dev/null || true

  # 显示日志
  echo ""
  echo "开发服务器日志:"
  echo "-----------------------------------"
  tail -n 50 /tmp/netlify-dev.log

else
  echo "无效选择"
  exit 1
fi

echo ""
echo "✅ 测试完成"
echo ""
echo "如果看到错误，请检查:"
echo "1. .env.local 中的环境变量是否正确"
echo "2. Supabase 数据库表是否已创建"
echo "3. 用户是否已配置 Bark 通知设置"
echo ""

