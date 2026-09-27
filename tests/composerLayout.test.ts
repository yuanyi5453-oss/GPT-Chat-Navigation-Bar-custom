import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import { applyComposerWidth, clearComposerWidth, findComposerLayout } from "../src/composerLayout";

function installPage(t: TestContext, body: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`);
  const { window } = dom;
  Object.assign(globalThis, { window, document: window.document });
  t.after(() => window.close());
  // JSDOM 不排版：模拟原始几何和已应用的 CSS 缩放，检验测量是否先撤销旧比例。
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    let width = Number(this.getAttribute("data-natural-width") || 900);
    const root = window.document.documentElement;
    if (root.dataset.cnavComposerWidth === "true" && this.hasAttribute("data-cnav-composer-width-target")) {
      const base = Number.parseFloat(root.style.getPropertyValue("--cnav-composer-base-width"));
      const scale = Number.parseFloat(root.style.getPropertyValue("--cnav-composer-scale"));
      width = base * scale;
    }
    return { x: 20, y: 300, left: 20, right: 20 + width, top: 300, bottom: 380, width, height: 80, toJSON() {} };
  };
  return window.document;
}

function element(id: string): HTMLElement {
  return document.getElementById(id)!;
}

test("finds the bottom composer outside main without resizing the conversation container", (t) => {
  installPage(t, `
    <main id="conversation"><article data-message-author-role="assistant">Answer</article></main>
    <footer id="dock"><form id="composer" data-type="unified-composer" data-natural-width="720">
      <textarea id="prompt-textarea"></textarea><button>Send</button>
    </form></footer>
  `);
  const layout = findComposerLayout();
  assert.ok(layout);
  assert.equal(layout.target, element("composer"));
  assert.equal(layout.editor, element("prompt-textarea"));
  assert.equal(layout.host, document.body);
  assert.equal(applyComposerWidth(120), document.body);
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "720.00px");
  assert.equal(element("conversation").hasAttribute("data-cnav-composer-width-ancestor"), false);
  assert.equal(document.body.hasAttribute("data-cnav-composer-width-ancestor"), false);
});

test("a composer without form uses its painted rounded shell", (t) => {
  installPage(t, `
    <main id="host"><section data-testid="chat-composer">
      <div id="shell" data-natural-width="580" style="background:rgb(240,240,240);border-radius:20px">
        <div id="editor" contenteditable="true"></div><button>Send</button>
      </div>
    </section></main>
  `);
  const layout = findComposerLayout();
  assert.ok(layout);
  assert.equal(layout.editor, element("editor"));
  assert.equal(layout.target, element("shell"));
  assert.equal(layout.host, element("host"));
  applyComposerWidth(80);
  assert.equal(element("shell").getAttribute("data-cnav-composer-width-target"), "true");
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "580.00px");
});

test("measures the rounded background shell independently from a wider form", (t) => {
  installPage(t, `
    <main id="host"><form id="wide-form" data-type="unified-composer" data-natural-width="1080">
      <div id="shell" data-natural-width="640" style="background-color:white;border-radius:18px">
        <div><textarea id="prompt-textarea" data-natural-width="600"></textarea></div>
        <button>Send</button>
      </div>
    </form></main>
  `);
  applyComposerWidth(140);
  assert.equal(findComposerLayout()?.target, element("shell"));
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "640.00px");
  assert.equal(element("wide-form").hasAttribute("data-cnav-composer-width-target"), false);
  assert.equal(element("wide-form").getAttribute("data-cnav-composer-width-ancestor"), "true");
  assert.equal(element("host").hasAttribute("data-cnav-composer-width-ancestor"), false);
});

test("an attached document does not disqualify the actual composer shell", (t) => {
  installPage(t, `
    <form data-type="unified-composer">
      <div id="shell" data-testid="composer-background" data-natural-width="620">
        <div role="document" aria-label="Uploaded attachment">paper.pdf</div>
        <textarea id="prompt-textarea"></textarea><button>Send</button>
      </div>
    </form>
  `);
  assert.equal(findComposerLayout()?.target, element("shell"));
  applyComposerWidth(125);
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "620.00px");
});

test("excludes Canvas, existing message editors and hidden composers before selecting the live input", (t) => {
  installPage(t, `
    <section data-testid="canvas-panel"><form data-type="unified-composer"><textarea id="canvas-editor"></textarea></form></section>
    <article data-message-author-role="user"><form data-type="unified-composer"><textarea id="message-editor"></textarea></form></article>
    <article data-testid="conversation-turn-3"><form data-type="unified-composer"><textarea id="turn-editor"></textarea></form></article>
    <div hidden><form data-type="unified-composer"><textarea id="hidden-editor"></textarea></form></div>
    <div id="conversation-navigator-root"><form data-type="unified-composer"><textarea id="extension-editor"></textarea></form></div>
    <footer><form id="live-form" data-type="unified-composer"><textarea id="live-editor"></textarea><button>Send</button></form></footer>
  `);
  const layout = findComposerLayout();
  assert.equal(layout?.editor, element("live-editor"));
  assert.equal(layout?.target, element("live-form"));
  applyComposerWidth(120);
  for (const id of ["canvas-editor", "message-editor", "turn-editor", "hidden-editor", "extension-editor"]) {
    assert.equal(element(id).closest("[data-cnav-composer-width-target],[data-cnav-composer-width-ancestor]"), null);
  }
});

test("reset and explicit cleanup remove owned width markers without changing page styles", (t) => {
  installPage(t, `
    <main><div id="wrapper" style="padding:12px"><form id="composer" data-type="unified-composer" style="max-width:720px">
      <textarea id="prompt-textarea"></textarea><button>Send</button>
    </form></div></main>
  `);
  const composerStyle = element("composer").getAttribute("style");
  const wrapperStyle = element("wrapper").getAttribute("style");
  for (const reset of [clearComposerWidth, () => applyComposerWidth(100)]) {
    applyComposerWidth(130);
    assert.equal(document.documentElement.dataset.cnavComposerWidth, "true");
    reset();
    assert.equal(document.documentElement.dataset.cnavComposerWidth, undefined);
    assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "");
    assert.equal(document.querySelectorAll("[data-cnav-composer-width-target],[data-cnav-composer-width-ancestor]").length, 0);
    assert.equal(element("composer").getAttribute("style"), composerStyle);
    assert.equal(element("wrapper").getAttribute("style"), wrapperStyle);
  }
});

test("repeated application and a replacement composer remeasure the natural width without compounding", (t) => {
  installPage(t, `
    <main id="host"><form id="composer" data-type="unified-composer" data-natural-width="600">
      <textarea id="prompt-textarea"></textarea><button>Send</button>
    </form></main>
  `);
  applyComposerWidth(140);
  assert.equal(element("composer").getBoundingClientRect().width, 840);
  applyComposerWidth(120);
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "600.00px");
  assert.equal(element("composer").getBoundingClientRect().width, 720);

  element("host").innerHTML = `<div data-testid="chat-composer"><div id="replacement" data-testid="composer-surface" data-natural-width="500">
    <div id="replacement-editor" contenteditable="true"></div><button>Send</button>
  </div></div>`;
  applyComposerWidth(120);
  assert.equal(findComposerLayout()?.target, element("replacement"));
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "500.00px");
  assert.equal(element("replacement").getBoundingClientRect().width, 600);
  assert.equal(document.querySelectorAll("[data-cnav-composer-width-target]").length, 1);
});

test("a page containing only an excluded editor leaves no active composer width", (t) => {
  installPage(t, `<section data-cnav-canvas-root><form data-type="unified-composer"><textarea id="prompt-textarea"></textarea></form></section>`);
  assert.equal(findComposerLayout(), null);
  assert.equal(applyComposerWidth(125), null);
  assert.equal(document.documentElement.dataset.cnavComposerWidth, undefined);
  assert.equal(document.documentElement.dataset.cnavComposerStatus, "not-found");
  assert.equal(document.documentElement.style.getPropertyValue("--cnav-composer-base-width"), "");
});
