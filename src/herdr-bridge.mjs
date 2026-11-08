// ============================================================================
// Herdrstyle — Herdr App Bridge, Layout Tree Patcher & Ghostty Sync
// ============================================================================

import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir, platform } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  CANVAS_BACKGROUND_PRESETS,
  EXTRA_CURATED_THEMES,
  FEATURED_CLASSICS_META,
  HERDR_BUILTIN_THEMES,
  deriveHerdrSemanticColors,
  isLightColor,
  normalizeHex,
  slugifyThemeName,
  toHerdrThemeJson,
} from "./themes-catalog.mjs";

const execFileAsync = promisify(execFile);

export async function isExecutable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(candidate) {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function readJsonSafe(filePath, fallback = {}) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`,
  );
  const text = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
  try {
    await writeFile(tmp, text.endsWith("\n") ? text : `${text}\n`, "utf8");
    await rename(tmp, filePath);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function findHerdrAppBinary() {
  const home = homedir();
  const pathCandidates = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, "herdr-app"));
  const candidates = [
    process.env.HERDR_APP_BIN,
    path.join(home, ".local", "bin", "herdr-app"),
    "/Applications/Herdr.app/Contents/MacOS/herdr-app",
    ...pathCandidates,
  ];
  for (const c of [...new Set(candidates.filter(Boolean))]) {
    if (await isExecutable(c)) return c;
  }
  return "";
}

export async function findGhosttyBinary() {
  const pathCandidates = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, "ghostty"));
  const candidates = [
    process.env.GHOSTTY_BIN,
    "/Applications/Ghostty.app/Contents/MacOS/ghostty",
    ...pathCandidates,
    "/opt/homebrew/bin/ghostty",
    "/usr/local/bin/ghostty",
  ];
  for (const c of [...new Set(candidates.filter(Boolean))]) {
    if (await isExecutable(c)) return c;
  }
  return "";
}

export async function runCmd(binary, args, options = {}) {
  if (!binary) return { ok: false, stdout: "", stderr: "Binary not found", code: 127 };
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(binary, args, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 15_000,
      env: { ...process.env, ...(options.env || {}) },
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout || "").trim(),
      stderr: (error.stderr || error.message || "").trim(),
      code: typeof error.code === "number" ? error.code : 1,
    };
  }
}

async function parseGhosttyThemeFile(filePath, name, source = "ghostty") {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const values = new Map();
  const palette = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^\s*([a-z0-9-]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, rawVal] = match;
    if (key.toLowerCase() === "palette") {
      const pm = rawVal.match(/^(\d+)\s*=\s*(.+)$/);
      if (pm) palette.set(Number(pm[1]), normalizeHex(pm[2], "#888888"));
    } else {
      values.set(key.toLowerCase(), rawVal.replace(/^(["'])(.*)\1$/, "$2"));
    }
  }

  const background = normalizeHex(values.get("background"), "#1e1e2e");
  const foreground = normalizeHex(values.get("foreground"), "#cdd6f4");
  const selection = normalizeHex(values.get("selection-background"), "");
  const cursor = normalizeHex(values.get("cursor-color"), palette.get(4) || foreground);
  const defaultAnsi = [
    "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
    "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
  ];
  const ansi = defaultAnsi.map((fallback, idx) => palette.get(idx) || fallback);
  const id = slugifyThemeName(name);
  const meta = FEATURED_CLASSICS_META.get(id);

  return {
    id,
    herdrName: id,
    name,
    ghosttyName: name,
    source,
    featured: Boolean(meta),
    featuredRank: meta?.rank ?? 999,
    badge: meta?.badge || (source === "ghostty-user" ? "个人定制主题" : "Ghostty 主题库"),
    badgeEn: meta?.badgeEn || (source === "ghostty-user" ? "User Custom" : "Ghostty Preset"),
    description: meta?.description || "",
    descriptionEn: meta?.descriptionEn || "",
    mode: isLightColor(background) ? "light" : "dark",
    background,
    foreground,
    selection: selection || undefined,
    cursor,
    ansi,
    colors: {
      accent: ansi[4] || cursor,
    },
  };
}

async function parseHerdrThemeFile(filePath, fileName) {
  const rawName = fileName.replace(/\.json$/i, "");
  if (rawName === "win98") return null;
  const data = await readJsonSafe(filePath, null);
  if (!data || typeof data !== "object" || !data.background) return null;

  const id = slugifyThemeName(rawName);
  const meta = FEATURED_CLASSICS_META.get(id);
  const background = normalizeHex(data.background, "#1e1e2e");
  const foreground = normalizeHex(data.foreground, "#cdd6f4");
  const ansi =
    Array.isArray(data.ansi) && data.ansi.length === 16
      ? data.ansi.map((c) => normalizeHex(c, "#888888"))
      : [
          "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
          "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
        ];

  const prettyName = rawName
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

  return {
    id,
    herdrName: rawName,
    name: prettyName,
    source: "herdr-installed",
    installedInHerdr: true,
    featured: Boolean(meta),
    featuredRank: meta?.rank ?? 500,
    badge: meta?.badge || "已安装于 Herdr",
    badgeEn: meta?.badgeEn || "Installed in Herdr",
    description: meta?.description || "已安装至 ~/.config/herdr-app/themes 的自定义主题。",
    descriptionEn: meta?.descriptionEn || "Custom theme installed in ~/.config/herdr-app/themes.",
    mode: isLightColor(background) ? "light" : "dark",
    background,
    foreground,
    selection: data.selection ? normalizeHex(data.selection, "#45475a") : undefined,
    cursor: normalizeHex(data.cursor || foreground, foreground),
    ansi,
    colors: data.colors || { accent: ansi[4] || foreground },
  };
}

export async function loadAllThemes(appHome, ghosttyBinary) {
  const byId = new Map();

  for (const builtin of HERDR_BUILTIN_THEMES) {
    byId.set(builtin.id, {
      ...builtin,
      installedInHerdr: true,
      featuredRank: builtin.id === "graphite" ? 0 : 30 + HERDR_BUILTIN_THEMES.indexOf(builtin),
      semantic: deriveHerdrSemanticColors(builtin),
    });
  }

  const ghosttyThemesDir = "/Applications/Ghostty.app/Contents/Resources/ghostty/themes";
  try {
    const entries = await readdir(ghosttyThemesDir);
    const parsed = await Promise.all(
      entries.map((entryName) =>
        parseGhosttyThemeFile(path.join(ghosttyThemesDir, entryName), entryName, "ghostty"),
      ),
    );
    for (const item of parsed) {
      if (!item || byId.has(item.id)) continue;
      byId.set(item.id, {
        ...item,
        installedInHerdr: false,
        semantic: deriveHerdrSemanticColors(item),
      });
    }
  } catch {
    if (ghosttyBinary) {
      const res = await runCmd(ghosttyBinary, ["+list-themes", "--plain", "--path"]);
      if (res.ok) {
        for (const line of res.stdout.split(/\r?\n/)) {
          const m = line.match(/^(.*) \(([^()]*)\) (\/.*)$/);
          if (!m) continue;
          const item = await parseGhosttyThemeFile(
            m[3],
            m[1],
            m[2] === "user" ? "ghostty-user" : "ghostty",
          );
          if (item && !byId.has(item.id)) {
            byId.set(item.id, {
              ...item,
              installedInHerdr: false,
              semantic: deriveHerdrSemanticColors(item),
            });
          }
        }
      }
    }
  }

  const userGhosttyThemesDir = path.join(homedir(), ".config", "ghostty", "themes");
  try {
    const entries = await readdir(userGhosttyThemesDir);
    for (const entryName of entries) {
      if (entryName.startsWith(".")) continue;
      const item = await parseGhosttyThemeFile(
        path.join(userGhosttyThemesDir, entryName),
        entryName,
        "ghostty-user",
      );
      if (!item) continue;
      const existing = byId.get(item.id);
      const meta = FEATURED_CLASSICS_META.get(item.id);
      byId.set(item.id, {
        ...(existing || {}),
        ...item,
        name: existing?.name || item.name,
        badge: meta?.badge || "精调高对比度版",
        badgeEn: meta?.badgeEn || "Contrast Enhanced",
        semantic: deriveHerdrSemanticColors(item),
      });
    }
  } catch {}

  for (const extra of EXTRA_CURATED_THEMES) {
    if (!byId.has(extra.id)) {
      const meta = FEATURED_CLASSICS_META.get(extra.id);
      const item = {
        ...extra,
        herdrName: extra.id,
        featured: Boolean(meta),
        featuredRank: meta?.rank ?? 100,
        badge: meta?.badge || "精选主题",
        badgeEn: meta?.badgeEn || "Curated",
        description: meta?.description || "",
        descriptionEn: meta?.descriptionEn || "",
        mode: isLightColor(extra.background) ? "light" : "dark",
        installedInHerdr: false,
      };
      byId.set(extra.id, {
        ...item,
        semantic: deriveHerdrSemanticColors(item),
      });
    }
  }

  const herdrThemesDir = path.join(appHome, "themes");
  try {
    const files = await readdir(herdrThemesDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const parsed = await parseHerdrThemeFile(path.join(herdrThemesDir, file), file);
      if (!parsed) continue;
      const existing = byId.get(parsed.id);
      const merged = {
        ...(existing || {}),
        ...parsed,
        name: existing?.name || parsed.name,
        ghosttyName: existing?.ghosttyName || parsed.name,
        featured: Boolean(existing?.featured || parsed.featured),
        featuredRank: Math.min(existing?.featuredRank ?? 999, parsed.featuredRank ?? 999),
        badge: existing?.badge || parsed.badge,
        badgeEn: existing?.badgeEn || parsed.badgeEn,
        description: existing?.description || parsed.description,
        descriptionEn: existing?.descriptionEn || parsed.descriptionEn,
        installedInHerdr: true,
      };
      merged.semantic = deriveHerdrSemanticColors(merged);
      byId.set(parsed.id, merged);
    }
  } catch {}

  const list = [...byId.values()];
  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.featured && b.featured && a.featuredRank !== b.featuredRank) {
      return a.featuredRank - b.featuredRank;
    }
    return a.name.localeCompare(b.name);
  });
  return list;
}

export async function loadAllFonts(ghosttyBinary) {
  const priorityFonts = [
    "Maple Mono NF CN",
    "Maple Mono NF",
    "JetBrains Mono",
    "Geist Mono",
    "Geist",
    "FiraCode Nerd Font Mono",
    "Fira Code",
    "Sarasa Term SC",
    "SF Mono",
    "Menlo",
    "Monaco",
  ];
  const fontSet = new Set(priorityFonts);
  if (ghosttyBinary) {
    const res = await runCmd(ghosttyBinary, ["+list-fonts"]);
    if (res.ok) {
      for (const line of res.stdout.split(/\r?\n/)) {
        if (line && !/^\s/.test(line)) {
          fontSet.add(line.trim());
        }
      }
    }
  }
  return [...fontSet].sort((a, b) => {
    const ia = priorityFonts.indexOf(a);
    const ib = priorityFonts.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    return a.localeCompare(b);
  });
}

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function extractLayoutModel(layoutTree, layoutState = {}) {
  const root = layoutTree || {};
  const sidebar = findNode(root, "sidebar") || {};
  const workBody = findNode(root, "work-body") || {};
  const mainBlock = findNode(root, "main") || {};
  const pane = mainBlock?.content?.pane || {};
  const header = pane?.header || {};

  const pad = Array.isArray(root.terminal_padding) ? root.terminal_padding : [14, 12];
  const stateSidebarPx = layoutState?.nodes?.sidebar?.size?.px;

  let rootBgPreset = "canvas";
  let rootBgCustomColor = "#11111b";
  if (typeof root.background === "string") {
    if (["canvas", "background", "chrome"].includes(root.background)) {
      rootBgPreset = root.background;
    } else if (root.background.startsWith("#")) {
      rootBgPreset = "custom";
      rootBgCustomColor = root.background;
    }
  } else if (root.background && typeof root.background === "object" && Array.isArray(root.background.gradient)) {
    const matched = CANVAS_BACKGROUND_PRESETS.find(
      (p) =>
        typeof p.value === "object" &&
        JSON.stringify(p.value.gradient) === JSON.stringify(root.background.gradient),
    );
    rootBgPreset = matched ? matched.id : "gradient-midnight";
  }

  return {
    terminal_padding_v: Number(pad[0] ?? 14),
    terminal_padding_h: Number(pad[1] ?? 12),
    terminal_opacity: Number(root.terminal_opacity ?? 1),
    root_bg_preset: rootBgPreset,
    root_bg_custom: rootBgCustomColor,
    sidebar_width: Math.round(Number(stateSidebarPx ?? sidebar?.size?.px ?? 268)),
    sidebar_resizable: Boolean(sidebar?.resizable ?? false),
    work_padding: Number(Array.isArray(workBody.padding) ? workBody.padding[0] : (workBody.padding ?? 8)),
    work_gap: Number(workBody.gap ?? 8),
    pane_radius: Number(pane.radius ?? 10),
    pane_gap: Number(pane.gap ?? 8),
    pane_lone: Boolean(pane.lone ?? true),
    pane_border_width: Number(pane.border?.width ?? 1),
    pane_border_color: String(pane.border?.color ?? "border"),
    pane_focus_width: Number(pane.focus?.width ?? 1),
    pane_focus_color: String(pane.focus?.color ?? "accent"),
    pane_header_enabled: Boolean(pane.header),
    pane_header_reveal: String(header.reveal ?? "always"),
    pane_header_position: String(header.position ?? "top"),
    pane_header_height: Number(header.height ?? 30),
  };
}

export function applyLayoutPatchToTree(layoutTree, patch = {}) {
  const tree = JSON.parse(JSON.stringify(layoutTree || {}));

  const padV =
    patch.terminal_padding_v !== undefined
      ? Number(patch.terminal_padding_v)
      : (tree.terminal_padding?.[0] ?? 14);
  const padH =
    patch.terminal_padding_h !== undefined
      ? Number(patch.terminal_padding_h)
      : (tree.terminal_padding?.[1] ?? 12);
  tree.terminal_padding = [Math.max(0, Math.min(48, padV)), Math.max(0, Math.min(48, padH))];

  if (patch.terminal_opacity !== undefined) {
    const op = Math.max(0.15, Math.min(1, Number(patch.terminal_opacity)));
    if (op >= 0.99) delete tree.terminal_opacity;
    else tree.terminal_opacity = Number(op.toFixed(2));
  }

  if (patch.root_bg_preset !== undefined) {
    if (patch.root_bg_preset === "custom" && patch.root_bg_custom) {
      tree.background = normalizeHex(patch.root_bg_custom, "#11111b");
    } else {
      const found = CANVAS_BACKGROUND_PRESETS.find((p) => p.id === patch.root_bg_preset);
      if (found) tree.background = found.value;
    }
  }

  const sidebar = findNode(tree, "sidebar");
  if (sidebar) {
    if (patch.sidebar_width !== undefined) {
      sidebar.size = { px: Math.max(160, Math.min(480, Math.round(Number(patch.sidebar_width)))) };
    }
    if (patch.sidebar_resizable !== undefined) {
      sidebar.resizable = Boolean(patch.sidebar_resizable);
    }
  }

  const workBody = findNode(tree, "work-body");
  if (workBody) {
    if (patch.work_padding !== undefined) {
      workBody.padding = Math.max(0, Math.min(32, Math.round(Number(patch.work_padding))));
    }
    if (patch.work_gap !== undefined) {
      workBody.gap = Math.max(0, Math.min(32, Math.round(Number(patch.work_gap))));
    }
  }

  const mainBlock = findNode(tree, "main");
  if (mainBlock && mainBlock.content) {
    mainBlock.content.pane = mainBlock.content.pane || {};
    const pane = mainBlock.content.pane;
    if (patch.pane_radius !== undefined)
      pane.radius = Math.max(0, Math.min(28, Math.round(Number(patch.pane_radius))));
    if (patch.pane_gap !== undefined)
      pane.gap = Math.max(0, Math.min(28, Math.round(Number(patch.pane_gap))));
    if (patch.pane_lone !== undefined) pane.lone = Boolean(patch.pane_lone);

    pane.border = pane.border || { width: 1, color: "border" };
    if (patch.pane_border_width !== undefined)
      pane.border.width = Math.max(0, Math.min(4, Number(patch.pane_border_width)));
    if (patch.pane_border_color !== undefined) pane.border.color = String(patch.pane_border_color);

    pane.focus = pane.focus || { width: 1, color: "accent" };
    if (patch.pane_focus_width !== undefined)
      pane.focus.width = Math.max(0, Math.min(4, Number(patch.pane_focus_width)));
    if (patch.pane_focus_color !== undefined) pane.focus.color = String(patch.pane_focus_color);

    const headerEnabled =
      patch.pane_header_enabled !== undefined ? Boolean(patch.pane_header_enabled) : Boolean(pane.header);
    if (!headerEnabled) {
      delete pane.header;
    } else {
      pane.header = pane.header || {
        content: { mod: "pane" },
        reveal: "always",
        height: 30,
        position: "top",
      };
      if (patch.pane_header_reveal !== undefined) pane.header.reveal = String(patch.pane_header_reveal);
      if (patch.pane_header_position !== undefined)
        pane.header.position = String(patch.pane_header_position);
      if (patch.pane_header_height !== undefined) {
        pane.header.height = Math.max(22, Math.min(44, Math.round(Number(patch.pane_header_height))));
      }
    }
  }

  return tree;
}

export async function readHerdrState(appHome, herdrBin, themes) {
  const settingsPath = path.join(appHome, "settings.json");
  const sharedPath = path.join(appHome, "shared.json");
  const [settingsJson, sharedJson, statusRes] = await Promise.all([
    readJsonSafe(settingsPath, {}),
    readJsonSafe(sharedPath, {}),
    runCmd(herdrBin, ["status"], { env: { HERDR_APP_HOME: appHome } }),
  ]);

  let liveStatus = null;
  if (statusRes.ok && statusRes.stdout) {
    try {
      liveStatus = JSON.parse(statusRes.stdout);
    } catch {}
  }

  const activeLayoutName = liveStatus?.layout || sharedJson?.layout || "mine";
  const layoutPath = path.join(appHome, "layouts", `${activeLayoutName}.json`);
  const fallbackLayoutPath = path.join(appHome, "layouts", "main.json");
  const layoutStatePath = path.join(appHome, "layouts", ".state", `${activeLayoutName}.json`);

  const [layoutTree, layoutState] = await Promise.all([
    (async () => {
      if (await fileExists(layoutPath)) return readJsonSafe(layoutPath, {});
      return readJsonSafe(fallbackLayoutPath, {});
    })(),
    readJsonSafe(layoutStatePath, {}),
  ]);

  const darkThemeName =
    layoutState?.theme?.dark ||
    (typeof settingsJson.theme === "object" ? settingsJson.theme?.dark : settingsJson.theme) ||
    "catppuccin-mocha";
  const lightThemeName =
    layoutState?.theme?.light ||
    (typeof settingsJson.theme === "object" ? settingsJson.theme?.light : null) ||
    "paper";

  const appearance = settingsJson.appearance || "system";
  const effectiveMode = appearance === "light" ? "light" : "dark";
  const activeThemeHerdrName = effectiveMode === "light" ? lightThemeName : darkThemeName;

  const findThemeEntry = (name) => {
    const slug = slugifyThemeName(name);
    return (
      themes.find(
        (t) =>
          t.herdrName === name ||
          t.id === slug ||
          t.name.toLowerCase() === String(name).toLowerCase(),
      ) || themes[0]
    );
  };

  const activeTheme = findThemeEntry(activeThemeHerdrName);
  const darkTheme = findThemeEntry(darkThemeName);
  const lightTheme = findThemeEntry(lightThemeName);

  const layoutModel = extractLayoutModel(layoutTree, layoutState);
  const userColorOverrides =
    settingsJson.colors && typeof settingsJson.colors === "object" ? settingsJson.colors : {};
  const effectiveSemantic = deriveHerdrSemanticColors(activeTheme || {}, userColorOverrides);

  return {
    appHome,
    herdr: {
      binary: herdrBin,
      running: Boolean(liveStatus),
      status: liveStatus,
      activeLayout: activeLayoutName,
      isPersonalLayout:
        activeLayoutName !== "main" &&
        activeLayoutName !== "terminals" &&
        activeLayoutName !== "win98",
    },
    themeState: {
      appearance,
      effectiveMode,
      activeThemeId: activeTheme?.id || "catppuccin-mocha",
      darkThemeId: darkTheme?.id || "catppuccin-mocha",
      lightThemeId: lightTheme?.id || "paper",
      activeHerdrName: activeThemeHerdrName,
      darkHerdrName: darkThemeName,
      lightHerdrName: lightThemeName,
    },
    settings: {
      zoom: Number(settingsJson.zoom ?? 1.2),
      font: String(settingsJson.font || "Maple Mono NF CN"),
      font_size: Number(settingsJson.font_size ?? 14),
      ui_font: String(settingsJson.ui_font || "Maple Mono NF CN"),
      font_ligatures: Boolean(settingsJson.font_ligatures ?? false),
      minimum_contrast: Number(settingsJson.minimum_contrast ?? 1.0),
      pane_scrollbars: Boolean(settingsJson.pane_scrollbars ?? true),
      option_as_alt: String(settingsJson.option_as_alt || "auto"),
      sounds_enabled: Boolean(settingsJson.sounds?.enabled ?? true),
      colors: userColorOverrides,
    },
    layoutModel,
    effectiveSemantic,
    canvasPresets: CANVAS_BACKGROUND_PRESETS,
    rawFiles: {
      settingsPath,
      layoutPath,
      themePath: path.join(appHome, "themes", `${slugifyThemeName(activeThemeHerdrName)}.json`),
    },
  };
}

export async function ensureHerdrThemeInstalled(appHome, themeEntry) {
  if (!themeEntry) throw new Error("Theme entry not found");
  const builtinIds = new Set(["graphite", "ink", "moss", "paper"]);
  if (builtinIds.has(themeEntry.id)) {
    return { herdrName: themeEntry.id, path: null, builtin: true };
  }
  const slug = slugifyThemeName(themeEntry.herdrName || themeEntry.id);
  const themesDir = path.join(appHome, "themes");
  await mkdir(themesDir, { recursive: true });
  const targetPath = path.join(themesDir, `${slug}.json`);
  const themeJson = toHerdrThemeJson(themeEntry);
  await writeFileAtomic(targetPath, themeJson);
  themeEntry.installedInHerdr = true;
  themeEntry.herdrName = slug;
  return { herdrName: slug, path: targetPath, builtin: false, json: themeJson };
}

export async function applyStudioChanges(appHome, herdrBin, themes, payload = {}) {
  const settingsPath = path.join(appHome, "settings.json");
  const sharedPath = path.join(appHome, "shared.json");
  const settingsJson = await readJsonSafe(settingsPath, {});
  const sharedJson = await readJsonSafe(sharedPath, {});

  const findTheme = (idOrName) => {
    if (!idOrName) return null;
    const slug = slugifyThemeName(idOrName);
    return themes.find(
      (t) =>
        t.id === slug ||
        t.herdrName === idOrName ||
        t.name.toLowerCase() === String(idOrName).toLowerCase(),
    );
  };

  const themeAction = payload.themeAction;
  const commandsRun = [];

  if (themeAction) {
    if (themeAction.appearance !== undefined) {
      if (!themeAction.appearance || themeAction.appearance === "system") {
        delete settingsJson.appearance;
      } else {
        settingsJson.appearance = themeAction.appearance;
      }
    }

    if (themeAction.lightThemeId) {
      const lt = findTheme(themeAction.lightThemeId);
      if (lt) {
        const installed = await ensureHerdrThemeInstalled(appHome, lt);
        await runCmd(herdrBin, ["do", "app.theme", "--name", installed.herdrName], {
          env: { HERDR_APP_HOME: appHome },
        });
        commandsRun.push(`app.theme:${installed.herdrName}`);
      }
    }

    if (themeAction.darkThemeId) {
      const dt = findTheme(themeAction.darkThemeId);
      if (dt) {
        const installed = await ensureHerdrThemeInstalled(appHome, dt);
        await runCmd(herdrBin, ["do", "app.theme", "--name", installed.herdrName], {
          env: { HERDR_APP_HOME: appHome },
        });
        commandsRun.push(`app.theme:${installed.herdrName}`);
      }
    }

    if (themeAction.activeThemeId) {
      const at = findTheme(themeAction.activeThemeId);
      if (at) {
        const installed = await ensureHerdrThemeInstalled(appHome, at);
        if (themeAction.autoSwitchAppearance !== false) {
          settingsJson.appearance = at.mode === "light" ? "light" : "dark";
        }
        await runCmd(herdrBin, ["do", "app.theme", "--name", installed.herdrName], {
          env: { HERDR_APP_HOME: appHome },
        });
        commandsRun.push(`app.theme:${installed.herdrName}`);
      }
    }
  }

  const sp = payload.settingsPatch;
  if (sp && typeof sp === "object") {
    if (sp.zoom !== undefined) settingsJson.zoom = Number(Number(sp.zoom).toFixed(2));
    if (sp.font !== undefined) {
      if (sp.font) settingsJson.font = String(sp.font).trim();
      else delete settingsJson.font;
    }
    if (sp.font_size !== undefined) settingsJson.font_size = Number(sp.font_size);
    if (sp.ui_font !== undefined) {
      if (sp.ui_font) settingsJson.ui_font = String(sp.ui_font).trim();
      else delete settingsJson.ui_font;
    }
    if (sp.font_ligatures !== undefined) settingsJson.font_ligatures = Boolean(sp.font_ligatures);
    if (sp.minimum_contrast !== undefined)
      settingsJson.minimum_contrast = Number(Number(sp.minimum_contrast).toFixed(1));
    if (sp.pane_scrollbars !== undefined) settingsJson.pane_scrollbars = Boolean(sp.pane_scrollbars);
    if (sp.option_as_alt !== undefined) settingsJson.option_as_alt = String(sp.option_as_alt);
    if (sp.sounds_enabled !== undefined) {
      settingsJson.sounds = { ...(settingsJson.sounds || {}), enabled: Boolean(sp.sounds_enabled) };
    }
    if (sp.colors !== undefined) {
      if (!sp.colors || Object.keys(sp.colors).length === 0) {
        delete settingsJson.colors;
      } else {
        const cleanColors = {};
        for (const [k, v] of Object.entries(sp.colors)) {
          if (v && typeof v === "string" && /^#?[0-9a-f]{3,8}$/i.test(v.trim())) {
            cleanColors[k] = normalizeHex(v, "#89b4fa");
          }
        }
        if (Object.keys(cleanColors).length > 0) settingsJson.colors = cleanColors;
        else delete settingsJson.colors;
      }
    }
  }

  await writeFileAtomic(settingsPath, settingsJson);

  const lp = payload.layoutPatch;
  if (lp && typeof lp === "object" && Object.keys(lp).length > 0) {
    let activeLayout = sharedJson.layout || "mine";
    const shipped = new Set(["main", "terminals", "win98"]);
    if (shipped.has(activeLayout)) {
      const minePath = path.join(appHome, "layouts", "mine.json");
      if (await fileExists(minePath)) {
        await runCmd(herdrBin, ["do", "layout.switch", "--name", "mine"], {
          env: { HERDR_APP_HOME: appHome },
        });
        activeLayout = "mine";
      } else {
        await runCmd(herdrBin, ["do", "layout.clone", '{"name":"main","as":"mine"}'], {
          env: { HERDR_APP_HOME: appHome },
        });
        activeLayout = "mine";
      }
    }

    const layoutPath = path.join(appHome, "layouts", `${activeLayout}.json`);
    const currentTree = await readJsonSafe(layoutPath, {});
    const nextTree = applyLayoutPatchToTree(currentTree, lp);

    await writeFileAtomic(layoutPath, nextTree);
    await runCmd(herdrBin, ["do", "layout.set", "--layout", JSON.stringify(nextTree)], {
      env: { HERDR_APP_HOME: appHome },
    });

    if (lp.sidebar_width !== undefined) {
      await runCmd(
        herdrBin,
        ["do", "layout.resize", "--id", "sidebar", "--px", String(Math.round(Number(lp.sidebar_width)))],
        { env: { HERDR_APP_HOME: appHome } },
      );
    }
  }

  return { ok: true, commandsRun };
}

export async function syncToGhostty(state, activeTheme, ghosttyBin) {
  const ghosttyCfgPath = path.join(homedir(), ".config", "ghostty", "config");
  if (!(await fileExists(ghosttyCfgPath))) {
    throw new Error("Ghostty configuration file (~/.config/ghostty/config) was not found.");
  }
  let content = await readFile(ghosttyCfgPath, "utf8");
  const themeName = activeTheme.ghosttyName || activeTheme.name;

  if (
    activeTheme.source === "herdr-builtin" ||
    activeTheme.source === "curated" ||
    activeTheme.source === "herdr-installed"
  ) {
    const ghosttyThemeDir = path.join(homedir(), ".config", "ghostty", "themes");
    await mkdir(ghosttyThemeDir, { recursive: true });
    const slug = activeTheme.id;
    const lines = [
      `# Synced from Herdrstyle (${activeTheme.name})`,
      ...activeTheme.ansi.map((c, i) => `palette = ${i}=${c}`),
      `background = ${activeTheme.background}`,
      `foreground = ${activeTheme.foreground}`,
      `cursor-color = ${activeTheme.cursor || activeTheme.foreground}`,
      `selection-background = ${activeTheme.selection || "#45475a"}`,
      `selection-foreground = ${activeTheme.foreground}`,
    ];
    await writeFileAtomic(path.join(ghosttyThemeDir, slug), lines.join("\n"));
    content = content.replace(/^theme\s*=.*$/m, `theme = ${slug}`);
  } else {
    content = content.replace(/^theme\s*=.*$/m, `theme = ${themeName}`);
  }

  if (state.settings.font) {
    let replaced = false;
    content = content
      .split(/\r?\n/)
      .filter((line) => {
        if (/^\s*font-family\s*=/.test(line)) {
          if (!replaced) {
            replaced = true;
            return true;
          }
          return false;
        }
        return true;
      })
      .map((line) => (/^\s*font-family\s*=/.test(line) ? `font-family = "${state.settings.font}"` : line))
      .join("\n");
  }

  await writeFileAtomic(ghosttyCfgPath, content);

  if (ghosttyBin && platform() === "darwin") {
    const script = [
      'if application "Ghostty" is running then',
      '  tell application "Ghostty"',
      "    try",
      "      repeat with w in windows",
      "        repeat with t in tabs of w",
      "          repeat with trm in terminals of t",
      '            perform action "reload_config" on trm',
      "          end repeat",
      "        end repeat",
      "      end repeat",
      "    end try",
      "  end tell",
      "end if",
    ].join("\n");
    await runCmd("/usr/bin/osascript", ["-e", script]);
  }

  return { ok: true, ghosttyConfig: ghosttyCfgPath, theme: themeName };
}
