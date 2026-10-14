# 本地定制修改

本版本为 `2026.10.5`，基于 [AnDaoCc/GPT-Chat-Navigation-Bar](https://github.com/AnDaoCc/GPT-Chat-Navigation-Bar) 的提交 `73ad3c0f3a1066463fd300e07eae9c32c686e778`。修改维护者：`yuanyi5453-oss`。

## 多站点支持

新增 Gemini、Grok、DeepSeek，沿用 ChatGPT 的阅读、导出、收藏和设置界面。新增 `chatSites.ts` 维护限定域名、原生消息、输入框和容器选择器；`siteAdapters.ts` 以明确角色解析消息。公共容器 ID 不再被当作单条消息 ID，重复问题保持独立条目；流式回答保留原锚点。专注模式隐藏的消息仍保留在索引中。

Gemini 的自定义元素、Grok 的消息气泡及 DeepSeek 的原生消息内容采用独立规则。DeepSeek 的 `.fbb737a4` 是会随站点构建变化的类名，需结合未来现场反馈维护。目录、代码、表格和引用不再要求外层必须有 `main` 标签。ChatGPT 的远程兼容规则只在 ChatGPT 上运行，Canvas 定位也保持 ChatGPT 范围。

弹窗显示当前站点名称，导出文件前缀使用对应站点。页面状态请求即时识别当前对话，避免弹窗早于第一次后台扫描时错误地保持未连接状态。修正缺失序号属性被转换为数字 0 的问题。

参考的公开 DOM 资料：[Gemini / Grok DOM Reference](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md)、[Grok 气泡结构记录](https://github.com/orezeno22/ai-prompts-toc)、[DeepSeek 消息结构说明](https://github.com/NIyueeE/deepseek-user-message-renderer)。本次没有把这些第三方资料当作网站现场验证。

## 问题目录

- 点击目录定位到对应问题；若处于专注模式，先退出并恢复完整对话。
- 专注阅读是独立的可选入口。
- 本地抽取标题时过滤 URL、附件大小/类型、上传状态和链接说明，识别被网页合并到同一行的编号段落。
- 示例：`回稿-Part2-nesting-function 1、链接中是本次回稿的资料…` → `Part2 nesting function 回稿`。
- 保留技术标识符、参数和否定约束；不调用外部模型，不改写消息正文。复杂多主题问题的语义归纳仍受规则抽取能力限制。
- 序号与标题同行，标题最多显示两行；悬停查看完整问题。
- 目录来自当前页面已加载的消息。安装前的对话在重新打开后也可索引；尚未加载的历史消息不保证出现。

## 输入框宽度

在“显示 → 聊天排版 → 输入框宽度”中设置 70%–140%；100% 恢复页面默认布局。

2026.10.3 将输入框假定为 `main form:has(#prompt-textarea)`。这个结构限制过窄：输入框位于 main 外、没有 form 或可见外框在 form 内时，设置可能无效。2026.10.4 从实际编辑器查找可见外框，再给该外框及专属祖先添加明确标记；CSS 与 JavaScript 使用同一组目标。

- 从外框的原生宽度计算比例，每次测量前撤销旧比例，避免反复放大。
- 解除专属祖先的限宽，不要求特定 Tailwind 类名；只在外框应用目标宽度。
- 避免把 Canvas、历史消息编辑区或扩展自身当作输入框；附件中的 `role=document` 不会误伤整个输入区。
- 窗口尺寸、布局宿主宽度、目录状态或编辑器 DOM 变化后重新测量。
- 100% 清理所有新增布局标记；保留页面原有 inline style。

## 验证与边界

TypeScript 检查、源码测试和构建均需要通过。源码测试覆盖标题失败例及多种输入框结构；浏览器验证运行真实构建 JavaScript 和 CSS，模拟 Chrome storage 事件检查实际尺寸变化。具体运行记录见 `validation/README.md`。

浏览器检查使用本地合成页面。当前环境未能连接用户已登录的 ChatGPT 标签页，因此没有把合成页面通过等同于真实网站验收。更新扩展后仍需刷新已有 ChatGPT 页面，以替换旧 content script。

## 版本记录

- 2026.10.5：支持 ChatGPT、Gemini、Grok、DeepSeek；修正跨站点消息身份、容器定位、连接提示和输入框识别。
- 2026.10.4：清理目录杂项，调整目录行排版，重做输入框定位与布局目标标记。
- 2026.10.3：新增输入框宽度设置；后续用户反馈实际页面未生效。
- 2026.10.2：目录普通跳转、可选专注阅读、本地短标题。
- 2026.10.1：右侧停靠时为聊天内容留出空间并重新居中。
- 2026.10.0：原始上游版本。
