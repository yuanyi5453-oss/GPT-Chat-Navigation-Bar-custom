# GPT页面增强工具 — 多站点定制版

为 ChatGPT、Gemini、Grok、DeepSeek 网页增加右侧问题目录、聊天排版、输入框宽度调整和阅读工具。当前版本 **2026.10.5**（2026-V11 多站点版）。

## 支持的网站

| 站点 | 适用地址 |
|---|---|
| ChatGPT | `chatgpt.com`、`chat.openai.com` |
| Gemini | `gemini.google.com` |
| Grok | `grok.com` |
| DeepSeek | `chat.deepseek.com` |

上述网页支持已加载对话的问题目录、专注阅读、选择性导出、引用管理、素材收藏、聊天排版和输入框宽度设置。扩展根据各站点自己的消息结构判断角色，不按消息奇偶顺序猜测。Canvas 排版继续仅用于 ChatGPT；不包含桌面客户端、手机 App、API 控制台或 X 内嵌 Grok。

基于 [AnDaoCc/GPT-Chat-Navigation-Bar](https://github.com/AnDaoCc/GPT-Chat-Navigation-Bar)，原作者为 AnDaoCc。本仓库由 yuanyi5453-oss 保存和维护定制改动；来源、原说明与修改范围分别见 [上游声明](docs/UPSTREAM_NOTICE.md)、[原 README](docs/UPSTREAM_README.md) 和 [修改说明](docs/CUSTOM_CHANGES.md)。

## 安装及更新

1. 下载本仓库 ZIP 并解压到一个会长期保留的目录。
2. 在 Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择仓库内的 `extension/` 目录。
4. 打开支持的网站中的一段对话，并刷新页面。

已经安装本修改版时，把新版 `extension/` 的文件更新到原来加载的目录，然后在扩展管理页点击“重新加载”，再刷新各站点的对话标签页。版本号应为 `2026.10.5`。本版新增 Gemini、Grok、DeepSeek 的网站访问范围；Chrome 如提示新的站点访问权限，需允许相应站点。

`packages/` 中还提供独立的已解压扩展 ZIP，可直接解压安装。

弹窗显示“已连接 Gemini”等当前站点名称时，页内工具可用。如果按钮为灰色，保持支持的对话标签页为当前页面，刷新它后重新打开扩展。仍未识别时应检查站点访问权限和页面结构。

## 使用

- 从页面“阅读工具”打开右侧问题目录；点击标题跳转到该轮问题。
- “专注阅读（可选）”需要单独开启。
- 扩展图标 → 显示 → 聊天排版：可调整正文和底部输入框的宽度。
- 输入框宽度范围为 **70%–140%**；100% 恢复页面默认。松开滑块或提交数值后自动保存。
- 目录标题在本地抽取，清理链接、编号说明和附件元数据；悬停可查看完整问题。

旧对话只要在当前页面加载出来即可生成目录。标题处理不调用外部模型或上传聊天正文。上游的素材、导出和引用功能保留。

## 开发与构建

需要 Node.js 和 npm：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

构建产物位于 `dist/`。开发时可直接让 Chrome 加载 `dist/`；本仓库的 `extension/` 是已验证的发布快照。

源码位于 `src/`，测试位于 `tests/`。站点注册和容器定位在 `src/chatSites.ts`，新站点消息解析在 `src/siteAdapters.ts`，ChatGPT 原适配继续位于 `src/chatGptAdapter.ts`。输入框定位在 `src/composerLayout.ts`，目录标题抽取在 `src/questionTitle.ts`。

安装本机 Chrome 后可运行 `npm run test:browser`，用完整构建脚本检查四站点的合成页面。Chrome 不在标准位置时设置 `CHROME_PATH`。测试结果和专属临时浏览器资料均位于 `validation/multi-site/`。

## 验证及恢复

检查记录见 [validation/README.md](validation/README.md)。当前源码测试和完整 bundle 的合成浏览器检查通过；这些检查不是用户已登录网页的现场验收。各站点可能更新 DOM，长对话也可能只加载部分消息。本版只索引当前页面已经加载、能够识别的内容，不承诺完整服务器历史。

恢复页面默认输入框宽度可把设置改为 100%。恢复整个扩展版本可从 GitHub 历史提交取回旧 `extension/`，重新加载并刷新页面；也可暂时停用扩展后刷新。

发布内容只包含源码、说明、构建产物和合成验证资料，不包含本机浏览器资料、聊天记录、依赖缓存或登录凭据。
