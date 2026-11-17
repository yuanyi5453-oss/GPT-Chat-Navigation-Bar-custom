import assert from "node:assert/strict";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repo, "validation", "navigation");
const baseline = process.argv.includes("--baseline");
const label = baseline ? "baseline" : "fixed";
const temp = path.join(output, "temp");
await mkdir(temp, { recursive: true });
const resultFile = path.join(output, baseline ? "baseline-results.json" : "results.json");
try {
  await access(resultFile);
  let revision = 1;
  while (true) {
    const archived = path.join(output, `${label}-previous-${revision}-results.json`);
    try {
      await copyFile(resultFile, archived, constants.COPYFILE_EXCL);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      revision += 1;
    }
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.env.TEMP = temp;
process.env.TMP = temp;
const executablePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
await access(executablePath);
const bundle = await readFile(path.join(repo, "dist/assets/contentScript.js"), "utf8");
const css = await readFile(path.join(repo, "dist/assets/contentScript.css"), "utf8");
const settings = {
  language: "zh-CN", chatLayoutVersion: 2, chatFontScale: 100, chatContentWidth: 60,
  composerWidthScale: 100, compatRulesAutoSyncEnabled: false, navigateAnimationEnabled: false,
  uiMotionEnabled: false
};

function installMocks(settings) {
  window.__nativePushState = history.pushState.bind(history);
  const listeners = [];
  const store = { "conversationNavigator:settings": settings };
  window.__send = (message) => {
    let response;
    for (const listener of listeners) listener(message, {}, (value) => { response = value; });
    return response;
  };
  window.chrome = {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener), removeListener() {} },
      sendMessage: (_message, callback) => callback?.({ ok: false, error: "Offline test" })
    },
    storage: {
      local: {
        get: (keys, callback) => callback(typeof keys === "string" ? { [keys]: store[keys] } : { ...store }),
        set: (values, callback) => { Object.assign(store, values); callback?.(); },
        remove: (_keys, callback) => callback?.()
      },
      onChanged: { addListener() {}, removeListener() {} }
    },
    permissions: { contains: async () => false }
  };
}

