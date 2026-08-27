# userdata（分享前整夹剔除）

本机全部工作数据都在这里，**不要提交 git**（`userdata/*` 已 ignore，仅保留本 README）。

| 文件 / 目录 | 内容 | 范围 |
|-------------|------|------|
| `games/{id}.json` | 游戏文案、博主名单、密钥池、草稿 | 按游戏 |
| `workspace.json` | 当前打开的游戏 id | 全局指针 |
| `smtp.json` | SMTP 主机、端口、邮箱账号、授权码 | 全局，所有游戏共用 |
| `settings.json` | AI 名称、API Key、模型、地址 | 全局 |
| `inbox.json` | 发信历史 | 全局，记录里可带 gameId |
| `chat.json` | AI 页对话 | 全局 |

把项目拷给别人时：删除整个 `userdata` 文件夹。代码仓库里不应带上名单、Steam Key、授权码或 API Key。

读写实现见 `src/lib/store.ts`，说明见 [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)。
