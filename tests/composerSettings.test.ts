import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/shared";

test("new installations and old settings use the default composer width", () => {
  assert.equal(DEFAULT_SETTINGS.composerWidthScale, 100);
  assert.equal(normalizeSettings(undefined).composerWidthScale, 100);

  const previousSettings = {
    language: "zh-TW" as const,
    chatLayoutVersion: 2 as const,
    chatContentWidth: 84,
    chatFontScale: 125,
    chatLetterSpacing: 0.6,
    chatLineHeight: 170,
    canvasContentWidth: 72,
    canvasWidthEnabled: true,
    threadResizeEnabled: true,
    drawerMode: "dock" as const,
    focusCollapseOtherTurns: false
  };
  const normalized = normalizeSettings(previousSettings);
  assert.equal(normalized.composerWidthScale, 100);
  for (const [key, value] of Object.entries(previousSettings)) {
    assert.equal(normalized[key as keyof typeof normalized], value, `preserves ${key}`);
  }
});

test("composer width clamps to 70–140 without changing body or Canvas widths", () => {
  for (const [input, expected] of [[20, 70], [70, 70], [100, 100], [125, 125], [140, 140], [300, 140]]) {
    const normalized = normalizeSettings({
      chatLayoutVersion: 2,
      chatContentWidth: 83,
      canvasContentWidth: 67,
      composerWidthScale: input
    });
    assert.equal(normalized.composerWidthScale, expected);
    assert.equal(normalized.chatContentWidth, 83);
    assert.equal(normalized.canvasContentWidth, 67);
  }
});

test("non-finite composer settings fall back and saved values survive normalization", () => {
  for (const composerWidthScale of [NaN, Infinity, -Infinity]) {
    assert.equal(normalizeSettings({ composerWidthScale }).composerWidthScale, 100);
  }
  const saved = normalizeSettings({ composerWidthScale: 120, language: "en", drawerMode: "overlay" });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(normalizeSettings({ ...saved, chatContentWidth: 95 }).composerWidthScale, 120);
});
