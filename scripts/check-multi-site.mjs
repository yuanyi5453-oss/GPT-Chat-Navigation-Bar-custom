import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repo, "validation", "multi-site");
const temp = path.join(output, "temp");
await mkdir(temp, { recursive: true });
const candidates = [process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
let executablePath;
for (const candidate of candidates.filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
if (!executablePath) throw new Error("Chrome not found. Set CHROME_PATH to an installed Chrome executable.");
const bundle = await readFile(path.join(repo, "dist/assets/contentScript.js"), "utf8");
const contentCss = await readFile(path.join(repo, "dist/assets/contentScript.css"), "utf8");
const popupBundle = await readFile(path.join(repo, "dist/assets/popup.js"), "utf8");
const popupCss = await readFile(path.join(repo, "dist/assets/popup.css"), "utf8");
const sites = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/c/test-conversation" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app/test-conversation" },
  { id: "grok", label: "Grok", url: "https://grok.com/c/test-conversation" },
  { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/a/chat/s/test-conversation" }
];
const fixtureCss = `
  *{box-sizing:border-box}html,body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif;font-size:16px;background:#f7f8fa;color:#20242b}
  body>header,body>nav,#root>header,#root>aside nav{padding:12px;background:white}body>nav,body>aside,bard-sidenav,#root>aside{width:170px;position:fixed;left:0;top:60px}
  main,chat-window,.chat-list{display:block;margin-left:180px;padding:24px;width:calc(100% - 180px)}
  infinite-scroller,user-query,model-response,user-query-content,message-content,.message-bubble,.ds-message{display:block}
  #conversation article,user-query,model-response,.message-bubble,.ds-message{background:white;padding:12px;border-radius:12px;margin-block:12px}
  footer,input-container{display:block;padding:16px;margin-left:180px;width:calc(100% - 180px)}
  #input-shell{width:600px;max-width:100%;margin-inline:auto;background:white;border:1px solid #bbb;border-radius:20px;padding:12px}
  textarea,.ql-editor{width:100%;min-height:45px}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:8px}pre{background:#eef0f3;padding:12px;overflow:auto}
  [hidden]{display:none!important}@media(max-width:700px){body>nav,body>aside,bard-sidenav,#root>aside{display:none}main,chat-window,.chat-list,footer,input-container{margin-left:0;width:100%;padding:12px}}
`;

// 所有网络请求在此测试中被替换为合成资料；不接触登录状态或真实聊天。
function installMocks({ popup, settings }) {
  const changeListeners = [];
  const messageListeners = [];
  const store = { "conversationNavigator:settings": settings };
  window.__setSettings = (value) => {
    const key = "conversationNavigator:settings";
    const oldValue = store[key];
    store[key] = { ...oldValue, ...value };
    for (const listener of changeListeners) listener({ [key]: { oldValue, newValue: store[key] } }, "local");
  };
  window.__send = (message) => {
    let response;
    for (const listener of messageListeners) listener(message, {}, (value) => { response = value; });
    return response;
  };
  window.close = () => {};
  window.chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (listener) => messageListeners.push(listener), removeListener() {} },
      sendMessage: (_message, callback) => callback?.({ ok: false, error: "Offline test" })
    },
    storage: {
      local: {
        get: (keys, callback) => {
          const result = typeof keys === "string" ? { [keys]: store[keys] } : { ...store };
          callback(result);
        },
        set: (values, callback) => { Object.assign(store, values); callback?.(); },
        remove: (_keys, callback) => callback?.()
      },
      onChanged: {
        addListener: (listener) => changeListeners.push(listener),
        removeListener: (listener) => { const index = changeListeners.indexOf(listener); if (index >= 0) changeListeners.splice(index, 1); }
      }
    },
    tabs: {
      query: (_query, callback) => callback([{ id: 1 }]),
      sendMessage: (_id, message, callback) => popup ? window.__bridge(message).then(callback) : callback(window.__send(message))
    },
    permissions: { contains: async () => false, request: async () => false, remove: async () => true }
  };
}

