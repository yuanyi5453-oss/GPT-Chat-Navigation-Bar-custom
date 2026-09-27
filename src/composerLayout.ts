import { CHATGPT_MESSAGE_NODE_SELECTOR } from "./chatGptAdapter";

export const COMPOSER_EDITOR_SELECTOR = '#prompt-textarea, form[data-type="unified-composer"] :is(textarea,[contenteditable="true"]), [data-testid*="composer" i] :is(textarea,[contenteditable="true"])';
const EXCLUDED = '#conversation-navigator-root,[data-cnav-canvas-root],[data-cnav-canvas-kind],[data-testid*="canvas" i],[data-testid*="artifact" i]';
const TARGET = "data-cnav-composer-width-target";
const ANCESTOR = "data-cnav-composer-width-ancestor";
const MESSAGES = `${CHATGPT_MESSAGE_NODE_SELECTOR},[data-cnav-message-role],[data-testid*="conversation-turn" i]`;

export const COMPOSER_WIDTH_CSS = `
  html[data-cnav-composer-width="true"] [${ANCESTOR}="true"] {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
  }
  html[data-cnav-composer-width="true"] [${TARGET}="true"] {
    box-sizing: border-box !important;
    width: min(calc(var(--cnav-composer-base-width) * var(--cnav-composer-scale)), 100%) !important;
    max-width: calc(var(--cnav-composer-base-width) * var(--cnav-composer-scale)) !important;
    min-width: 0 !important;
    flex-grow: 0 !important;
    flex-shrink: 1 !important;
    flex-basis: auto !important;
    margin-inline: auto !important;
  }
`;

function isShared(element: HTMLElement) {
  return element.matches("body,html,main,nav,aside") || element.matches(MESSAGES) || Boolean(element.querySelector(MESSAGES));
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return !element.closest('[hidden],[aria-hidden="true"]') && style.display !== "none" &&
    style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
}

/** 从编辑器寻找可见输入框外壳，不依赖 main/form 或 Tailwind 类名。 */
export function findComposerLayout() {
  const editor = Array.from(document.querySelectorAll<HTMLElement>(COMPOSER_EDITOR_SELECTOR))
    .find((candidate) => !candidate.closest(EXCLUDED) && !candidate.closest(MESSAGES) && isVisible(candidate));
  if (!editor) return null;

  const form = editor.closest<HTMLElement>("form");
  let target: HTMLElement | null = null;
  let controlsFallback: HTMLElement | null = null;
  let namedFallback: HTMLElement | null = null;
  let paintedFallback: HTMLElement | null = null;
  for (let element = editor.parentElement, count = 0; element && count < 10; element = element.parentElement, count++) {
    if (isShared(element) || element.matches(EXCLUDED)) break;
    if (element.matches('[data-testid*="composer" i]')) namedFallback ??= element;
    const hasControls = Boolean(element.querySelector('button,[role="button"],input[type="submit"]'));
    if (hasControls) controlsFallback ??= element;
    const style = window.getComputedStyle(element);
    const rounded = Number.parseFloat(style.borderTopLeftRadius || style.borderRadius) >= 10;
    const painted = (style.backgroundColor && !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)) ||
      Number.parseFloat(style.borderTopWidth) > 0 || (style.boxShadow && style.boxShadow !== "none");
    if (rounded && painted) paintedFallback ??= element;
    if (element.matches('[data-testid="composer-background"],[data-testid="composer-surface"]') || (rounded && painted && hasControls)) {
      target = element;
      break;
    }
    if (element === form) break;
  }
  target ??= paintedFallback ?? (form && !isShared(form) ? form : controlsFallback ?? namedFallback);
  target ??= editor.parentElement && !isShared(editor.parentElement) ? editor.parentElement : editor;
  if (!isVisible(target)) return null;

  const ancestors: HTMLElement[] = [];
  let host = target.parentElement;
  for (let element = target.parentElement, count = 0; element && count < 10; element = element.parentElement, count++) {
    host = element;
    if (isShared(element) || element.matches(EXCLUDED) || element.querySelector('nav,aside,[data-testid*="sidebar" i]')) break;
    // 一个祖先包含其他输入区时，保留其整体布局。
    if (Array.from(element.querySelectorAll(COMPOSER_EDITOR_SELECTOR)).some((other) => other !== editor)) break;
    ancestors.push(element);
  }
  return { editor, target, ancestors, host };
}

export function clearComposerWidth() {
  const root = document.documentElement;
  delete root.dataset.cnavComposerWidth;
  document.querySelectorAll(`[${TARGET}],[${ANCESTOR}]`).forEach((element) => {
    element.removeAttribute(TARGET);
    element.removeAttribute(ANCESTOR);
  });
  root.style.removeProperty("--cnav-composer-base-width");
  delete root.dataset.cnavComposerStatus;
}

export function applyComposerWidth(scale: number): HTMLElement | null {
  clearComposerWidth();
  const root = document.documentElement;
  root.style.setProperty("--cnav-composer-scale", (scale / 100).toFixed(2));
  if (scale === 100) return null;

  const layout = findComposerLayout();
  if (!layout) {
    root.dataset.cnavComposerStatus = "not-found";
    return null;
  }
  // 暂时撤销自定义样式后测量，避免重复缩放和默认宽度跳变。
  const width = layout.target.getBoundingClientRect().width;
  root.style.setProperty("--cnav-composer-base-width", `${width.toFixed(2)}px`);
  layout.target.setAttribute(TARGET, "true");
  layout.ancestors.forEach((element) => element.setAttribute(ANCESTOR, "true"));
  root.dataset.cnavComposerWidth = "true";
  root.dataset.cnavComposerStatus = "applied";
  return layout.host;
}
