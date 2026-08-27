# 开发说明

给后续改这个仓库的人：先读本文件，再动 `src/`。产品怎么用见根目录 [README.md](../README.md)。

## 它在做什么

本地 Next 应用，三块能力彼此独立：

1. **游戏工作台**：每个游戏一份 JSON（文案、名单、密钥、草稿）。
2. **发信**：Nodemailer + 用户自己的 SMTP。账号全局一份，不进游戏文件。
3. **AI**：DeepSeek Chat Completions。写信和对话走同一套配置。

没有数据库。持久化全是 `userdata/` 下的 JSON。没有登录、没有云端同步。

## 目录

```
ai-mailer/
  src/app/                 路由与 API
    page.tsx               工作台 /
    history/page.tsx       记录 /history
    ai/page.tsx            AI /ai
    api/games|generate|send|smtp|inbox|settings|chat
  src/components/          页面 UI（studio / history-desk / ai-desk / app-nav）
  src/lib/                 领域逻辑与磁盘存储
  userdata/                用户数据（gitignore，分享前整夹删除）
  docs/DEVELOPMENT.md      本文件
```

类型入口：`src/lib/types.ts`。增删字段先改这里，再改 `store`、对应 API、对应 UI。

## 数据边界（改存储时必须遵守）

| 位置 | 内容 | 是否跟游戏走 |
|------|------|----------------|
| `userdata/games/{id}.json` | 游戏名、概览、邀约、CTA、语气、开发者名字/工作室、额外要求、名单、密钥池、草稿 | 是 |
| `userdata/workspace.json` | 当前打开的游戏 id | 是（指针） |
| `userdata/smtp.json` | 主机、端口、SSL、邮箱账号、授权码 | **否，全局** |
| `userdata/settings.json` | AI 显示名、Key、模型、base URL | **否，全局** |
| `userdata/inbox.json` | 发信历史（可带 gameId / gameName 作标注） | 记录本身全局，可按游戏或邮箱筛 |
| `userdata/chat.json` | AI 对话 | 否，全局 |

读写只通过 `src/lib/store.ts`，不要在 route 里直接 `fs`。

游戏 JSON 里可以有 `senderEmail`（为了和 QQ「发件人 = 登录账号」对齐），但**不要**把授权码/`pass` 写进游戏文件。

## AI 配置优先级

`getAiSettings()`（`store.ts`）：

1. `userdata/settings.json`（AI 页保存的结果）
2. 缺省时回退 `.env.local` 的 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL`
3. 模型与地址的最终默认：`deepseek-v4-pro`、`https://api.deepseek.com`

所有模型调用走 `src/lib/ai.ts` 的 `deepseekChat`。写信：`src/lib/generate.ts`。对话：`/api/chat`。不要再接一套 OpenAI/模板引擎，除非产品明确要求。

当前请求会带 `thinking: { type: "disabled" }`。写信用 `response_format: json_object`，prompt 里必须出现单词 `json`。

## HTTP API

| 方法 | 路径 | 作用 |
|------|------|------|
| GET/POST/PUT/PATCH/DELETE | `/api/games` | 列出 / 保存 / 新建 / 切换当前 / 删除游戏。DELETE 用 `?id=` |
| POST | `/api/generate` | 按当前游戏生成草稿；勾选附密钥时从池中扣除 |
| POST | `/api/send` | 默认 SMTP 真发；`mode: "simulate"` 只写记录。发件人强制为 SMTP 账号 |
| GET/PUT/POST | `/api/smtp` | 读 / 存 / 测试并保存 SMTP |
| GET/DELETE | `/api/inbox` | 历史。`?email=` 按收件人筛；`?id=` 删一封；无 id 则清空 |
| GET/POST | `/api/settings` | 读 / 存 AI 配置 |
| GET/POST/DELETE | `/api/chat` | 读对话 / 发一条 / 清空 |

页面组件用 `fetch` 调这些接口，不在浏览器里直接写磁盘。

## 主路径（写信 → 发出）

```
工作台编辑 GameRecord
  → POST /api/generate（可选分配 keys）
  → 草稿写回该游戏 JSON
  → POST /api/send（from = smtp.user，避免 QQ 501）
  → 追加 userdata/inbox.json
```

密钥：`src/lib/keys.ts`。每行一个，生成时按「人数 × 每封份数」从池里切开。池里不够会 400，不会发明密钥。若模型正文漏了 Key，`generate.ts` 会在文末补上。

名单 CSV：`src/lib/csv.ts`，表头 `email,name,channel,note`。

SMTP 预设：`src/lib/smtp-presets.ts`。QQ 默认 `465` + `secure: true`。

## 改功能时从哪下手

| 你想改的 | 先动 |
|----------|------|
| 游戏表单多一个字段 | `types.ts` 的 `Campaign`/`GameRecord` → `sample.ts` 的 `emptyGame` → `studio.tsx` → 如需进 prompt 则 `generate.ts` |
| 发信行为 / 发件人规则 | `api/send/route.ts`、`lib/mailer.ts` |
| 邮局列表 | `smtp-presets.ts` |
| 模型或 prompt | `lib/ai.ts`、`lib/generate.ts` |
| AI 页 UI | `components/ai-desk.tsx` |
| 历史查询 | `components/history-desk.tsx`、`api/inbox/route.ts` |
| 顶栏导航 | `components/app-nav.tsx` |
| 限额 | `types.ts` 里的 `MAX_*` |

UI 组件在 `src/components/ui/`（shadcn）。不要把业务逻辑塞进 ui 目录。

## 本地约定

- 开发端口：`43217`（见 `package.json` 的 `dev` / `start`）
- 改 Next.js API 或约定：先看 `node_modules/next/dist/docs/`，这份 Next 16 和旧训练数据不一样
- `AGENTS.md` 由 `next dev` 维护，不要手改其中自动块
- 不要把 `userdata/**`、`.env.local`、密钥、授权码提交进 git
- 没有内置文案模板：没有 API Key 就应失败，不要静默拼信

## 已知产品约束

- 个人 `@outlook.com` / `@hotmail.com` 已不支持账号+密码 SMTP；当前实现没有微软 OAuth
- QQ 错误 `501 Mail from address must be same as authorization user`：发件人必须等于 SMTP 用户，send 路径已按账号覆盖 From
- 密钥一旦在生成时从池中扣除，重新生成不会自动退回（避免重复发出同一把 Key）
- 署名只允许一段：模型不得自己签名；`withFooter` 会先剥掉文末名字/工作室/分隔线，再追加一次。生成和发出都走这个函数，避免叠三层签名
