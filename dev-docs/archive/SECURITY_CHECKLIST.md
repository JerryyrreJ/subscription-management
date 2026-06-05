# 安全检查清单

在提交代码到GitHub之前，请确保完成以下检查：

## ✅ 已保护的敏感文件

以下文件/目录已被 `.gitignore` 忽略，**永远不会**被提交到git：

### 环境变量文件
- ✅ `.env` - 本地环境变量
- ✅ `.env.local` - 本地开发环境
- ✅ `.env.development` - 开发环境
- ✅ `.env.production` - 生产环境
- ✅ `.env.test` - 测试环境
- ✅ `.env*.local` - 所有本地环境文件

### Netlify相关
- ✅ `.netlify/` - Netlify本地构建缓存和状态

### 临时和备份文件
- ✅ `*.tmp`, `*.temp` - 临时文件
- ✅ `*.bak`, `*.backup` - 备份文件
- ✅ `*.swp`, `*.swo`, `*~` - 编辑器临时文件

---

## 🔐 敏感信息清单

### 绝对不能提交的内容：

#### Stripe密钥
- ❌ `STRIPE_SECRET_KEY` (sk_test_* 或 sk_live_*)
- ❌ `STRIPE_WEBHOOK_SECRET` (whsec_*)

#### Supabase密钥
- ❌ `VITE_SUPABASE_ANON_KEY` - 虽然名字叫"anon"，但仍建议不公开
- ❌ 任何service_role密钥（如果有）

### 可以公开的内容：

#### Stripe
- ✅ `VITE_STRIPE_PUBLISHABLE_KEY` (pk_test_* 或 pk_live_*)
  - 这个密钥设计就是给前端用的，可以公开
- ✅ `VITE_STRIPE_PRICE_ID` (price_*)
  - 产品价格ID，可以公开

#### Supabase
- ✅ `VITE_SUPABASE_URL` - 项目URL
- ⚠️ `VITE_SUPABASE_ANON_KEY` - 技术上可以公开，但建议环境变量

---

## 📋 提交前检查清单

### 1. 检查暂存区
```bash
git status
```

确保没有以下文件：
- [ ] `.env` 文件
- [ ] 任何包含密钥的文件
- [ ] `.netlify/` 目录

### 2. 搜索敏感信息
```bash
# 搜索Stripe密钥
git grep -i "sk_test_"
git grep -i "sk_live_"
git grep -i "whsec_"

# 搜索Supabase密钥
git grep -i "service_role"
```

如果有任何输出，**立即停止**并删除这些内容！

### 3. 检查提交历史
```bash
# 查看最近的提交
git log --oneline -10

# 查看具体提交的内容
git show <commit-hash>
```

### 4. 验证.gitignore
```bash
# 测试特定文件是否被忽略
git check-ignore -v .env
git check-ignore -v .env.local
```

应该看到类似输出：
```
.gitignore:16:.env	.env
```

---

## 🚨 如果不小心提交了密钥怎么办？

### 立即行动步骤：

#### 1. 吊销所有泄露的密钥
- **Stripe**: 进入Dashboard → Developers → API keys → Roll（重新生成）
- **Supabase**: 进入Project Settings → API → 重置密钥

#### 2. 从Git历史中删除（如果还没push）
```bash
# 撤销最近的提交（保留修改）
git reset --soft HEAD~1

# 或完全撤销（丢弃修改）
git reset --hard HEAD~1
```

#### 3. 如果已经push到GitHub
```bash
# 使用git filter-branch删除敏感信息（危险操作！）
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# 强制推送
git push origin --force --all
```

⚠️ **更好的方案**：删除整个仓库，重新创建！

---

## 🛡️ 最佳实践

### 开发环境
1. ✅ 始终使用 `.env` 文件存储密钥
2. ✅ 使用 `.env.example` 作为模板（不包含实际值）
3. ✅ 在README中说明需要配置的环境变量

### 生产环境
1. ✅ 使用Netlify Dashboard配置环境变量
2. ✅ 定期轮换密钥
3. ✅ 使用测试环境密钥进行开发

### 代码审查
1. ✅ 提交前使用 `git diff` 检查变更
2. ✅ 使用pre-commit hooks自动检查
3. ✅ 团队协作时，互相审查代码

---

## 🔍 自动检查工具（可选）

### 安装git-secrets
```bash
# macOS
brew install git-secrets

# 配置
cd your-repo
git secrets --install
git secrets --register-aws
```

### 创建pre-commit hook
创建 `.git/hooks/pre-commit`：
```bash
#!/bin/bash

# 检查是否有环境变量文件
if git diff --cached --name-only | grep -E "^\.env$|^\.env\..*$"; then
    echo "❌ 错误: 不允许提交.env文件！"
    exit 1
fi

# 检查是否有密钥
if git diff --cached | grep -E "sk_live_|sk_test_|whsec_"; then
    echo "❌ 错误: 检测到Stripe密钥！"
    exit 1
fi

exit 0
```

---

## 📚 参考资料

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Stripe: API keys best practices](https://stripe.com/docs/keys#safe-keys)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

## ✅ 最终检查

在 `git push` 之前：

```bash
# 1. 查看将要提交的文件
git status

# 2. 查看具体变更
git diff --cached

# 3. 确认.gitignore工作正常
git check-ignore .env

# 4. 搜索敏感信息
git grep -i "sk_" HEAD

# 5. 确认无误后推送
git push
```

---

## 🎯 当前项目状态

### ✅ 已正确配置：
- [x] `.gitignore` 包含所有敏感文件
- [x] `.env.example` 作为模板（不含实际值）
- [x] 所有密钥通过环境变量传递
- [x] 代码中没有硬编码的密钥

### ✅ 可以安全提交：
- [x] `src/` 目录下的所有源代码
- [x] `netlify/functions/` 目录（Serverless函数代码）
- [x] `netlify.toml` 配置文件
- [x] `.env.example` 示例文件
- [x] 文档文件（*.md）

### ❌ 永远不要提交：
- [ ] `.env` 或 `.env.local`
- [ ] 任何包含 `sk_test_`, `sk_live_`, `whsec_` 的文件
- [ ] `.netlify/` 目录
- [ ] 备份文件

---

记住：**一旦密钥泄露，立即重新生成！** 🔐
