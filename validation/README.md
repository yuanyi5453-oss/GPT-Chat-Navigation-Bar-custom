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
