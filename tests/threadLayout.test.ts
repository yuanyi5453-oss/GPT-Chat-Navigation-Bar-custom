import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { getThreadContentBounds } from "../src/threadLayout";

function installMain(padding = "0px") {
  const dom = new JSDOM(`<main style="padding:${padding};border:2px solid"></main>`);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  Object.defineProperty(window, "innerWidth", { value: 2048 });
  const main = document.querySelector("main")!;
  main.getBoundingClientRect = () => ({ left: 260, right: 2048, top: 52 } as DOMRect);
  return main;
}

test("resize handles use the remaining chat area when the drawer docks and restore on close", () => {
  const main = installMain("0px 16px");
  const original = getThreadContentBounds(main);
  assert.deepEqual(original, { left: 278, right: 2030, top: 52 });

  main.style.paddingRight = "404px";
  const docked = getThreadContentBounds(main);
  assert.deepEqual(docked, { left: 278, right: 1642, top: 52 });
  assert.equal((original.left + original.right - docked.left - docked.right) / 2, 194);

  main.style.paddingRight = "16px";
  assert.deepEqual(getThreadContentBounds(main), original);
});

test("content bounds remain within the viewport and cannot have negative width", () => {
  const main = installMain("0px 404px 0px 12px");
  main.getBoundingClientRect = () => ({ left: -100, right: 250, top: 0 } as DOMRect);
  assert.deepEqual(getThreadContentBounds(main), { left: 0, right: 0, top: 0 });
});

test("pages without a main element use viewport bounds", () => {
  installMain();
  assert.deepEqual(getThreadContentBounds(null), { left: 0, right: 2048, top: 0 });
});
