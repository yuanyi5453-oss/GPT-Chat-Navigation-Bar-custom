import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import { CHAT_SITES, getChatSite, getConversationId, getConversationRoot, queryConversationElements } from "../src/chatSites";
import { createSiteAdapter } from "../src/siteAdapters";
import { findComposerLayout, applyComposerWidth, clearComposerWidth } from "../src/composerLayout";
import { buildSelectiveExportSnapshot } from "../src/readingTools";

const urls = {
  chatgpt: "https://chatgpt.com/c/test-conversation",
  gemini: "https://gemini.google.com/app/test-conversation",
  grok: "https://grok.com/c/test-conversation",
  deepseek: "https://chat.deepseek.com/a/chat/s/test-conversation"
};

function installDom(t: TestContext, html: string, url: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url });
  const { window } = dom;
  Object.assign(globalThis, {
    window, document: window.document, location: window.location, Element: window.Element,
    HTMLElement: window.HTMLElement, Node: window.Node, NodeFilter: window.NodeFilter,
    HTMLImageElement: window.HTMLImageElement, HTMLTableElement: window.HTMLTableElement,
    HTMLAnchorElement: window.HTMLAnchorElement
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON() {} };
  };
  t.after(() => window.close());
}

test("site registry accepts only the four requested chat services and exact hostnames", () => {
  for (const site of CHAT_SITES) for (const host of site.hosts) assert.equal(getChatSite(host)?.id, site.id);
  for (const host of ["example.com", "grok.com.evil.example", "evilchatgpt.com", "api.deepseek.com", "google.com", "x.com"]) {
    assert.equal(getChatSite(host), undefined);
    assert.equal(createSiteAdapter(host), null);
  }
  assert.equal(getChatSite("GEMINI.GOOGLE.COM.")?.id, "gemini");
});

for (const site of CHAT_SITES) {
  test(`${site.label}: roles, repeated prompts and streaming messages retain their native anchors`, (t) => {
    installDom(t, readFileSync(new URL(`./fixtures/multi-site/${site.id}.html`, import.meta.url), "utf8"), urls[site.id]);
    const adapter = createSiteAdapter(location.hostname)!;
    const before = adapter.collect();
    assert.equal(before.health.status, "ok");
    assert.deepEqual(before.messages.map((message) => message.role), ["user", "assistant", "user", "assistant"]);
    assert.equal(before.messages[0].text, "解释这个结果");
    assert.equal(before.messages[2].text, "解释这个结果");
    assert.notEqual(before.messages[0].element, before.messages[2].element);
    assert.ok(before.messages.every((message) => !/Copy|Edit|Thinking|草稿|历史记录/.test(message.text)));
    document.getElementById("streaming-tail")!.textContent += "继续生成的新内容。";
    const after = adapter.collect();
    assert.equal(after.messages.length, 4);
    assert.equal(after.messages[3].element, before.messages[3].element);
    assert.match(after.messages[3].text, /继续生成的新内容/);
    assert.ok(getConversationRoot()?.contains(after.messages[0].element));
    assert.equal(queryConversationElements("table").length, 1);
    assert.equal(queryConversationElements("pre").length, 1);
  });

  test(`${site.label}: input shell and export preserve code, tables and external sources`, (t) => {
    installDom(t, readFileSync(new URL(`./fixtures/multi-site/${site.id}.html`, import.meta.url), "utf8"), urls[site.id]);
    document.getElementById("input-shell")!.style.cssText = "border-radius:20px;background-color:white;";
    assert.ok(findComposerLayout());
    applyComposerWidth(120);
    assert.equal(document.getElementById("input-shell")!.getAttribute("data-cnav-composer-width-target"), "true");
    assert.equal(document.getElementById("conversation")!.hasAttribute("data-cnav-composer-width-ancestor"), false);
    clearComposerWidth();
    assert.equal(document.querySelectorAll("[data-cnav-composer-width-target]").length, 0);
    const collection = createSiteAdapter(location.hostname)!.collect();
    const snapshot = buildSelectiveExportSnapshot({
      title: site.label, url: location.href, pageKey: "test", exportedAt: 1,
      sourceMessages: collection.messages.map((message, index) => ({ ...message, id: `m-${index}`, turnIndex: Math.floor(index / 2) + 1 }))
    });
    assert.equal(snapshot.messages.length, 4);
    assert.equal(snapshot.messages.flatMap((message) => message.blocks).filter((block) => block.kind === "code").length, 1);
    assert.equal(snapshot.messages.flatMap((message) => message.blocks).filter((block) => block.kind === "table").length, 1);
    assert.equal(snapshot.citations.length, 1);
    assert.equal(snapshot.citations[0].canonicalUrl, "https://example.org/paper");
  });
}

test("new sites do not treat their hidden messages, editor text or sidebar entries as conversation", (t) => {
  installDom(t, `<nav><user-query>History</user-query></nav><chat-window>
    <user-query hidden>Hidden</user-query><div style="display:none"><model-response>Hidden answer</model-response></div>
    <div contenteditable="true"><user-query>Draft</user-query></div><section><p>Unknown page</p></section>
  </chat-window>`, urls.gemini);
  const result = createSiteAdapter(location.hostname)!.collect();
  assert.equal(result.health.status, "unsupported");
  assert.equal(result.messages.length, 0);
});

test("a new question is usable before the model starts replying", (t) => {
  installDom(t, "<chat-window><user-query>继续</user-query></chat-window>", urls.gemini);
  const result = createSiteAdapter(location.hostname)!.collect();
  assert.equal(result.health.status, "degraded");
  assert.equal(result.health.userCount, 1);
});

test("provider-specific conversation routes keep separate conversations separate", () => {
  for (const [id, url] of Object.entries(urls)) {
    const parsed = new URL(url);
    assert.equal(getConversationId(parsed.hostname, parsed.pathname), "test-conversation", id);
  }
  assert.equal(getConversationId("gemini.google.com", "/app"), null);
  assert.equal(getConversationId("grok.com", "/"), null);
});

test("manifest injects the release only into the registered chat domains", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const expected = CHAT_SITES.flatMap((site) => site.hosts.map((host) => `https://${host}/*`)).sort();
  assert.deepEqual(manifest.content_scripts[0].matches.toSorted(), expected);
  assert.deepEqual(manifest.host_permissions.filter((host: string) => !host.includes("raw.githubusercontent.com")).toSorted(), expected);
});
