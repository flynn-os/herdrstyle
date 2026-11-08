import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveHerdrSemanticColors,
  getContrastRatio,
  isLightColor,
  normalizeHex,
  slugifyThemeName,
  toHerdrThemeJson,
} from "../src/themes-catalog.mjs";

test("normalizeHex normalizes 3-char and 6-char hex codes", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("1e1e2e"), "#1e1e2e");
  assert.equal(normalizeHex("invalid", "#000000"), "#000000");
});

test("isLightColor distinguishes dark and light backgrounds", () => {
  assert.equal(isLightColor("#1e1e2e"), false);
  assert.equal(isLightColor("#f7f5f0"), true);
});

test("slugifyThemeName converts display names into clean slugs", () => {
  assert.equal(slugifyThemeName("Catppuccin Mocha"), "catppuccin-mocha");
  assert.equal(slugifyThemeName("Rosé Pine Moon!"), "ros-pine-moon");
});

test("toHerdrThemeJson boosts ultra-low contrast bright-black on dark themes", () => {
  const rawTheme = {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    ansi: [
      "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
      "#20222c", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    ],
  };
  const converted = toHerdrThemeJson(rawTheme);
  assert.equal(converted.ansi.length, 16);
  assert.ok(getContrastRatio(converted.ansi[8], converted.background) > 2.2);
});

test("deriveHerdrSemanticColors applies user color overrides", () => {
  const semantic = deriveHerdrSemanticColors(
    { background: "#1e1e2e", foreground: "#cdd6f4" },
    { accent: "#cba6f7", chrome: "#11111b" },
  );
  assert.equal(semantic.accent, "#cba6f7");
  assert.equal(semantic.chrome, "#11111b");
});
