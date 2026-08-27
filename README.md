# 试玩邀

给独立游戏开发者用的本地邀约台：按「游戏」管理资料与博主名单，用 DeepSeek 写成试玩邀请，再通过你自己的 QQ / Gmail 等 SMTP 发出。

本工具只在本机跑，不是邮件代理，也不会登录网页版邮箱。对方看到的发件人就是你的真实邮箱。

## 启动

工作目录是内层 `ai-mailer/`（含 `package.json` 的那一层）：

```bash
cd ai-mailer
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:43217](http://127.0.0.1:43217)。

开发端口固定为 `43217`，绑定 `0.0.0.0`。

## 页面

| 路径 | 作用 |
|------|------|
| `/` 工作台 | 按游戏编辑资料、名单、密钥、草稿并发信 |
| `/history` 记录 | 全部发信历史；可按博主邮箱查询、单封删除、清空 |
| `/ai` AI | DeepSeek 名称 / 模型 / 地址 / API Key；简易对话 |

首次使用：先到 **AI** 页保存 Key（已预填 `deepseek-v4-pro`）。也可把 Key 写在 `.env.local`，AI 页会读到。

## 发信（SMTP）

第 4 步默认从你的邮箱真发。账号和授权码**不属于某个游戏**，保存在 `userdata/smtp.json`，所有游戏共用。

QQ 邮箱对照：

| 项 | 值 |
|----|-----|
| 主机 | `smtp.qq.com` |
| 端口 | `465`（勾选 SMTPS）或 `587` |
| 账号 | 完整 QQ 邮箱 |
| 密码 | 网页设置里生成的**授权码**，不是 QQ 登录密码 |

QQ 要求发件人必须和登录账号完全一致。第 1 步不要留示例邮箱。

Gmail：`smtp.gmail.com` / `587`，密码用 16 位应用专用密码。个人 Outlook.com 目前不能用「账号 + 密码」SMTP，不要硬填。

## 用户数据

全部个人数据在 [`userdata/`](userdata/README.md)，已加入 `.gitignore`。

分享或开源前：**删掉整个 `userdata/`**。只保留其中的 `README.md`。

旧版曾用过 `.data/`，已废弃，不要再往里面写。

## 限制

- 单次名单最多 80 人
- 真发单次最多 40 封
- 密钥池最多 500 个

## 开发

架构、API、数据边界和改代码入口见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

技术栈：Next.js 16 App Router、React 19、Tailwind CSS 4、shadcn/ui、Nodemailer。Next.js 本机文档在 `node_modules/next/dist/docs/`。
