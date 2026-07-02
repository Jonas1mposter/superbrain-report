# AI for Good · 每日观察报告生成器

为「AI for Good」夏令营导师设计的每日观察报告生成工具。输入当日观察记录后，由 Kimi AI 整理为包含「今日高光」「今日卡点」「给家长的建议」的 HTML 海报，并支持导出图片。

## 快速开始

```bash
# 安装依赖
bun install

# 复制环境变量模板并填入你的 Kimi API Key
cp .env.example .env
# 编辑 .env，将 MOONSHOT_API_KEY 替换为真实密钥

# 本地开发
bun dev
```

## 密钥管理（重要：不要泄露 API Key）

本项目只使用一个外部 API 密钥：

- `MOONSHOT_API_KEY` — 调用 Kimi (Moonshot) 大模型生成报告。

### 安全原则

1. **代码中不出现真实密钥**。服务端函数通过 `process.env.MOONSHOT_API_KEY` 读取环境变量，源码里只保留变量名。
2. **不要提交 `.env` 文件**。`.env`、`.env.local`、`.env.*.local` 已加入 `.gitignore`。
3. **本地开发**用 `.env` 文件（已忽略，不会进 Git）。
4. **Lovable 部署**在 Lovable 项目后台的 Secrets 中配置 `MOONSHOT_API_KEY`（当前项目已配置）。
5. **其他平台部署**（Vercel / Cloudflare / 自托管）在对应平台的「Environment Variables」里设置 `MOONSHOT_API_KEY`。

### 开源前检查清单

- [ ] 仓库中不存在 `.env` 文件。
- [ ] 仓库中不存在任何硬编码的 API Key、Secret Token、密码字符串。
- [ ] 已提供 `.env.example` 模板供其他开发者参考。
- [ ] 在 README 中说明如何自行申请并配置 Kimi API Key。

### 如何申请 Kimi API Key

1. 访问 [Moonshot 开放平台](https://platform.moonshot.cn/)。
2. 注册账号并创建 API Key。
3. 将 Key 填入本地 `.env` 或部署平台的环境变量中。

## 技术栈

- [TanStack Start](https://tanstack.com/start/)（React + Vite）
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Kimi (Moonshot)](https://platform.moonshot.cn/) 大模型

## 连接 GitHub

1. 在 Lovable 编辑器中，点击左下角 **+** → **GitHub** → **Connect project**。
2. 授权 Lovable GitHub App。
3. 选择 GitHub 账号/组织，创建仓库。
4. Lovable 会自动双向同步代码到 GitHub。由于密钥保存在 Lovable Secrets 而非代码中，同步到 GitHub 时不会泄露 `MOONSHOT_API_KEY`。

## 本地构建

```bash
bun run build
bun run preview
```

## 贡献

欢迎提交 Issue 或 Pull Request。请确保你的提交不携带任何 `.env` 或敏感密钥文件。
