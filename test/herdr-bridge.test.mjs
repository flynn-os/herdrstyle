import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyLayoutPatchToTree,
  applyStudioChanges,
  extractLayoutModel,
  loadAllThemes,
  readHerdrState,
} from "../src/herdr-bridge.mjs";

const SAMPLE_LAYOUT = {
  id: "root",
  type: "row",
  background: "canvas",
  terminal_padding: [14, 12],
  children: [
    {
      id: "sidebar",
      type: "column",
      size: { px: 268 },
      resizable: false,
      children: [],
    },
    {
      id: "work",
      type: "column",
      children: [
        {
          id: "work-body",
          type: "row",
          padding: 8,
          gap: 8,
          children: [
            {
              id: "main",
              type: "block",
              content: {
                tab: "active",
                pane: {
                  radius: 10,
                  gap: 8,
                  lone: true,
                  border: { width: 1, color: "border" },
                  focus: { width: 1, color: "accent" },
                  header: {
                    content: { mod: "pane" },
                    reveal: "always",
                    height: 30,
                    position: "top",
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

test("extractLayoutModel reads pane and workspace geometry", () => {
  const model = extractLayoutModel(SAMPLE_LAYOUT);
  assert.equal(model.pane_radius, 10);
  assert.equal(model.pane_gap, 8);
  assert.equal(model.sidebar_width, 268);
  assert.equal(model.pane_focus_color, "accent");
});

test("applyLayoutPatchToTree updates pane radius, gap, opacity, and sidebar width", () => {
  const patched = applyLayoutPatchToTree(SAMPLE_LAYOUT, {
    pane_radius: 16,
    pane_gap: 12,
    terminal_opacity: 0.85,
    sidebar_width: 310,
    pane_header_enabled: false,
  });
  const model = extractLayoutModel(patched);
  assert.equal(model.pane_radius, 16);
  assert.equal(model.pane_gap, 12);
  assert.equal(model.terminal_opacity, 0.85);
  assert.equal(model.sidebar_width, 310);
  assert.equal(model.pane_header_enabled, false);
});

test("applyStudioChanges preserves light theme when layout.set clears .state (Save Snapshot & Apply)", async () => {
  const tempHome = await mkdtemp(path.join(tmpdir(), "herdrstyle-bridge-"));
  try {
    await mkdir(path.join(tempHome, "layouts", ".state"), { recursive: true });
    await mkdir(path.join(tempHome, "themes"), { recursive: true });
    await writeFile(
      path.join(tempHome, "shared.json"),
      JSON.stringify({ layout: "mine" }, null, 2),
    );
    await writeFile(
      path.join(tempHome, "settings.json"),
      JSON.stringify({ zoom: 1, appearance: "light" }, null, 2),
    );
    await writeFile(
      path.join(tempHome, "layouts", "mine.json"),
      JSON.stringify(SAMPLE_LAYOUT, null, 2),
    );

    // Mock herdr-app binary that mimics real Herdr behavior:
    // - `do layout.set` wipes `layouts/.state/mine.json`
    // - `do app.theme --name <n>` sets light/dark half in `layouts/.state/mine.json`
    // - Simulates FSEvents delay on first attempt for `flexoki-light`
    const mockBin = path.join(tempHome, "mock-herdr-app.mjs");
    await writeFile(
      mockBin,
      `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const home = process.env.HERDR_APP_HOME;
const args = process.argv.slice(2);
const statePath = path.join(home, "layouts", ".state", "mine.json");
const logPath = path.join(home, "commands.log");

if (args[0] === "status") {
  console.log(JSON.stringify({ layout: "mine", zoom: 1 }));
  process.exit(0);
}

if (args[0] === "do") {
  const cmd = args[1];
  fs.appendFileSync(logPath, cmd + ":" + args.slice(2).join(" ") + "\\n");
  if (cmd === "layout.set") {
    // Real Herdr clears click/theme state when replacing a personal layout tree
    fs.rmSync(statePath, { force: true });
    console.log(JSON.stringify({ ok: true }));
    process.exit(0);
  }
  if (cmd === "app.theme") {
    const idx = args.indexOf("--name");
    const name = idx !== -1 ? args[idx + 1] : "";
    const markerPath = path.join(home, ".seen-" + name);
    if (name === "flexoki-light" && !fs.existsSync(markerPath)) {
      fs.writeFileSync(markerPath, "1");
      console.log(JSON.stringify({ error: 'no theme "' + name + '"' }));
      process.exit(1);
    }
    let st = {};
    try { st = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
    st.theme = st.theme || { light: "paper", dark: "graphite" };
    const isLight = ["paper", "dayfox", "flexoki-light", "catppuccin-latte"].includes(name);
    if (isLight) st.theme.light = name;
    else st.theme.dark = name;
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
    console.log(JSON.stringify({ ok: true }));
    process.exit(0);
  }
  console.log(JSON.stringify({ ok: true }));
  process.exit(0);
}
`,
    );
    await chmod(mockBin, 0o755);

    const themes = await loadAllThemes(tempHome, "");

    // 1. Simulate clicking "Save Snapshot & Apply" with a newly installed light theme (flexoki-light) + layoutPatch
    const res = await applyStudioChanges(
      tempHome,
      mockBin,
      themes,
      {
        themeAction: {
          appearance: "light",
          darkThemeId: "catppuccin-mocha",
          lightThemeId: "flexoki-light",
          activeThemeId: "flexoki-light",
          autoSwitchAppearance: false,
        },
        settingsPatch: { zoom: 1.1 },
        layoutPatch: { pane_radius: 14, pane_gap: 8 },
      },
      { systemAppearance: "light" },
    );
    assert.equal(res.ok, true);

    // Verify layout.set ran BEFORE app.theme
    const logLines = (await readFile(path.join(tempHome, "commands.log"), "utf8"))
      .trim()
      .split("\n");
    const layoutSetIdx = logLines.findIndex((l) => l.startsWith("layout.set:"));
    const lastThemeIdx = logLines.findLastIndex((l) => l.startsWith("app.theme:"));
    assert.ok(layoutSetIdx >= 0 && lastThemeIdx > layoutSetIdx);

    // Verify settings.json persisted theme.{light, dark}
    const savedSettings = JSON.parse(await readFile(path.join(tempHome, "settings.json"), "utf8"));
    assert.deepEqual(savedSettings.theme, {
      light: "flexoki-light",
      dark: "catppuccin-mocha",
    });

    // Verify readHerdrState reports flexoki-light (NOT reset to paper!)
    const updatedThemes = await loadAllThemes(tempHome, "");
    const stateAfterSave = await readHerdrState(tempHome, mockBin, updatedThemes, {
      systemAppearance: "light",
    });
    assert.equal(stateAfterSave.themeState.activeThemeId, "flexoki-light");
    assert.equal(stateAfterSave.themeState.lightThemeId, "flexoki-light");
    assert.equal(stateAfterSave.themeState.darkThemeId, "catppuccin-mocha");

    // 2. Simulate subsequent layout-only slider change: must NOT wipe flexoki-light back to paper
    await applyStudioChanges(
      tempHome,
      mockBin,
      updatedThemes,
      { layoutPatch: { pane_radius: 18 } },
      { systemAppearance: "light" },
    );
    const stateAfterSlider = await readHerdrState(tempHome, mockBin, updatedThemes, {
      systemAppearance: "light",
    });
    assert.equal(stateAfterSlider.themeState.activeThemeId, "flexoki-light");
    assert.equal(stateAfterSlider.layoutModel.pane_radius, 18);

    // 3. Verify appearance: "system" on a Light-mode OS resolves effectiveMode = "light"
    await applyStudioChanges(
      tempHome,
      mockBin,
      updatedThemes,
      { themeAction: { appearance: "system" } },
      { systemAppearance: "light" },
    );
    const stateSystemLight = await readHerdrState(tempHome, mockBin, updatedThemes, {
      systemAppearance: "light",
    });
    assert.equal(stateSystemLight.themeState.appearance, "system");
    assert.equal(stateSystemLight.themeState.effectiveMode, "light");
    assert.equal(stateSystemLight.themeState.activeThemeId, "flexoki-light");

    const stateSystemDark = await readHerdrState(tempHome, mockBin, updatedThemes, {
      systemAppearance: "dark",
    });
    assert.equal(stateSystemDark.themeState.effectiveMode, "dark");
    assert.equal(stateSystemDark.themeState.activeThemeId, "catppuccin-mocha");
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});