function fixture(nested = false, longQuestion = false) {
  const turns = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return `<article id="q${number}" data-testid="conversation-turn-${number * 2 - 1}" data-turn-id="question-${number}"><div data-message-author-role="user">问题 ${number}，请解释材料计算结果${longQuestion && number === 7 ? `<div class="long-content">${"长问题的补充说明。<br>".repeat(120)}</div>` : ""}</div></article><article id="a${number}" data-testid="conversation-turn-${number * 2}" data-turn-id="answer-${number}"><div data-message-author-role="assistant">回答 ${number}<p class="answer-space">合成回答占位</p></div></article>`;
  }).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#fafafa;font-family:Arial,sans-serif}
    body>header{height:64px;padding:20px;background:white}
    main{display:block;margin:0 auto;max-width:900px;padding:20px}
    article{background:white;margin-block:20px;padding:18px;border:1px solid #ddd;border-radius:12px}
    .answer-space{height:480px}footer{height:120px}
    ${nested ? "html,body{height:100%;overflow:hidden}#scroll-host{height:calc(100vh - 64px);overflow-y:auto}" : ""}
    ${longQuestion ? "#q7{max-height:210px;overflow-y:auto}.long-content{line-height:24px}" : ""}
    ${css}
  </style></head><body><header>ChatGPT 合成导航验证</header><div id="scroll-host"><main id="conversation">${turns}</main><footer></footer></div></body></html>`;
}

function twoTurnFixture({ anonymous = false, repeated = false, prefix = "A" } = {}) {
  const turns = [1, 2].map((number) => {
    const prompt = repeated ? "相同问题，请分析" : `${prefix} 第${number}轮问题`;
    const questionKey = anonymous ? "" : ` data-turn-id="${prefix}-question-${number}"`;
    const answerKey = anonymous ? "" : ` data-turn-id="${prefix}-answer-${number}"`;
    return `<article id="q${number}"${questionKey}><div data-message-author-role="user">${prompt}</div></article><article id="a${number}"${answerKey}><div data-message-author-role="assistant">${prefix} 第${number}轮原始回答<p style="height:900px">合成回答占位</p></div></article>`;
  }).join("");
  return fixture(true).replace(/<main id="conversation">[\s\S]*?<\/main>/, `<main id="fixture">${turns}</main>`);
}

const context = await chromium.launchPersistentContext(path.join(output, `${label}-profile`), {
  executablePath, headless: true, viewport: { width: 1365, height: 900 },
  env: { ...process.env, TEMP: temp, TMP: temp }, args: ["--disable-gpu"]
});
const results = [];
const scenarios = [
  { name: "document scrolling", nested: false },
  { name: "nested overflow scrolling", nested: true },
  { name: "long scrollable question", nested: true, long: true },
  { name: "immediate DOM replacement", nested: true, replace: true },
  { name: "temporarily unmounted question", nested: true, virtual: true },
  { name: "missing question feedback", nested: true, missing: true },
  { name: "rapid clicks keep last target", nested: true, rapid: true },
  { name: "later click cancels missing-target recovery", nested: true, virtual: true, cancel: true },
  { name: "exit focus before navigation", nested: true, focus: true },
  { name: "390px mobile closes drawer", nested: true, mobile: true }
];
const edgeCases = ["repeated prompt ownership after first round unmount", "partial window preserves earlier answer ownership", "new chat root URL adopts conversation without DOM change", "returning route reuses original conversation DOM"];

async function geometry(page, number) {
  return page.evaluate(({ number }) => {
    const target = document.getElementById(`q${number}`);
    const host = document.getElementById("scroll-host");
    const nested = getComputedStyle(host).overflowY === "auto";
    const viewport = nested ? host.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const rect = target?.getBoundingClientRect();
    return {
      present: Boolean(target), top: rect?.top ?? null, bottom: rect?.bottom ?? null,
      viewportTop: viewport.top, viewportBottom: viewport.bottom,
      scrollTop: nested ? host.scrollTop : scrollY, internalScrollTop: target?.scrollTop ?? null,
      conversationOffsetTop: rect ? rect.top - viewport.top + (nested ? host.scrollTop : scrollY) : null,
      focus: document.documentElement.dataset.cnavFocusMode ?? null,
      drawerOpen: document.querySelector(".cnav-reading-drawer")?.classList.contains("is-open") ?? false,
      virtualMounts: window.__virtualMounts || 0
    };
  }, { number });
}

async function waitForTarget(page, number) {
  await page.waitForFunction((number) => {
    const target = document.getElementById(`q${number}`);
    if (!target) return false;
    const host = document.getElementById("scroll-host");
    const nested = getComputedStyle(host).overflowY === "auto";
    const viewport = nested ? host.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const rect = target.getBoundingClientRect();
    const headerBottom = document.querySelector("body > header")?.getBoundingClientRect().bottom ?? 0;
    return rect.top >= Math.max(viewport.top, headerBottom, 0) - 2 && rect.top < viewport.bottom - 30;
  }, number, { timeout: 7000 });
  await page.waitForTimeout(180);
  const state = await geometry(page, number);
  assert.ok(state.scrollTop > 500, `conversation actually scrolls: ${JSON.stringify(state)}`);
  assert.ok(state.top >= state.viewportTop - 2 && state.top < state.viewportBottom - 30, `question top remains visible: ${JSON.stringify(state)}`);
  return state;
}

try {
  for (const scenario of scenarios) {
    const page = await context.newPage();
    const errors = [];
    const result = { name: scenario.name, passed: false, errors };
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      if (scenario.mobile) await page.setViewportSize({ width: 390, height: 844 });
      await page.route("**/*", (route) => route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: fixture(scenario.nested, scenario.long) })
        : route.abort());
      await page.addInitScript(installMocks, settings);
      await page.goto("https://chatgpt.com/c/navigation-regression");
      await page.addScriptTag({ content: bundle });
      await page.waitForFunction(() => window.__send({ type: "conversationNavigator:pageStatus" })?.health?.userCount === 12);
      await page.evaluate(() => window.__send({ type: "conversationNavigator:pageCommand", command: "open", panel: "focus" }));
      await page.locator(".cnav-reading-drawer.is-open .cnav-turn-list button").nth(6).waitFor();
      assert.equal(await page.locator(".cnav-turn-list button").count(), 12);
      result.before = await geometry(page, 7);
      assert.ok(result.before.top > result.before.viewportBottom, "target begins outside viewport");
      if (scenario.focus) {
        await page.locator(".cnav-focus-options summary").click();
        await page.locator(".cnav-focus-options .cnav-primary-action").click();
        await page.waitForFunction(() => document.documentElement.dataset.cnavFocusMode === "true");
      }
      if (scenario.replace || scenario.virtual || scenario.missing) {
        // 网站 DOM 变化和真实目录按钮的 click 位于同一任务，覆盖 MutationObserver 重扫前的窗口。
        await page.evaluate(({ replace, virtual, missing, cancel }) => {
          const original = document.getElementById("q7");
          if (replace) {
            const replacement = original.cloneNode(true);
            for (const element of [replacement, ...replacement.querySelectorAll("*")]) {
              for (const attribute of [...element.attributes]) {
                if (attribute.name.startsWith("data-cnav") || attribute.name === "data-conversation-navigator-id") element.removeAttribute(attribute.name);
              }
            }
            original.replaceWith(replacement);
          } else {
            const placeholder = document.createElement("div");
            placeholder.id = "virtual-placeholder";
            placeholder.style.height = `${original.getBoundingClientRect().height + 40}px`;
            original.replaceWith(placeholder);
            if (virtual && !missing && !cancel) {
              const host = document.getElementById("scroll-host");
              host.addEventListener("scroll", () => {
                const rect = placeholder.getBoundingClientRect();
                const viewport = host.getBoundingClientRect();
                if (placeholder.isConnected && rect.top < viewport.bottom + host.clientHeight && rect.bottom > viewport.top - host.clientHeight) {
                  placeholder.replaceWith(original);
                  window.__virtualMounts = (window.__virtualMounts || 0) + 1;
                }
              });
            }
          }
          document.querySelectorAll(".cnav-turn-list button")[6].click();
        }, scenario);
        if (scenario.cancel) {
          await page.waitForTimeout(40);
          await page.locator(".cnav-turn-list button").nth(2).click();
        }
      } else if (scenario.rapid) {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll(".cnav-turn-list button");
          buttons[2].click();
          buttons[10].click();
          buttons[6].click();
        });
      } else {
        await page.locator(".cnav-turn-list button").nth(6).click();
      }
      if (scenario.missing) {
        await page.waitForFunction(() => {
          const nodes = document.querySelectorAll('[role="status"],[role="alert"],.cnav-toast,.cnav-navigation-status');
          return [...nodes].some((node) => /未.*(找到|加载|定位)|无法|不可用|暂时|not found|unavailable|could not/i.test(node.textContent || "") && node.getBoundingClientRect().height > 0);
        }, null, { timeout: 10000 });
        result.feedback = await page.locator('[role="status"],[role="alert"],.cnav-toast,.cnav-navigation-status').allTextContents();
      } else {
        result.after = await waitForTarget(page, scenario.cancel ? 3 : 7);
        if (scenario.long) assert.equal(result.after.internalScrollTop, 0, "navigation does not scroll inside the question");
        if (scenario.virtual && !scenario.cancel) assert.equal(result.after.virtualMounts, 1, "fixture remounts the question only after conversation scrolling");
        if (scenario.cancel) {
          await page.waitForTimeout(2200);
          result.after = await geometry(page, 3);
          assert.ok(result.after.top >= result.after.viewportTop - 2 && result.after.top < result.after.viewportBottom - 30, "cancelled recovery must not scroll away from the last clicked question");
        }
        if (scenario.focus) assert.equal(result.after.focus, null, "normal navigation exits focus mode");
        if (scenario.mobile) {
          assert.equal(result.after.drawerOpen, false, "mobile navigation closes the overlay drawer");
          assert.ok(await page.locator("#q7").evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const topElement = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 1, rect.left + 20)), rect.top + 8);
            return element.contains(topElement);
          }), "mobile question is visible without an overlay intercepting it");
        }
      }
      assert.deepEqual(errors, [], "no browser page errors");
      result.passed = true;
    } catch (error) {
      result.error = error.message;
      result.after = await geometry(page, 7).catch(() => null);
      await page.screenshot({ path: path.join(output, `${label}-${scenario.name.replaceAll(/[^a-z0-9]+/gi, "-")}.png`), animations: "disabled" });
    }
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${scenario.name}${result.error ? `: ${result.error}` : ""}`);
    await page.close();
  }
  const remountPage = await context.newPage();
  const remountResult = { name: "anonymous repeated prompts survive remount and streaming", passed: false };
  try {
    const body = fixture(true).replace(/ data-testid="[^"]*"| data-turn-id="[^"]*"/g, "").replace('id="conversation"', 'id="fixture"').replace(/问题 \d+，请解释材料计算结果/g, "同一个重复问题");
    await remountPage.route("**/*", (route) => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body })
      : route.abort());
    await remountPage.addInitScript(installMocks, settings);
    await remountPage.goto("https://chatgpt.com/c/anonymous-remount");
    await remountPage.addScriptTag({ content: bundle });
    await remountPage.waitForFunction(() => window.__send({ type: "conversationNavigator:pageStatus" })?.health?.userCount === 12);
    await remountPage.evaluate(() => window.__send({ type: "conversationNavigator:pageCommand", command: "open", panel: "focus" }));
    await remountPage.locator(".cnav-turn-list button").nth(11).waitFor();
    assert.equal(await remountPage.locator(".cnav-turn-list button").count(), 12, "distinct rounds with identical prompts remain separate");
    await remountPage.evaluate(() => {
      for (const id of ["q7", "a7"]) {
        const original = document.getElementById(id);
        const replacement = original.cloneNode(true);
        for (const element of [replacement, ...replacement.querySelectorAll("*")]) {
          for (const attribute of [...element.attributes]) {
            if (attribute.name.startsWith("data-cnav") || attribute.name === "data-conversation-navigator-id") element.removeAttribute(attribute.name);
          }
        }
        if (id === "a7") replacement.querySelector('[data-message-author-role="assistant"]').append(" 流式追加的新回答内容");
        original.replaceWith(replacement);
      }
    });
    await remountPage.waitForFunction(() => window.__send({ type: "conversationNavigator:export:snapshot" })?.snapshot?.messages.some((message) => message.text.includes("流式追加的新回答内容")));
    await remountPage.waitForTimeout(1000);
    remountResult.questionCount = await remountPage.locator(".cnav-turn-list button").count();
    assert.equal(remountResult.questionCount, 12, "same-content remount and answer streaming must not duplicate a question");
    const snapshot = await remountPage.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot);
    assert.equal(snapshot.nodes.length, 12, "snapshot keeps exactly twelve distinct repeated-prompt rounds");
    assert.equal(new Set(snapshot.nodes.map((node) => node.id)).size, 12, "repeated prompts retain distinct identities");
    remountResult.passed = true;
  } catch (error) {
    remountResult.error = error.message;
    await remountPage.screenshot({ path: path.join(output, `${label}-anonymous-remount.png`), animations: "disabled" });
  }
  results.push(remountResult);
  console.log(`${remountResult.passed ? "PASS" : "FAIL"} ${remountResult.name}${remountResult.error ? `: ${remountResult.error}` : ""}`);
  await remountPage.close();
  for (const name of edgeCases) {
    const page = await context.newPage();
    const result = { name, passed: false };
    try {
      const repeated = name === edgeCases[0];
      await page.route("**/*", (route) => route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: twoTurnFixture({ anonymous: repeated || name === edgeCases[1], repeated }) })
        : route.abort());
      await page.addInitScript(installMocks, settings);
      await page.goto(name === edgeCases[2] ? "https://chatgpt.com/" : "https://chatgpt.com/c/ownership-A");
      await page.addScriptTag({ content: bundle });
      await page.waitForFunction(() => window.__send({ type: "conversationNavigator:pageStatus" })?.health?.userCount === 2);
      await page.evaluate(() => window.__send({ type: "conversationNavigator:pageCommand", command: "open", panel: "focus" }));
      await page.locator(".cnav-turn-list button").nth(1).waitFor();
      result.beforeNodes = await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.nodes);
      if (name === edgeCases[0] || name === edgeCases[1]) {
        result.secondBeforeUnmount = await geometry(page, 2);
        await page.evaluate(({ repeated }) => {
          const firstQuestion = document.getElementById("q1");
          const firstAnswer = document.getElementById("a1");
          const placeholder = document.createElement("div");
          placeholder.id = "first-round-placeholder";
          placeholder.style.height = `${firstAnswer.getBoundingClientRect().bottom - firstQuestion.getBoundingClientRect().top + 40}px`;
          firstQuestion.before(placeholder);
          firstQuestion.remove();
          firstAnswer.remove();
          for (const id of repeated ? ["q2", "a2"] : ["a2"]) {
            const original = document.getElementById(id);
            const replacement = original.cloneNode(true);
            for (const element of [replacement, ...replacement.querySelectorAll("*")]) {
              for (const attribute of [...element.attributes]) {
                if (attribute.name.startsWith("data-cnav") || attribute.name === "data-conversation-navigator-id") element.removeAttribute(attribute.name);
              }
            }
            if (id === "a2") replacement.querySelector('[data-message-author-role="assistant"]').append(" 第二轮追加回答专属标记");
            original.replaceWith(replacement);
          }
        }, { repeated });
        await page.waitForFunction(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.messages.some((message) => message.text.includes("第二轮追加回答专属标记")));
        await page.waitForTimeout(700);
        result.afterNodes = await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.nodes);
        result.secondAfterScan = await geometry(page, 2);
        assert.equal(await page.locator(".cnav-turn-list button").count(), 2, "unmounted first round and mounted second round keep their two directory entries");
        if (repeated) {
          await page.locator(".cnav-turn-list button").nth(1).click();
          result.secondQuestion = await waitForTarget(page, 2);
          await page.waitForTimeout(1400);
          await page.locator(".cnav-turn-list button").first().click();
          await page.waitForFunction(() => [...document.querySelectorAll('[role="status"],[role="alert"]')].some((node) => /无法定位|未.*找到|unavailable|not found/i.test(node.textContent || "")), null, { timeout: 7000 });
          result.firstQuestionFeedback = await page.locator('[role="status"],[role="alert"]').allTextContents();
          assert.equal(await page.locator("#q2").evaluate((element) => element.style.outline.includes("#2563eb") || element.style.outline.includes("37, 99, 235")), false, "missing first round must not flash the mounted second question");
        } else {
          assert.equal(result.afterNodes[0].answerSummary, result.beforeNodes[0].answerSummary, "streaming A2 must preserve Q1/A1 summary");
          assert.ok(result.afterNodes[1].answerSummary.includes("第二轮追加回答专属标记"), "streaming A2 remains assigned to Q2");
          await page.locator(".cnav-focus-options summary").click();
          await page.locator(".cnav-focus-options .cnav-primary-action").click();
          await page.waitForFunction(() => document.documentElement.dataset.cnavFocusMode === "true");
          const previousTurn = page.locator(".cnav-focus-navigation button").first();
          if (await previousTurn.isEnabled()) await previousTurn.click();
          await page.waitForFunction(() => document.querySelector(".cnav-focus-navigation strong")?.textContent.trim() === "1 / 2");
          await page.waitForTimeout(100);
          result.focusTurn = await page.locator(".cnav-focus-navigation strong").textContent();
          result.secondAnswerInFirstFocus = await page.locator("#a2").evaluate((element) => {
            const content = element.querySelector('[data-message-author-role="assistant"]');
            return {
              articleHeight: element.getBoundingClientRect().height,
              articleHidden: element.dataset.cnavFocusHidden ?? null,
              contentHeight: content.getBoundingClientRect().height,
              contentDisplay: getComputedStyle(content).display,
              contentHidden: content.dataset.cnavFocusHidden ?? null
            };
          });
          assert.equal(result.secondAnswerInFirstFocus.contentHeight, 0, "focusing missing Q1 must not present mounted A2 content as its answer");
        }
      } else if (name === edgeCases[2]) {
        await page.evaluate(() => window.__nativePushState({}, "", "/c/just-created"));
        await page.waitForTimeout(1700);
        result.afterNodes = await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.nodes);
        assert.equal(await page.locator(".cnav-turn-list button").count(), 2, "root-to-created-conversation URL keeps already rendered first question");
        assert.equal(result.afterNodes[0].promptPreview, result.beforeNodes[0].promptPreview);
      } else {
        await page.evaluate(() => {
          window.__savedAMain = document.getElementById("fixture");
          window.__nativePushState({}, "", "/c/ownership-B");
          window.__savedAMain.remove();
          const main = document.createElement("main");
          main.id = "fixture-B";
          main.innerHTML = '<article data-turn-id="B-question"><div data-message-author-role="user">B 独立会话问题</div></article><article data-turn-id="B-answer"><div data-message-author-role="assistant">B 独立会话回答</div></article>';
          document.getElementById("scroll-host").prepend(main);
        });
        await page.waitForFunction(() => {
          const buttons = document.querySelectorAll(".cnav-turn-list button");
          return buttons.length === 1 && buttons[0].textContent.includes("B 独立会话问题");
        }, null, { timeout: 7000 });
        await page.evaluate(() => {
          window.__nativePushState({}, "", "/c/ownership-A");
          document.getElementById("fixture-B").remove();
          document.getElementById("scroll-host").prepend(window.__savedAMain);
        });
        await page.waitForFunction(() => {
          const buttons = document.querySelectorAll(".cnav-turn-list button");
          return buttons.length === 2 && [...buttons].every((button) => button.textContent.includes("A 第"));
        }, null, { timeout: 7000 });
        assert.equal(await page.evaluate(() => document.getElementById("fixture") === window.__savedAMain), true, "site restores original A DOM objects");
        result.afterNodes = await page.evaluate(() => window.__send({ type: "conversationNavigator:export:snapshot" }).snapshot.nodes);
      }
      result.passed = true;
    } catch (error) {
      result.error = error.message;
      result.directory = await page.locator(".cnav-turn-list").allTextContents();
      await page.screenshot({ path: path.join(output, `${label}-${name.replaceAll(/[^a-z0-9]+/gi, "-")}.png`), animations: "disabled" });
    }
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${name}${result.error ? `: ${result.error}` : ""}`);
    await page.close();
  }
  const page = await context.newPage();
  const routeResult = { name: "SPA route changes clear stale conversation", passed: false, transitions: [] };
  try {
    await page.route("**/*", (route) => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: fixture(true) })
      : route.abort());
    await page.addInitScript(installMocks, settings);
    await page.goto("https://chatgpt.com/c/navigation-regression");
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.__send({ type: "conversationNavigator:pageStatus" })?.health?.userCount === 12);
    await page.evaluate(() => window.__send({ type: "conversationNavigator:pageCommand", command: "open", panel: "focus" }));
    await page.locator(".cnav-turn-list button").nth(11).waitFor();
    const transitions = [
      { route: "/g/g-p-synthetic-project/c/project-conversation", via: "push", title: "项目会话新问题" },
      { route: "/c/another-conversation", via: "push", title: "普通会话新问题" },
      { route: "/g/g-p-synthetic-project/c/project-conversation", via: "back", title: "返回项目会话问题" },
      { route: "/c/another-conversation", via: "forward", title: "前进普通会话问题" }
    ];
    for (const transition of transitions) {
      if (transition.via === "push") await page.evaluate((route) => window.__nativePushState({}, "", route), transition.route);
      else if (transition.via === "back") await page.goBack();
      else await page.goForward();
      assert.equal(new URL(page.url()).pathname, transition.route);
      await page.waitForFunction(() => document.querySelectorAll(".cnav-turn-list button").length === 0, null, { timeout: 1200 });
      // URL 已经变化、旧聊天 DOM 仍停留。整段停留期间目录应持续为空。
      await page.waitForTimeout(1300);
      assert.equal(await page.locator(".cnav-turn-list button").count(), 0, "stale DOM must not repopulate the new route");
      await page.evaluate(({ title, route }) => {
        document.getElementById("conversation").innerHTML = `<article data-testid="conversation-turn-1" data-turn-id="${route}-question"><div data-message-author-role="user">${title}</div></article><article data-testid="conversation-turn-2" data-turn-id="${route}-answer"><div data-message-author-role="assistant">新会话回答</div></article>`;
      }, transition);
      await page.waitForFunction((title) => {
        const buttons = document.querySelectorAll(".cnav-turn-list button");
        return buttons.length === 1 && buttons[0].textContent.includes(title);
      }, transition.title, { timeout: 7000 });
      routeResult.transitions.push({ ...transition, oldDirectoryClearedBeforeDomChange: true, newDirectoryQuestionCount: 1 });
    }
    routeResult.passed = true;
  } catch (error) {
    routeResult.error = error.message;
    routeResult.url = page.url();
    routeResult.directory = await page.locator(".cnav-turn-list").allTextContents();
    await page.screenshot({ path: path.join(output, `${label}-spa-route-change.png`), animations: "disabled" });
  }
  results.push(routeResult);
  console.log(`${routeResult.passed ? "PASS" : "FAIL"} ${routeResult.name}${routeResult.error ? `: ${routeResult.error}` : ""}`);
  await page.close();
} finally {
  await context.close();
  const report = {
    scope: "合成 ChatGPT 页面、完整构建 bundle、模拟 Chrome API、全部网络拦截。使用独立 D 盘 Chrome profile，未接入账号或真实聊天。",
    bundleSha256: createHash("sha256").update(bundle).digest("hex"),
    passed: results.length === scenarios.length + 2 + edgeCases.length && results.every((result) => result.passed),
    passedCount: results.filter((result) => result.passed).length,
    scenarioCount: scenarios.length + 2 + edgeCases.length, results
  };
  await writeFile(resultFile, JSON.stringify(report, null, 2));
  await writeFile(path.join(output, "README.txt"), `导航回归验证

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
`);
  if (!report.passed) process.exitCode = 1;
}
