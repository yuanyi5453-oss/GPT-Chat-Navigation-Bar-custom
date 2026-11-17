# 导航修复版本验证记录

当前版本：2026.11.1（2026-V12 导航修复版）。

- TypeScript 与构建通过；源码测试 96/96 通过，其中标题抽取 26 项。
- Chrome 导航回归 16/16 场景通过，见 `navigation/results.json`。覆盖真正的滚动位置、DOM 重挂载、有限恢复和失败提示、连续点击取消、专注阅读、390 px 窄屏、重复问题与部分虚拟窗口归属、项目内/普通聊天切换、新建聊天和浏览器前进后退。
- 四站点完整 bundle 检查 72/72 通过，见 `multi-site/results.json`。
- 最终 content bundle SHA-256：`0346393f637625ad6dd02ecb56b123d3e82446f4e719c00f0b487b270b9c3f9e`。

修复前 2026.10.5 在专项基线 11 项中仅 5 项通过，见 `navigation/baseline-results.json`。之后根据复查新增了异步取消、部分重复窗口、回答归属及路由复用场景；最终场景总数为 16，不能把两个分母直接作百分比比较。

本轮使用 Computer Use 只读观察到用户旧版 Chrome 目录有重复和标题截断。修复后的验证使用独立 D 盘浏览器 profile、人工合成聊天、模拟 Chrome API 和网络全拦截；尚未在用户真实登录对话中现场验收。不把服务器未加载的历史消息算作已经覆盖。

复现：`npm run typecheck`、`npm test`、`npm run build`、`npm run test:navigation`、`npm run test:browser`。只发布合成验证报告，不发布浏览器 profile、临时缓存或真实聊天内容。

以下保留原版本记录；其中旧版 `multi-site/results.json` 可在对应 GitHub 历史提交查阅，本地亦保留在 `multi-site/previous-release/`。

---

# 多站点版本验证记录

版本：2026.10.5（2026-V11 多站点版）。

- TypeScript `tsc --noEmit`：通过。
- 源码测试：84/84 通过，其中 13 项新增站点适配测试。
- Chrome 完整 bundle 合成页面检查：72/72 通过，每站点 18 项。
- 构建：通过。完整结果见 `multi-site/results.json`，界面截图位于同目录。

浏览器检查在隔离的 D 盘测试 profile 中执行真实打包 JavaScript/CSS，Chrome 消息和存储接口由测试模拟；网络请求全部拦截为人工合成页面。未进入用户已登录的真实网站，也未把本地页面通过当作现场验收。

覆盖 ChatGPT、Gemini、Grok、DeepSeek：角色识别、重复问题独立锚点、流式更新、目录、完整导出、代码、表格、外部引用、连接名称、三个工具入口、专注模式保留完整索引、输入框 120% 与恢复 100%、聊天字号及 390 px 窄屏不横向溢出。Gemini 和 DeepSeek 测试页面没有 main 标签。另检查隐藏消息、侧边栏及草稿不被索引，站点访问仅限已列出的聊天域名。

真实网站 DOM 可能改变，尤其 DeepSeek 的哈希类名不属于稳定接口。长对话只处理当前页面已加载的消息；不保证未加载或被网站回收的历史内容。Canvas 保持 ChatGPT 专属范围。

复现：先执行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`，再执行 `npm run test:browser`。需要已安装 Chrome；可用 `CHROME_PATH` 指定可执行文件。测试 profile 和 temp 目录不应提交。

以下保留 2026.10.4 的原版验证记录。

---

# 验证记录

版本：2026.10.4。

- TypeScript `tsc --noEmit`：通过。
- 源码测试：71/71 通过。
- 实际 bundle 专项检查：50/50 通过，其中 JSDOM 14 项、Chrome 桌面 32 项、窄屏 4 项。
- 构建：通过；安装产物 11 个文件均已逐个比对 SHA-256。

Chrome 本地合成页面执行完整的打包 JavaScript 和 CSS，模拟扩展存储接口，真实运行 DOM 观察、编辑器定位和布局测量。未在用户登录的 ChatGPT 标签页上验收。

覆盖 main 外、无 form、form 内无按钮视觉外壳、没有 prompt-textarea id 的 unified 编辑器及含 role=document 附件的输入框；包括 Canvas 和已有消息的排除、窗口变化、DOM 替换和恢复默认。

桌面原生输入框 720 px，120% 为 864 px，80% 为 576 px，恢复默认为 720 px。窄屏不发生横向溢出。

2026.10.3 的旧检查主要使用 main/form 结构，Chrome 中还模拟了宽度测量状态，未覆盖本次发现的定位缺口。因此旧检查通过没有证明真实页面可用；本轮已改为 Chrome 执行完整 bundle。

## 复现

先执行 `npm ci`、`npm run build`，再运行：

```bash
node validation/check_composer_runtime.cjs
```

该浏览器验证脚本面向 Windows，使用已安装的 Chrome；脚本会在 validation 内生成临时 profile 和结果。源码目录可用 CNAV_SOURCE_ROOT 指定。源码测试使用 `npm test`。

当前实际 bundle 的 SHA-256：`dc3ec8dbfca6dd29797674df200ead2cb8f6a09241a869625fc24be47e3548a8`。
