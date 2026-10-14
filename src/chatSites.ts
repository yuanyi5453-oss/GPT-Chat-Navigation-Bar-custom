export type ChatSiteId = "chatgpt" | "gemini" | "grok" | "deepseek";

export interface ChatSite {
  id: ChatSiteId;
  label: string;
  hosts: readonly string[];
  roots: readonly string[];
  userMessages: readonly string[];
  assistantMessages: readonly string[];
  turns: readonly string[];
  editors: readonly string[];
  chrome: readonly string[];
}

const roleSelectors = (role: "user" | "assistant") => [
  `[data-message-author-role="${role}"]`, `[data-author-role="${role}"]`,
  `[data-author="${role}"]`, `[data-role="${role}"]`, `[data-turn="${role}"]`,
  `[data-testid="${role}-message"]`
];

// 每个站点单独限定域名及消息结构，不以任意网页或奇偶顺序猜测对话角色。
export const CHAT_SITES: readonly ChatSite[] = [
  {
    id: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"],
    roots: ["main", '[role="main"]'],
    userMessages: roleSelectors("user"), assistantMessages: roleSelectors("assistant"),
    turns: ['[data-testid*="conversation-turn" i]', "[data-turn-id]", "[data-message-id]"],
    editors: ['#prompt-textarea', 'form[data-type="unified-composer"] :is(textarea,[contenteditable="true"])', '[data-testid*="composer" i] :is(textarea,[contenteditable="true"])'],
    chrome: ['nav[aria-label*="Chat" i]', '[data-testid*="sidebar" i]', '[class*="sidebar" i]', 'form[data-type="unified-composer"]', '[data-testid*="composer" i]', 'main > header']
  },
  {
    id: "gemini", label: "Gemini", hosts: ["gemini.google.com"],
    roots: ["chat-window", "infinite-scroller.chat-history", '[role="main"]', "main"],
    userMessages: ["user-query", '[data-test-id="user-query"]', ".query-text", ...roleSelectors("user")],
    assistantMessages: ["model-response", '[data-test-id="model-response"]', "message-content", ...roleSelectors("assistant")],
    turns: ["user-query", "model-response", '[data-test-id="user-query"]', '[data-test-id="model-response"]'],
    editors: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]', 'rich-textarea textarea', 'textarea[aria-label]'],
    chrome: ["bard-sidenav", "mat-sidenav", "input-container", "rich-textarea", "header", '[role="banner"]']
  },
  {
    id: "grok", label: "Grok", hosts: ["grok.com"],
    roots: ["main", '[role="main"]'],
    userMessages: [".message-bubble.user", ".message-bubble.human", '[id^="response-"] .items-end .message-bubble', '[id^="response-"].items-end .message-bubble', 'div.items-end > .message-bubble', ...roleSelectors("user")],
    assistantMessages: [".message-bubble.assistant", ".message-bubble.model", '[id^="response-"].items-start .message-bubble', 'div.items-start > .message-bubble', ...roleSelectors("assistant")],
    turns: ['[id^="response-"]', ".message-bubble"],
    editors: ['textarea', '[contenteditable="true"][role="textbox"]', '.tiptap[contenteditable="true"]'],
    chrome: ['nav', 'aside', '[data-testid*="sidebar" i]', 'form:has(textarea)', 'header']
  },
  {
    id: "deepseek", label: "DeepSeek", hosts: ["chat.deepseek.com"],
    roots: ["main", '[role="main"]'],
    userMessages: [".fbb737a4", ".ds-message--user", '[data-message-role="user"]', ...roleSelectors("user")],
    assistantMessages: [".ds-message--assistant", '[data-message-role="assistant"]', '.ds-markdown:not(.fbb737a4 .ds-markdown):not(.ds-think-content .ds-markdown)', ...roleSelectors("assistant")],
    turns: [".ds-message", "[data-message-id]"],
    editors: ['#chat-input', 'textarea.ds-scroll-area', 'textarea[placeholder]', '[contenteditable="true"][role="textbox"]'],
    chrome: ['nav', 'aside', '[class*="sidebar" i]', 'form:has(textarea)', 'header']
  }
];

export function getChatSite(host: string): ChatSite | undefined {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return CHAT_SITES.find((site) => site.hosts.includes(normalized));
}

export const ALL_NATIVE_MESSAGE_SELECTOR = CHAT_SITES.flatMap((site) => [
  ...site.userMessages, ...site.assistantMessages
]).join(",");
export const ALL_COMPOSER_EDITOR_SELECTOR = [...new Set(CHAT_SITES.flatMap((site) => site.editors))].join(",");

export function getSiteMessageSelector(host = location.hostname): string {
  const site = getChatSite(host);
  return site ? [...site.userMessages, ...site.assistantMessages].join(",") : "[data-cnav-message-role]";
}

function queryAll(selector: string): HTMLElement[] {
  try { return Array.from(document.querySelectorAll<HTMLElement>(selector)); }
  catch { return []; }
}

export function getConversationRoot(host = location.hostname): HTMLElement | null {
  const site = getChatSite(host);
  if (!site) return null;
  const messages = queryAll(getSiteMessageSelector(host)).filter((element) =>
    !element.closest('#conversation-navigator-root,nav,aside,[role="navigation"],[role="dialog"]')
  );
  for (const selector of site.roots) {
    const root = queryAll(selector).find((candidate) => messages.some((message) => candidate.contains(message)));
    if (root) return root;
  }
  // DeepSeek 等页面没有 main 标签：取已识别消息的最近公共容器，避开整页导航。
  if (messages.length) {
    let root: HTMLElement | null = messages[0].parentElement;
    while (root && root !== document.body && !messages.every((message) => root!.contains(message))) root = root.parentElement;
    if (root && root !== document.body) return root;
  }
  return site.roots.flatMap(queryAll)[0] ?? null;
}

export function queryConversationElements(selector: string): HTMLElement[] {
  const root = getConversationRoot();
  if (!root) return [];
  try { return Array.from(root.querySelectorAll<HTMLElement>(selector)); }
  catch { return []; }
}

export function getConversationId(host: string, pathname: string): string | null {
  const site = getChatSite(host);
  if (!site) return null;
  const patterns: Record<ChatSiteId, RegExp> = {
    chatgpt: /(?:^|\/)c\/([^/]+)/,
    gemini: /^\/app\/([^/]+)/,
    grok: /^\/(?:c|chat)\/([^/]+)/,
    deepseek: /^\/a\/chat\/s\/([^/]+)/
  };
  return pathname.match(patterns[site.id])?.[1] ?? null;
}