const context = await chromium.launchPersistentContext(path.join(output, "profile"), {
  executablePath, headless: true, viewport: { width: 1365, height: 900 },
  env: { ...process.env, TEMP: temp, TMP: temp }, args: ["--disable-gpu"]
});
const results = [];
const baseSettings = {
  language: "zh-CN", chatLayoutVersion: 2, chatFontScale: 100, chatContentWidth: 60,
  composerWidthScale: 100, compatRulesAutoSyncEnabled: false, navigateAnimationEnabled: false
};
try {
  for (const site of sites) {
    const errors = [];
    const checks = [];
    const check = (name, actual, expected = true) => {
      assert.deepEqual(actual, expected, `${site.label}: ${name}`);
      checks.push(name);
    };
    const body = await readFile(path.join(repo, `tests/fixtures/multi-site/${site.id}.html`), "utf8");
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${site.label} · 合成验证页面</title><style>${fixtureCss}\n${contentCss}</style></head><body>${body}</body></html>` })
      : route.abort());
    await page.addInitScript(installMocks, { popup: false, settings: baseSettings });
    await page.goto(site.url);
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => Boolean(window.__send({ type: "conversationNavigator:pageStatus" })?.health?.messageCount));
    const health = await page.evaluate(() => window.__send({ type: "conversationNavigator:pageStatus" }).health);
    check("provider and role counts", [health.siteId, health.siteLabel, health.messageCount, health.userCount, health.assistantCount], [site.id, site.label, 4, 2, 2]);
    await page.waitForFunction(() => document.querySelectorAll("[data-conversation-navigator-id]").length >= 4);
    const snapshot = await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot);
    check("export includes four messages", snapshot.messages.length, 4);
    check("export has valid message positions", snapshot.messages.every((message) => message.turnIndex > 0));
    check("export includes code", snapshot.codeBlocks.length, 1);
    check("outline preserves repeated prompts", snapshot.nodes.length, 2);
    check("question anchors have distinct identities", new Set(snapshot.nodes.map((node) => node.id)).size, 2);
    const initialWidth = await page.locator("#input-shell").evaluate((element) => element.getBoundingClientRect().width);
    await page.evaluate(() => window.__setSettings({ composerWidthScale: 120, chatFontScale: 130 }));
    await page.waitForFunction(() => document.documentElement.dataset.cnavComposerStatus === "applied");
    const resizedWidth = await page.locator("#input-shell").evaluate((element) => element.getBoundingClientRect().width);
    check("input width applies 120 percent", Math.abs(resizedWidth / initialWidth - 1.2) < 0.02);
    const fontSize = await page.locator("#streaming-tail").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    check("message typography applies", Math.abs(fontSize - 20.8) < 0.1);
    await page.evaluate(() => window.__setSettings({ composerWidthScale: 100 }));
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-cnav-composer-width"));
    check("input width resets", Math.abs(await page.locator("#input-shell").evaluate((element) => element.getBoundingClientRect().width) - initialWidth) < 1);

    const popup = await context.newPage();
    popup.on("pageerror", (error) => errors.push(error.message));
    await popup.exposeFunction("__bridge", (message) => page.evaluate((value) => window.__send(value), message));
    await popup.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><style>${popupCss}</style></head><body><div id="root"></div></body></html>` }));
    await popup.addInitScript(installMocks, { popup: true, settings: baseSettings });
    await popup.goto("https://extension.test/popup");
    await popup.addScriptTag({ content: popupBundle });
    await popup.getByText(`已连接 ${site.label}`, { exact: true }).waitFor();
    check("popup enables all three tools", await popup.locator(".popup-tool-card button:enabled").count(), 3);
    await popup.screenshot({ path: path.join(output, `${site.id}-popup.png`), animations: "disabled" });
    const toolButtons = popup.locator(".popup-tool-card button");
    await toolButtons.nth(0).click();
    await page.locator(".cnav-reading-drawer.is-open").waitFor();
    await page.locator(".cnav-turn-list button").first().waitFor();
    check("question navigation shows both turns", await page.locator(".cnav-turn-list button").count(), 2);
    await page.locator(".cnav-focus-options summary").click();
    await page.locator(".cnav-focus-options .cnav-primary-action").click();
    await page.waitForFunction(() => document.documentElement.dataset.cnavFocusMode === "true");
    check("focus hides the other question and answer", await page.locator('[data-cnav-focus-hidden="true"]').count(), 2);
    check("focus keeps the complete conversation index", await page.evaluate(() => window.__send({ type: "conversationNavigator:pageStatus" }).health.messageCount), 4);
    await page.locator(".cnav-focus-options .cnav-primary-action").click();
    await page.waitForFunction(() => !document.documentElement.dataset.cnavFocusMode);
    await toolButtons.nth(1).click();
    await page.locator(".cnav-export-message").first().waitFor();
    check("selective export panel shows messages", await page.locator(".cnav-export-message").count(), 4);
    await toolButtons.nth(2).click();
    await page.locator(".cnav-citation-item").first().waitFor();
    check("source manager shows external source", await page.locator(".cnav-citation-item").count(), 1);
    await page.locator(".cnav-reading-tabs .is-active").filter({ hasText: "引用管理" }).waitFor();
    await page.screenshot({ path: path.join(output, `${site.id}-desktop.png`), animations: "disabled" });
    await page.evaluate(() => window.__send({ type: "conversationNavigator:pageCommand", command: "close" }));
    await page.waitForFunction(() => document.querySelector(".cnav-reading-drawer")?.getAttribute("aria-hidden") === "true");
    await page.evaluate(() => { document.getElementById("streaming-tail").textContent += "继续生成的新内容。"; });
    await page.waitForFunction(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.messages.at(-1).text.includes("继续生成的新内容"));
    check("streaming update keeps message count", await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.messages.length), 4);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__setSettings({ composerWidthScale: 140 }));
    await page.waitForFunction(() => document.documentElement.dataset.cnavComposerStatus === "applied");
    check("narrow screen has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(output, `${site.id}-narrow.png`), animations: "disabled" });
    check("no browser errors", errors, []);
    results.push({ site: site.id, checks, health, initialWidth, resizedWidth, errors });
    console.log(`${site.label}: ${checks.length} browser checks passed`);
    await popup.close();
    await page.close();
  }
} catch (error) {
  for (const page of context.pages()) {
    if (!page.url().includes("test-conversation")) continue;
    const debug = await page.evaluate(() => ({
      health: window.__send({ type: "conversationNavigator:pageStatus" }),
      snapshot: window.__send({ type: "conversationNavigator:export:snapshot" }),
      drawer: document.querySelector(".cnav-reading-drawer")?.innerText,
      focusMode: document.documentElement.dataset.cnavFocusMode,
      markers: [...document.querySelectorAll("[data-cnav-message-role]")].map((element) => ({ role: element.dataset.cnavMessageRole, text: element.innerText, hidden: element.dataset.cnavFocusHidden }))
    }));
    console.log(JSON.stringify(debug));
    await page.screenshot({ path: path.join(output, "failure.png") });
  }
  throw error;
} finally {
  await context.close();
  const report = {
    version: "2026.10.5", scope: "Synthetic fixtures with full built bundles and mocked Chrome messaging; no logged-in live-site validation",
    passed: results.length === sites.length, assertionCount: results.reduce((sum, result) => sum + result.checks.length, 0),
    contentScriptSha256: createHash("sha256").update(bundle).digest("hex"), results
  };
  await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
}
