导航回归验证

目的
通过完整构建 bundle 的目录按钮和实际滚动几何验证 ChatGPT 问题导航。

运行
node scripts/check-navigation.mjs --baseline 保存修复前基线。
node scripts/check-navigation.mjs 保存当前构建结果。

文件
baseline-results.json 保存初始 11 项基线，results.json 保存当前完整结果。重复运行时原报告另存 previous 编号文件。失败截图带 baseline 或 fixed 前缀。
baseline-initial-results.json、baseline-route-results.json 保留编写测试时的早期结果，其中长问题曾使用额外的顶部对齐门槛，最终采用真正顶部可见区。中间 focus 测试曾以卡片外框剩余高度判断内容可见，最终明确选中第一轮并检查实际消息内容的高度与隐藏标记。
profile 和 temp 是独立 D 盘测试状态，可供复现。

范围
覆盖文档与嵌套滚动、长问题内部滚动、DOM 替换、虚拟消息卸载及恢复、丢失反馈、快速点击和取消恢复、退出专注、390px 手机目录收起、重复问题重挂载与回答流式追加、部分窗口中的重复问题及回答归属、根路径新聊天转正式地址、原 DOM 返回复用、原始 pushState 与 back/forward 切换。
全部网络拦截，使用合成聊天和 Chrome API mock。真实网站、账号和服务端虚拟化未在此验证。
