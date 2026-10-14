// 非 ChatGPT 站点只调整已识别消息，保留导航、编辑器和宿主页的其他布局。
export const MULTI_SITE_CHAT_CSS = `
  html[data-cnav-site]:not([data-cnav-site="chatgpt"]) [data-cnav-message-role],
  html[data-cnav-site]:not([data-cnav-site="chatgpt"]) [data-cnav-message-role] :where(p,li,span,strong,em,blockquote,h1,h2,h3,h4,h5,h6) {
    font-size: var(--cnav-chat-font-size, 1rem) !important;
    letter-spacing: var(--cnav-chat-letter-spacing, 0px) !important;
    line-height: var(--cnav-chat-line-height, 1.55) !important;
  }
  html[data-cnav-site]:not([data-cnav-site="chatgpt"]) [data-cnav-message-role] :where(p,li) {
    margin-block: var(--cnav-chat-paragraph-gap, 0.44em) !important;
  }
  html[data-cnav-site]:not([data-cnav-site="chatgpt"]) [data-cnav-message-role] :where(pre,code) {
    font-size: var(--cnav-chat-code-size, 0.94rem) !important;
    letter-spacing: var(--cnav-chat-code-letter-spacing, 0px) !important;
    line-height: var(--cnav-chat-code-line-height, 1.46) !important;
  }
  html[data-cnav-wide-thread="true"][data-cnav-site]:not([data-cnav-site="chatgpt"]) [data-cnav-message-role] {
    box-sizing: border-box !important;
    width: min(var(--cnav-thread-width), 100%) !important;
    max-width: var(--cnav-thread-width) !important;
    margin-inline: auto !important;
    min-width: 0 !important;
  }
`;
