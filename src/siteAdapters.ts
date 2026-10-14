import {
  BUILT_IN_CHATGPT_RULES, createChatGptAdapter, createDefaultAdapterHealth, extractVisibleText,
  type ChatGptAdapter, type ChatGptDomRule, type ParsedMessage, type AdapterRole
} from "./chatGptAdapter";
import { getChatSite, type ChatSite } from "./chatSites";

const EXCLUDED = '#conversation-navigator-root,nav,aside,header,[role="navigation"],[role="dialog"],textarea,input,[contenteditable="true"],.ds-think-content';

function matchesAny(element: HTMLElement, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try { return element.matches(selector); } catch { return false; }
  });
}

function collectSiteMessages(site: ChatSite): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const rule: ChatGptDomRule = {
    ...BUILT_IN_CHATGPT_RULES[0],
    textIgnoredSelectors: [...BUILT_IN_CHATGPT_RULES[0].textIgnoredSelectors,
      ".sr-only", ".thinking-container", ".ds-think-content", ".response-footer", ".model-response-footer"]
  };
  const roleGroups: Array<[AdapterRole, readonly string[], readonly string[]]> = [
    ["user", site.userMessages, site.assistantMessages],
    ["assistant", site.assistantMessages, site.userMessages]
  ];
  for (const [role, selectors, oppositeSelectors] of roleGroups) {
    for (const selector of selectors) {
      let candidates: HTMLElement[];
      try { candidates = Array.from(document.querySelectorAll<HTMLElement>(selector)); }
      catch { continue; }
      for (const candidate of candidates) {
        if (candidate.closest(EXCLUDED)) continue;
        if (matchesAny(candidate, oppositeSelectors) || oppositeSelectors.some((other) => {
          try { return Boolean(candidate.querySelector(other)); } catch { return false; }
        })) continue;
        if (candidate.closest('[hidden],[aria-hidden="true"]')) continue;
        let hidden = false;
        for (let node: HTMLElement | null = candidate; node; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          const foldedByNavigator = node.dataset.cnavFocusHidden === "true" &&
            document.documentElement.dataset.cnavFocusMode === "true" && node.style.display !== "none";
          if ((style.display === "none" && !foldedByNavigator) || style.visibility === "hidden") { hidden = true; break; }
        }
        if (hidden) continue;
        const text = extractVisibleText(candidate, rule);
        if (!text) continue;
        let element = candidate;
        for (const turn of site.turns) {
          const parent = candidate.closest<HTMLElement>(turn);
          if (parent && !oppositeSelectors.some((other) => {
            try { return matchesAny(parent, [other]) || Boolean(parent.querySelector(other)); } catch { return false; }
          })) { element = parent; break; }
        }
        // 嵌套选择器只生成一个条目；重复文本出现在不同消息时仍保留。
        if (messages.some((message) => message.element === element ||
          (message.role === role && (message.element.contains(element) || element.contains(message.element))))) continue;
        messages.push({ role, element, text });
      }
    }
  }
  return messages.sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1);
}

export function createSiteAdapter(host: string, remoteRules: ChatGptDomRule[] = []): ChatGptAdapter | null {
  const site = getChatSite(host);
  if (!site) return null;
  if (site.id === "chatgpt") return createChatGptAdapter(remoteRules);
  return {
    id: site.id, label: site.label,
    matches: (candidate) => getChatSite(candidate)?.id === site.id,
    collect: () => {
      const messages = collectSiteMessages(site);
      const userCount = messages.filter((message) => message.role === "user").length;
      const assistantCount = messages.length - userCount;
      return {
        messages, supplementalContexts: [],
        health: messages.length ? {
          status: userCount && assistantCount ? "ok" : "degraded",
          reason: userCount && assistantCount ? `${site.label} conversation messages are recognized.` : `${site.label}: waiting for both question and answer.`,
          ruleId: `${site.id}-dom-v1`, messageCount: messages.length, userCount, assistantCount,
          canAnchor: true, source: "built-in"
        } : createDefaultAdapterHealth(`${site.label}: open a conversation and refresh the page. No messages recognized.`)
      };
    }
  };
}
