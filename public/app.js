// ============================================================================
// Herdrstyle Frontend Controller
// ============================================================================

import { t } from "./i18n.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const COLOR_TOKEN_DEFS = [
  { key: "accent", label: "主强调色 / Accent", desc: "按钮、焦点边框、选中指示" },
  { key: "chrome", label: "侧边栏底色 / Chrome", desc: "Spaces、Agents、标签栏背景" },
  { key: "canvas", label: "工作区画布 / Canvas", desc: "终端卡片背后的底板颜色" },
  { key: "background", label: "终端主背景 / Background", desc: "终端窗格内部背景色" },
  { key: "raised", label: "激活标签 / Raised", desc: "当前标签页与按钮背景" },
  { key: "border", label: "分割线边框 / Border", desc: "侧边栏分割线与非焦点卡片边框" },
  { key: "foreground", label: "主文本色 / Foreground", desc: "终端与标题主要文字颜色" },
  { key: "muted", label: "次要文本 / Muted", desc: "未激活标签、普通列表文字" },
  { key: "dim", label: "暗淡文本 / Dim", desc: "路径、时间戳、次要图标" },
  { key: "working", label: "运行中状态 / Working", desc: "旋转进度指示器颜色" },
  { key: "blocked", label: "需确认状态 / Blocked", desc: "Needs you 警告徽章颜色" },
  { key: "done", label: "已完成状态 / Done", desc: "任务完成圆点指示色" },
];

const state = {
  lang: localStorage.getItem("herdrstyle-lang") || "zh",
  token: "",
  appHome: "",
  herdr: { running: false, activeLayout: "mine" },
  themeState: {
    appearance: "dark",
    effectiveMode: "dark",
    activeThemeId: "catppuccin-mocha",
    darkThemeId: "catppuccin-mocha",
    lightThemeId: "paper",
  },
  settings: {
    zoom: 1.2,
    font: "Maple Mono NF CN",
    font_size: 14,
    ui_font: "Maple Mono NF CN",
    font_ligatures: false,
    minimum_contrast: 1.0,
    pane_scrollbars: true,
    option_as_alt: "auto",
    sounds_enabled: true,
    colors: {},
  },
  layoutModel: {
    terminal_padding_v: 14,
    terminal_padding_h: 12,
    terminal_opacity: 1,
    root_bg_preset: "canvas",
    root_bg_custom: "#11111b",
    sidebar_width: 268,
    sidebar_resizable: false,
    work_padding: 8,
    work_gap: 8,
    pane_radius: 10,
    pane_gap: 8,
    pane_lone: true,
    pane_border_width: 1,
    pane_border_color: "border",
    pane_focus_width: 1,
    pane_focus_color: "accent",
    pane_header_enabled: true,
    pane_header_reveal: "always",
    pane_header_position: "top",
    pane_header_height: 30,
  },
  effectiveSemantic: {},
  canvasPresets: [],
  themes: [],
  fonts: [],
  filter: "featured",
  search: "",
  stageView: "mockup",
  liveSync: true,
  history: [],
  selectedHistoryId: "",
  rawTarget: "settings",
};

let syncTimer = null;
let toastTimer = null;

function anonymizeHomePath(p) {
  return String(p || "").replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, "~");
}

function showToast(message, isError = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.style.borderColor = isError ? "var(--danger)" : "var(--border-strong)";
  el.style.color = isError ? "var(--danger)" : "var(--text)";
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) {
    headers["x-herdrstyle-token"] = state.token;
  }
  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function getActiveThemeObj() {
  return (
    state.themes.find((item) => item.id === state.themeState.activeThemeId) ||
    state.themes[0] || {
      id: "catppuccin-mocha",
      name: "Catppuccin Mocha",
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      ansi: [
        "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
        "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
      ],
      semantic: {},
    }
  );
}

function ingestServerState(data) {
  if (data.token) state.token = data.token;
  if (data.appHome) state.appHome = data.appHome;
  if (data.herdr) state.herdr = data.herdr;
  if (data.themeState) state.themeState = data.themeState;
  if (data.settings) state.settings = data.settings;
  if (data.layoutModel) state.layoutModel = data.layoutModel;
  if (data.effectiveSemantic) state.effectiveSemantic = data.effectiveSemantic;
  if (data.canvasPresets) state.canvasPresets = data.canvasPresets;
  if (data.themes) state.themes = data.themes;
  if (data.fonts) state.fonts = data.fonts;
  if (typeof data.historyCount === "number") {
    $("#nav-history-badge").textContent = `(${data.historyCount})`;
  }
}

function applyI18nStrings() {
  $$("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(state.lang, key);
  });
  const searchInput = $("#theme-search");
  if (searchInput) searchInput.placeholder = t(state.lang, "gallery.search");
  $$("#ui-lang-switcher button").forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.lang === state.lang),
  );
}

function renderStatusStrip() {
  const dot = $("#herdr-status-dot");
  const txt = $("#herdr-status-text");
  if (state.herdr.running) {
    dot.classList.remove("is-offline");
    txt.textContent = t(state.lang, "status.running");
  } else {
    dot.classList.add("is-offline");
    txt.textContent = t(state.lang, "status.offline");
  }
  $("#status-layout-name").textContent = state.herdr.activeLayout || "mine";
  $("#status-theme-name").textContent =
    state.themeState.activeHerdrName || state.themeState.activeThemeId;
  $("#status-app-home").textContent = anonymizeHomePath(state.appHome);
  $("#status-theme-count").textContent =
    state.lang === "en" ? `${state.themes.length} themes` : `${state.themes.length} 套主题`;
  $("#status-font-count").textContent =
    state.lang === "en" ? `${state.fonts.length} fonts` : `${state.fonts.length} 款字体`;
}

function renderThemeSelectors() {
  const darkSelect = $("#dark-theme-select");
  const lightSelect = $("#light-theme-select");
  if (!darkSelect || !lightSelect) return;

  const darkThemes = state.themes.filter((item) => item.mode === "dark");
  const lightThemes = state.themes.filter((item) => item.mode === "light");

  darkSelect.innerHTML = darkThemes
    .map(
      (item) =>
        `<option value="${item.id}" ${
          item.id === state.themeState.darkThemeId ? "selected" : ""
        }>${item.featured ? "★ " : ""}${item.name}</option>`,
    )
    .join("");

  lightSelect.innerHTML = lightThemes
    .map(
      (item) =>
        `<option value="${item.id}" ${
          item.id === state.themeState.lightThemeId ? "selected" : ""
        }>${item.featured ? "★ " : ""}${item.name}</option>`,
    )
    .join("");

  $$("#appearance-mode-group button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.appearance === state.themeState.appearance);
  });
}

function renderThemeGallery() {
  const gallery = $("#theme-gallery");
  if (!gallery) return;

  const q = state.search.trim().toLowerCase();
  const filtered = state.themes.filter((item) => {
    if (state.filter === "featured" && !item.featured) return false;
    if (state.filter === "dark" && item.mode !== "dark") return false;
    if (state.filter === "light" && item.mode !== "light") return false;
    if (state.filter === "installed" && !item.installedInHerdr) return false;
    if (q) {
      const hay = `${item.name} ${item.id} ${item.badge || ""} ${item.badgeEn || ""} ${
        item.description || ""
      } ${item.descriptionEn || ""}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  $("#gallery-result").textContent =
    state.lang === "en"
      ? `Showing ${filtered.length} / ${state.themes.length}`
      : `显示 ${filtered.length} / ${state.themes.length} 套`;

  const activeId = state.themeState.activeThemeId;

  gallery.innerHTML = filtered
    .map((item) => {
      const isSelected = item.id === activeId;
      const s = item.semantic || {};
      const chrome = s.chrome || item.background;
      const canvas = s.canvas || item.background;
      const bg = item.background;
      const fg = item.foreground;
      const accent = s.accent || item.ansi?.[4] || fg;
      const border = s.border || "rgba(128,128,128,0.25)";
      const dots = (item.ansi || []).slice(1, 7);
      const badgeText = isSelected
        ? state.lang === "en"
          ? "✓ Active"
          : "✓ 当前生效"
        : (state.lang === "en" ? item.badgeEn : item.badge) ||
          (item.mode === "light" ? "☀️ Light" : "🌙 Dark");
      const descText = state.lang === "en" ? item.descriptionEn || item.description : item.description;

      return `
        <button type="button" class="theme-card ${isSelected ? "is-active" : ""}" data-theme-id="${item.id}">
          <div class="theme-card-top">
            <span class="theme-card-title">${item.name}</span>
            <span class="theme-badge">${badgeText}</span>
          </div>
          <div class="mini-herdr-window" style="background:${canvas};border-color:${border}">
            <div class="mini-sidebar" style="background:${chrome};border-color:${border}">
              <div class="mini-dots"><i></i><i></i><i></i></div>
              <div class="mini-sb-line" style="width:78%;background:${accent};opacity:0.85"></div>
              <div class="mini-sb-line" style="width:62%;background:${fg};opacity:0.35"></div>
              <div class="mini-sb-line" style="width:70%;background:${fg};opacity:0.25"></div>
              <div class="mini-sb-line" style="width:52%;background:${fg};opacity:0.2;margin-top:auto"></div>
            </div>
            <div class="mini-work">
              <div class="mini-tabs" style="background:${chrome};border-color:${border}">
                <div class="mini-tab-pill" style="background:${s.raised || bg};border:1px solid ${border}"></div>
                <div class="mini-tab-pill" style="background:transparent;opacity:0.4"></div>
              </div>
              <div class="mini-canvas" style="background:${canvas}">
                <div class="mini-pane" style="background:${bg};border:1px solid ${accent}">
                  <div class="mini-code-lines">
                    <div class="mini-code-row">
                      <span style="width:16px;background:${item.ansi?.[2] || accent}"></span>
                      <span style="width:36px;background:${item.ansi?.[4] || fg}"></span>
                      <span style="width:22px;background:${item.ansi?.[5] || accent}"></span>
                    </div>
                    <div class="mini-code-row">
                      <span style="width:28px;background:${fg};opacity:0.75"></span>
                      <span style="width:40px;background:${item.ansi?.[3] || fg}"></span>
                    </div>
                  </div>
                  <div class="mini-ansi-dots">
                    ${dots.map((c) => `<span style="background:${c}"></span>`).join("")}
                  </div>
                </div>
              </div>
            </div>
          </div>
          ${descText ? `<p class="theme-card-desc">${descText}</p>` : ""}
        </button>
      `;
    })
    .join("");

  $$(".theme-card", gallery).forEach((card) => {
    card.addEventListener("click", () => selectTheme(card.dataset.themeId));
  });
}

function renderLiveStage() {
  const activeTheme = getActiveThemeObj();
  const s = {
    ...(activeTheme.semantic || {}),
    ...(state.effectiveSemantic || {}),
    ...(state.settings.colors || {}),
  };
  const lm = state.layoutModel;

  $("#stage-theme-title").textContent = `${activeTheme.name} (${
    activeTheme.mode === "light" ? "Light" : "Dark"
  })`;

  const mockup = $("#herdr-mockup");
  const sidebar = $("#hm-sidebar");
  const tabs = $("#hm-tabs");
  const canvas = $("#hm-canvas");
  const paneFocused = $("#hm-pane-focused");
  const paneUnfocused = $("#hm-pane-unfocused");
  const header1 = $("#hm-pane-header-1");
  const header2 = $("#hm-pane-header-2");
  const body1 = $("#hm-pane-body-1");
  const body2 = $("#hm-pane-body-2");
  const statusbar = $("#hm-statusbar");

  mockup.style.fontFamily = `"${state.settings.ui_font}", -apple-system, sans-serif`;
  mockup.style.borderColor = s.border || "#313244";

  sidebar.style.background = s.chrome || "#181825";
  sidebar.style.color = s.foreground || "#cdd6f4";
  sidebar.style.borderColor = s.border || "#313244";

  $("#hm-space-2").style.background = s.selected || s.raised || "#313244";
  $("#hm-tile-1").style.background = s.ansi4 || "#89b4fa";
  $("#hm-tile-2").style.background = s.ansi2 || "#a6e3a1";
  $("#hm-dot-work").style.background = s.working || "#f9e2af";
  $("#hm-dot-done").style.background = s.done || "#a6e3a1";
  $("#hm-agent-1").style.color = s.working || "#f9e2af";

  tabs.style.background = s.chrome || "#181825";
  tabs.style.borderColor = s.border || "#313244";
  $("#hm-tab-active").style.background = s.raised || "#313244";
  $("#hm-tab-active").style.color = s.foreground || "#cdd6f4";
  $("#hm-tab-active").style.border = `1px solid ${s.border || "#45475a"}`;
  $("#hm-tab-inactive").style.color = s.muted || "#a6adc8";

  const preset = state.canvasPresets.find((p) => p.id === lm.root_bg_preset);
  if (preset && typeof preset.value === "object" && Array.isArray(preset.value.gradient)) {
    canvas.style.background = `linear-gradient(${preset.value.angle || 145}deg, ${
      preset.value.gradient[0]
    }, ${preset.value.gradient[1]})`;
  } else if (lm.root_bg_preset === "background") {
    canvas.style.background = s.background || "#1e1e2e";
  } else if (lm.root_bg_preset === "chrome") {
    canvas.style.background = s.chrome || "#181825";
  } else {
    canvas.style.background = s.canvas || "#11111b";
  }
  canvas.style.padding = `${lm.work_padding}px`;
  canvas.style.gap = `${lm.pane_gap}px`;

  const focusColor =
    lm.pane_focus_color === "border"
      ? s.border
      : lm.pane_focus_color === "foreground"
      ? s.foreground
      : s.accent;

  const paneBgHex = s.background || "#1e1e2e";
  const opacity = Number(lm.terminal_opacity ?? 1);

  for (const [paneEl, isFocused] of [
    [paneFocused, true],
    [paneUnfocused, false],
  ]) {
    paneEl.style.borderRadius = `${lm.pane_radius}px`;
    paneEl.style.background = paneBgHex;
    paneEl.style.opacity = String(opacity);
    paneEl.style.border = `${isFocused ? lm.pane_focus_width : lm.pane_border_width}px solid ${
      isFocused ? focusColor : s.border
    }`;
  }

  const showHeader = lm.pane_header_enabled && lm.pane_header_reveal !== "none";
  header1.style.display = showHeader ? "flex" : "none";
  header2.style.display = showHeader ? "flex" : "none";
  header1.style.borderColor = s.border;
  header2.style.borderColor = s.border;
  header1.style.color = s.foreground;
  header2.style.color = s.muted;
  $("#hm-pane-badge-1").style.color = s.accent;

  for (const bodyEl of [body1, body2]) {
    bodyEl.style.fontFamily = `"${state.settings.font}", monospace`;
    bodyEl.style.color = s.foreground;
    bodyEl.style.padding = `${Math.max(4, Math.round(lm.terminal_padding_v * 0.65))}px ${Math.max(
      6,
      Math.round(lm.terminal_padding_h * 0.75),
    )}px`;
  }

  $("#hm-c-prompt").style.color = s.ansi2 || "#a6e3a1";
  $("#hm-c-path").style.color = s.ansi4 || "#89b4fa";
  $("#hm-c-branch").style.color = s.ansi5 || "#f5c2e7";
  $("#hm-c-cmd").style.color = s.ansi6 || "#94e2d5";
  $("#hm-c-arg").style.color = s.ansi3 || "#f9e2af";
  $("#hm-c-ok").style.color = s.ansi2 || "#a6e3a1";
  $("#hm-c-kw").style.color = s.ansi5 || "#f5c2e7";
  $("#hm-c-fn").style.color = s.ansi4 || "#89b4fa";
  $("#hm-c-str").style.color = s.ansi2 || "#a6e3a1";
  $("#hm-c-str").textContent = `"${activeTheme.herdrName || activeTheme.id}"`;
  $("#hm-c-comment").style.color = s.ansi8 || s.dim || "#7f849c";
  $("#hm-cursor").style.color = activeTheme.cursor || s.accent || "#f5e0dc";

  $("#hm-c2-title").style.color = s.working || "#f9e2af";
  $("#hm-c2-dim").style.color = s.dim || "#7f849c";
  $("#hm-c2-add").style.color = s.ansi2 || "#a6e3a1";
  $("#hm-c2-warn").style.color = s.ansi3 || "#f9e2af";
  $("#hm-c2-err").style.color = s.ansi1 || "#f38ba8";

  const ansiStrip = $("#hm-ansi-strip");
  const ansiList = activeTheme.ansi || [];
  ansiStrip.innerHTML = ansiList
    .slice(0, 16)
    .map((c, idx) => `<span title="ANSI ${idx}: ${c}" style="background:${c}"></span>`)
    .join("");

  statusbar.style.background = s.chrome || "#181825";
  statusbar.style.color = s.muted || "#a6adc8";
  statusbar.style.borderColor = s.border || "#313244";
  $("#hm-status-meta").textContent = `${state.settings.font} • Zoom ${Math.round(
    state.settings.zoom * 100,
  )}% • Radius ${lm.pane_radius}px`;

  $("#stage-zoom-slider").value = state.settings.zoom;
  $("#stage-zoom-val").textContent = `${Math.round(state.settings.zoom * 100)}%`;

  $("#stage-radius-slider").value = lm.pane_radius;
  $("#stage-radius-val").textContent = `${lm.pane_radius}px`;

  $("#stage-gap-slider").value = lm.pane_gap;
  $("#stage-gap-val").textContent = `${lm.pane_gap}px`;

  $("#stage-opacity-slider").value = lm.terminal_opacity;
  $("#stage-opacity-val").textContent = `${Math.round(lm.terminal_opacity * 100)}%`;
}

function renderLookAndCommonControls() {
  const s = {
    ...(getActiveThemeObj().semantic || {}),
    ...(state.effectiveSemantic || {}),
    ...(state.settings.colors || {}),
  };
  const userColors = state.settings.colors || {};
  const lm = state.layoutModel;

  const grid = $("#color-tokens-grid");
  if (grid) {
    grid.innerHTML = COLOR_TOKEN_DEFS.map((def) => {
      const val = (userColors[def.key] || s[def.key] || "#89b4fa").slice(0, 7);
      const isOverridden = Boolean(userColors[def.key]);
      return `
        <div class="color-token-item" style="${isOverridden ? "border-color:var(--accent)" : ""}">
          <div class="color-token-top">
            <span>${def.label}</span>
            <span class="color-token-key">${def.key}${isOverridden ? " ★" : ""}</span>
          </div>
          <span style="font-size:11px;color:var(--muted)">${def.desc}</span>
          <div class="color-picker-row">
            <input type="color" data-color-key="${def.key}" value="${val}">
            <input type="text" class="color-hex-input" data-color-hex="${def.key}" value="${val}">
          </div>
        </div>
      `;
    }).join("");

    $$("input[type='color']", grid).forEach((picker) => {
      picker.addEventListener("input", () => {
        const key = picker.dataset.colorKey;
        const hexInput = $(`input[data-color-hex="${key}"]`, grid);
        if (hexInput) hexInput.value = picker.value;
        state.settings.colors = { ...(state.settings.colors || {}), [key]: picker.value };
        renderLiveStage();
        scheduleLiveApply({ settingsPatch: { colors: state.settings.colors } });
      });
    });

    $$("input[data-color-hex]", grid).forEach((hexInput) => {
      hexInput.addEventListener("change", () => {
        const key = hexInput.dataset.colorHex;
        const v = hexInput.value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(v)) {
          const norm = v.startsWith("#") ? v : `#${v}`;
          state.settings.colors = { ...(state.settings.colors || {}), [key]: norm };
          renderLookAndCommonControls();
          renderLiveStage();
          scheduleLiveApply({ settingsPatch: { colors: state.settings.colors } });
        }
      });
    });
  }

  $$("#radius-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", Number(b.dataset.radius) === lm.pane_radius),
  );
  $$("#gap-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", Number(b.dataset.gap) === lm.pane_gap),
  );
  $$("#focus-width-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", Number(b.dataset.fwidth) === lm.pane_focus_width),
  );

  $("#look-work-padding").value = lm.work_padding;
  $("#look-work-padding-val").textContent = `${lm.work_padding}px`;
  $("#look-focus-color").value = lm.pane_focus_color;
  $("#look-pane-lone").checked = Boolean(lm.pane_lone);

  const headerMode = !lm.pane_header_enabled ? "none" : lm.pane_header_reveal;
  $("#look-header-mode").value = headerMode;
  $("#look-header-pos").value = lm.pane_header_position;
  $("#look-header-height").value = lm.pane_header_height;

  $("#look-sidebar-width").value = lm.sidebar_width;
  $("#look-sidebar-width-val").textContent = `${lm.sidebar_width}px`;
  $("#look-sidebar-resizable").checked = Boolean(lm.sidebar_resizable);
  $("#look-pad-v").value = lm.terminal_padding_v;
  $("#look-pad-h").value = lm.terminal_padding_h;

  const canvasSelect = $("#look-canvas-preset");
  if (canvasSelect && state.canvasPresets.length) {
    canvasSelect.innerHTML = state.canvasPresets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === lm.root_bg_preset ? "selected" : ""}>${
            state.lang === "en" ? p.nameEn || p.name : p.name
          }</option>`,
      )
      .join("");
  }

  const fontOpts = state.fonts
    .map((f) => `<option value="${f}" ${f === state.settings.font ? "selected" : ""}>${f}</option>`)
    .join("");
  const uiFontOpts = state.fonts
    .map(
      (f) => `<option value="${f}" ${f === state.settings.ui_font ? "selected" : ""}>${f}</option>`,
    )
    .join("");
  $("#common-font-select").innerHTML = fontOpts;
  $("#common-ui-font-select").innerHTML = uiFontOpts;

  $$("#quick-font-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.font === state.settings.font),
  );
  $$("#quick-ui-font-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.uifont === state.settings.ui_font),
  );
  $$("#fontsize-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", Number(b.dataset.fsize) === state.settings.font_size),
  );
  $("#common-font-size").value = state.settings.font_size;
  $("#common-ligatures").checked = Boolean(state.settings.font_ligatures);

  $$("#zoom-pills .pill-btn").forEach((b) =>
    b.classList.toggle("is-active", Math.abs(Number(b.dataset.zoom) - state.settings.zoom) < 0.02),
  );
  $$("#contrast-pills .pill-btn").forEach((b) =>
    b.classList.toggle(
      "is-active",
      Math.abs(Number(b.dataset.contrast) - state.settings.minimum_contrast) < 0.1,
    ),
  );
  $("#common-option-alt").value = state.settings.option_as_alt || "auto";
  $("#common-scrollbars").checked = Boolean(state.settings.pane_scrollbars);
  $("#common-sounds").checked = Boolean(state.settings.sounds_enabled);
}

function renderAll() {
  applyI18nStrings();
  renderStatusStrip();
  renderThemeSelectors();
  renderThemeGallery();
  renderLiveStage();
  renderLookAndCommonControls();
}

async function refreshLiveShot() {
  const img = $("#real-shot-img");
  if (!img) return;
  img.src = `/api/shot?t=${Date.now()}`;
}

function scheduleLiveApply(payload, immediate = false) {
  if (!state.liveSync && !immediate) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(
    async () => {
      try {
        const res = await apiFetch("/api/apply", {
          method: "POST",
          body: payload,
        });
        ingestServerState(res);
        renderStatusStrip();
        renderThemeSelectors();
        renderThemeGallery();
        renderLiveStage();
        if (state.stageView === "shot") {
          setTimeout(refreshLiveShot, 120);
        }
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    immediate ? 10 : 120,
  );
}

function selectTheme(themeId) {
  const themeObj = state.themes.find((item) => item.id === themeId);
  if (!themeObj) return;

  state.themeState.activeThemeId = themeObj.id;
  if (themeObj.mode === "light") {
    state.themeState.lightThemeId = themeObj.id;
    if (state.themeState.appearance !== "system" || state.themeState.effectiveMode !== "light") {
      state.themeState.appearance = "light";
    }
    state.themeState.effectiveMode = "light";
  } else {
    state.themeState.darkThemeId = themeObj.id;
    if (state.themeState.appearance !== "system" || state.themeState.effectiveMode !== "dark") {
      state.themeState.appearance = "dark";
    }
    state.themeState.effectiveMode = "dark";
  }
  state.effectiveSemantic = themeObj.semantic || {};

  renderAll();
  scheduleLiveApply(
    {
      themeAction: {
        appearance: state.themeState.appearance,
        darkThemeId: state.themeState.darkThemeId,
        lightThemeId: state.themeState.lightThemeId,
        activeThemeId: themeObj.id,
        autoSwitchAppearance: false,
      },
    },
    true,
  );
  showToast(`🎨 ${themeObj.name}`);
}

async function loadHistoryTab() {
  try {
    const res = await apiFetch("/api/history");
    state.history = res.items || [];
    $("#nav-history-badge").textContent = `(${state.history.length})`;
    if (!state.selectedHistoryId && state.history.length > 0) {
      state.selectedHistoryId = state.history[0].id;
    }
    renderHistoryTab();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderHistoryTab() {
  const listEl = $("#history-list");
  if (!listEl) return;

  if (state.history.length === 0) {
    listEl.innerHTML = `<p style="color:var(--muted)">No snapshots yet.</p>`;
    return;
  }

  listEl.innerHTML = state.history
    .map((item) => {
      const isSelected = item.id === state.selectedHistoryId;
      const dateStr = new Date(item.createdAt).toLocaleString();
      return `
        <button type="button" class="history-item ${isSelected ? "is-active" : ""}" data-snap-id="${item.id}">
          <strong style="font-size:13.5px">${item.label || item.id}</strong>
          <span style="font-size:11.5px;color:var(--muted)">${dateStr}</span>
        </button>
      `;
    })
    .join("");

  $$(".history-item", listEl).forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedHistoryId = btn.dataset.snapId;
      renderHistoryTab();
    });
  });

  const current = state.history.find((h) => h.id === state.selectedHistoryId) || state.history[0];
  if (current) {
    $("#history-detail-title").textContent = current.label || current.id;
    $("#history-detail-meta").textContent = `ID: ${current.id} · ${new Date(
      current.createdAt,
    ).toLocaleString()}`;
    const sum = current.summary || {};
    $("#history-visual-summary").innerHTML = [
      `Theme: ${sum.activeThemeId || "—"}`,
      `Mode: ${sum.appearance || "dark"}`,
      `Font: ${sum.font || "—"} (${sum.font_size || 14}px)`,
      `Zoom: ${Math.round((sum.zoom || 1) * 100)}%`,
      `Radius: ${sum.pane_radius ?? 10}px`,
      `Gap: ${sum.pane_gap ?? 8}px`,
    ]
      .map((tag) => `<span class="code-badge">${tag}</span>`)
      .join("");
    $("#history-json-preview").textContent = JSON.stringify(current.files, null, 2);
  }
}

async function loadRawTab(target = state.rawTarget) {
  state.rawTarget = target;
  $$("#raw-target-tabs button").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.rawTarget === target),
  );
  try {
    const res = await apiFetch(`/api/raw?target=${encodeURIComponent(target)}`);
    $("#raw-file-path").textContent = anonymizeHomePath(res.path);
    $("#raw-textarea").value = res.content;
  } catch (err) {
    showToast(err.message, true);
  }
}

function bindEvents() {
  $$(".studio-nav-pills .nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      $$(".studio-nav-pills .nav-item").forEach((b) => b.classList.toggle("is-active", b === btn));
      $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panelContent === panel));
      if (panel === "history") loadHistoryTab();
      if (panel === "raw") loadRawTab(state.rawTarget);
    });
  });

  $$("#ui-lang-switcher button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      localStorage.setItem("herdrstyle-lang", state.lang);
      renderAll();
    });
  });

  $$("#ui-theme-switcher button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.uiMode;
      document.documentElement.dataset.uiTheme = mode;
      $$("#ui-theme-switcher button").forEach((b) => b.classList.toggle("is-active", b === btn));
    });
  });

  $("#theme-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderThemeGallery();
  });

  $$("#theme-filter button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      $$("#theme-filter button").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderThemeGallery();
    });
  });

  $$("#stage-view-mode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.stageView = btn.dataset.stageView;
      $$("#stage-view-mode button").forEach((b) => b.classList.toggle("is-active", b === btn));
      $("#stage-mockup-wrap").classList.toggle("is-hidden", state.stageView !== "mockup");
      $("#stage-shot-wrap").classList.toggle("is-hidden", state.stageView !== "shot");
      if (state.stageView === "shot") refreshLiveShot();
    });
  });

  $$("#appearance-mode-group button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ap = btn.dataset.appearance;
      state.themeState.appearance = ap;
      if (ap === "light") {
        state.themeState.effectiveMode = "light";
        state.themeState.activeThemeId = state.themeState.lightThemeId;
      } else if (ap === "dark") {
        state.themeState.effectiveMode = "dark";
        state.themeState.activeThemeId = state.themeState.darkThemeId;
      }
      renderAll();
      scheduleLiveApply(
        {
          themeAction: {
            appearance: ap,
            darkThemeId: state.themeState.darkThemeId,
            lightThemeId: state.themeState.lightThemeId,
          },
        },
        true,
      );
    });
  });

  $("#dark-theme-select").addEventListener("change", (e) => {
    const id = e.target.value;
    state.themeState.darkThemeId = id;
    const isDarkActive = state.themeState.effectiveMode !== "light";
    if (isDarkActive) {
      state.themeState.activeThemeId = id;
      const dt = state.themes.find((t) => t.id === id);
      if (dt?.semantic) state.effectiveSemantic = dt.semantic;
    }
    renderAll();
    scheduleLiveApply(
      {
        themeAction: {
          darkThemeId: id,
          activeThemeId: isDarkActive ? id : undefined,
          autoSwitchAppearance: false,
        },
      },
      true,
    );
  });

  $("#light-theme-select").addEventListener("change", (e) => {
    const id = e.target.value;
    state.themeState.lightThemeId = id;
    const isLightActive = state.themeState.effectiveMode === "light";
    if (isLightActive) {
      state.themeState.activeThemeId = id;
      const lt = state.themes.find((t) => t.id === id);
      if (lt?.semantic) state.effectiveSemantic = lt.semantic;
    }
    renderAll();
    scheduleLiveApply(
      {
        themeAction: {
          lightThemeId: id,
          activeThemeId: isLightActive ? id : undefined,
          autoSwitchAppearance: false,
        },
      },
      true,
    );
  });

  $("#stage-zoom-slider").addEventListener("input", (e) => {
    state.settings.zoom = Number(e.target.value);
    renderLiveStage();
    scheduleLiveApply({ settingsPatch: { zoom: state.settings.zoom } });
  });

  $("#stage-radius-slider").addEventListener("input", (e) => {
    state.layoutModel.pane_radius = Number(e.target.value);
    renderLiveStage();
    renderLookAndCommonControls();
    scheduleLiveApply({ layoutPatch: { pane_radius: state.layoutModel.pane_radius } });
  });

  $("#stage-gap-slider").addEventListener("input", (e) => {
    state.layoutModel.pane_gap = Number(e.target.value);
    state.layoutModel.work_gap = Number(e.target.value);
    renderLiveStage();
    renderLookAndCommonControls();
    scheduleLiveApply({
      layoutPatch: {
        pane_gap: state.layoutModel.pane_gap,
        work_gap: state.layoutModel.work_gap,
      },
    });
  });

  $("#stage-opacity-slider").addEventListener("input", (e) => {
    state.layoutModel.terminal_opacity = Number(e.target.value);
    renderLiveStage();
    scheduleLiveApply({ layoutPatch: { terminal_opacity: state.layoutModel.terminal_opacity } });
  });

  $("#live-sync-checkbox").addEventListener("change", (e) => {
    state.liveSync = e.target.checked;
    showToast(state.liveSync ? "⚡️ Live Sync On" : "Live Sync Paused");
  });

  $("#refresh-shot-btn").addEventListener("click", () => {
    state.stageView = "shot";
    $$("#stage-view-mode button").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.stageView === "shot"),
    );
    $("#stage-mockup-wrap").classList.add("is-hidden");
    $("#stage-shot-wrap").classList.remove("is-hidden");
    refreshLiveShot();
    showToast("📸 Captured Herdr Window");
  });

  const saveAndSnapshot = async () => {
    try {
      const res = await apiFetch("/api/apply", {
        method: "POST",
        body: {
          themeAction: {
            appearance: state.themeState.appearance,
            darkThemeId: state.themeState.darkThemeId,
            lightThemeId: state.themeState.lightThemeId,
            activeThemeId: state.themeState.activeThemeId,
            autoSwitchAppearance: false,
          },
          settingsPatch: state.settings,
          layoutPatch: state.layoutModel,
          createSnapshot: true,
        },
      });
      ingestServerState(res);
      renderAll();
      showToast("💾 Saved Snapshot & Applied!");
    } catch (err) {
      showToast(err.message, true);
    }
  };

  $("#save-snapshot-btn").addEventListener("click", saveAndSnapshot);
  $("#save-look-btn").addEventListener("click", saveAndSnapshot);

  $("#revert-baseline-btn").addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/revert-baseline", { method: "POST" });
      ingestServerState(res);
      renderAll();
      showToast("↩ Reverted to Baseline");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#reset-colors-btn").addEventListener("click", () => {
    state.settings.colors = {};
    renderAll();
    scheduleLiveApply({ settingsPatch: { colors: {} } }, true);
    showToast("🧹 Reset Custom Color Overrides");
  });

  $$("#radius-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.layoutModel.pane_radius = Number(btn.dataset.radius);
      renderAll();
      scheduleLiveApply({ layoutPatch: { pane_radius: state.layoutModel.pane_radius } }, true);
    });
  });

  $$("#gap-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = Number(btn.dataset.gap);
      state.layoutModel.pane_gap = g;
      state.layoutModel.work_gap = g;
      renderAll();
      scheduleLiveApply({ layoutPatch: { pane_gap: g, work_gap: g } }, true);
    });
  });

  $("#look-work-padding").addEventListener("input", (e) => {
    const p = Number(e.target.value);
    state.layoutModel.work_padding = p;
    $("#look-work-padding-val").textContent = `${p}px`;
    renderLiveStage();
    scheduleLiveApply({ layoutPatch: { work_padding: p } });
  });

  $("#look-focus-color").addEventListener("change", (e) => {
    state.layoutModel.pane_focus_color = e.target.value;
    renderLiveStage();
    scheduleLiveApply({ layoutPatch: { pane_focus_color: e.target.value } }, true);
  });

  $$("#focus-width-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = Number(btn.dataset.fwidth);
      state.layoutModel.pane_focus_width = w;
      renderAll();
      scheduleLiveApply({ layoutPatch: { pane_focus_width: w } }, true);
    });
  });

  $("#look-pane-lone").addEventListener("change", (e) => {
    state.layoutModel.pane_lone = e.target.checked;
    scheduleLiveApply({ layoutPatch: { pane_lone: e.target.checked } }, true);
  });

  $("#look-header-mode").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "none") {
      state.layoutModel.pane_header_enabled = false;
    } else {
      state.layoutModel.pane_header_enabled = true;
      state.layoutModel.pane_header_reveal = v;
    }
    renderLiveStage();
    scheduleLiveApply(
      {
        layoutPatch: {
          pane_header_enabled: state.layoutModel.pane_header_enabled,
          pane_header_reveal: state.layoutModel.pane_header_reveal,
        },
      },
      true,
    );
  });

  $("#look-header-pos").addEventListener("change", (e) => {
    state.layoutModel.pane_header_position = e.target.value;
    scheduleLiveApply({ layoutPatch: { pane_header_position: e.target.value } }, true);
  });

  $("#look-header-height").addEventListener("change", (e) => {
    state.layoutModel.pane_header_height = Number(e.target.value);
    scheduleLiveApply({ layoutPatch: { pane_header_height: Number(e.target.value) } }, true);
  });

  $("#look-sidebar-width").addEventListener("input", (e) => {
    const w = Number(e.target.value);
    state.layoutModel.sidebar_width = w;
    $("#look-sidebar-width-val").textContent = `${w}px`;
    scheduleLiveApply({ layoutPatch: { sidebar_width: w } });
  });

  $("#look-sidebar-resizable").addEventListener("change", (e) => {
    state.layoutModel.sidebar_resizable = e.target.checked;
    scheduleLiveApply({ layoutPatch: { sidebar_resizable: e.target.checked } }, true);
  });

  const updatePadding = () => {
    state.layoutModel.terminal_padding_v = Number($("#look-pad-v").value);
    state.layoutModel.terminal_padding_h = Number($("#look-pad-h").value);
    renderLiveStage();
    scheduleLiveApply(
      {
        layoutPatch: {
          terminal_padding_v: state.layoutModel.terminal_padding_v,
          terminal_padding_h: state.layoutModel.terminal_padding_h,
        },
      },
      true,
    );
  };
  $("#look-pad-v").addEventListener("change", updatePadding);
  $("#look-pad-h").addEventListener("change", updatePadding);

  $("#look-canvas-preset").addEventListener("change", (e) => {
    state.layoutModel.root_bg_preset = e.target.value;
    renderLiveStage();
    scheduleLiveApply({ layoutPatch: { root_bg_preset: e.target.value } }, true);
  });

  $("#common-font-select").addEventListener("change", (e) => {
    state.settings.font = e.target.value;
    renderAll();
    scheduleLiveApply({ settingsPatch: { font: e.target.value } }, true);
  });

  $$("#quick-font-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.font = btn.dataset.font;
      renderAll();
      scheduleLiveApply({ settingsPatch: { font: btn.dataset.font } }, true);
    });
  });

  $("#common-ui-font-select").addEventListener("change", (e) => {
    state.settings.ui_font = e.target.value;
    renderAll();
    scheduleLiveApply({ settingsPatch: { ui_font: e.target.value } }, true);
  });

  $$("#quick-ui-font-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.ui_font = btn.dataset.uifont;
      renderAll();
      scheduleLiveApply({ settingsPatch: { ui_font: btn.dataset.uifont } }, true);
    });
  });

  $$("#fontsize-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sz = Number(btn.dataset.fsize);
      state.settings.font_size = sz;
      renderAll();
      scheduleLiveApply({ settingsPatch: { font_size: sz } }, true);
    });
  });

  $("#common-font-size").addEventListener("change", (e) => {
    const sz = Number(e.target.value);
    state.settings.font_size = sz;
    renderAll();
    scheduleLiveApply({ settingsPatch: { font_size: sz } }, true);
  });

  $("#common-ligatures").addEventListener("change", (e) => {
    state.settings.font_ligatures = e.target.checked;
    scheduleLiveApply({ settingsPatch: { font_ligatures: e.target.checked } }, true);
  });

  $$("#zoom-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const z = Number(btn.dataset.zoom);
      state.settings.zoom = z;
      renderAll();
      scheduleLiveApply({ settingsPatch: { zoom: z } }, true);
    });
  });

  $$("#contrast-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = Number(btn.dataset.contrast);
      state.settings.minimum_contrast = c;
      renderAll();
      scheduleLiveApply({ settingsPatch: { minimum_contrast: c } }, true);
    });
  });

  $("#common-option-alt").addEventListener("change", (e) => {
    state.settings.option_as_alt = e.target.value;
    scheduleLiveApply({ settingsPatch: { option_as_alt: e.target.value } }, true);
  });

  $("#common-scrollbars").addEventListener("change", (e) => {
    state.settings.pane_scrollbars = e.target.checked;
    scheduleLiveApply({ settingsPatch: { pane_scrollbars: e.target.checked } }, true);
  });

  $("#common-sounds").addEventListener("change", (e) => {
    state.settings.sounds_enabled = e.target.checked;
    scheduleLiveApply({ settingsPatch: { sounds_enabled: e.target.checked } }, true);
  });

  $("#sync-ghostty-btn").addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/sync-ghostty", { method: "POST" });
      showToast(`🔗 Synced (${res.theme}) to Ghostty!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#create-snapshot-now-btn").addEventListener("click", async () => {
    const label = window.prompt("Snapshot label (optional):", "");
    if (label === null) return;
    try {
      await apiFetch("/api/apply", {
        method: "POST",
        body: { createSnapshot: true, snapshotLabel: label },
      });
      await loadHistoryTab();
      showToast("📸 Snapshot Created!");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#history-restore-btn").addEventListener("click", async () => {
    if (!state.selectedHistoryId) return;
    try {
      const res = await apiFetch("/api/history/restore", {
        method: "POST",
        body: { id: state.selectedHistoryId },
      });
      ingestServerState(res);
      renderAll();
      showToast("⏪ Restored Snapshot!");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#history-rename-btn").addEventListener("click", async () => {
    if (!state.selectedHistoryId) return;
    const cur = state.history.find((h) => h.id === state.selectedHistoryId);
    const nextLabel = window.prompt("New snapshot label:", cur?.label || "");
    if (!nextLabel) return;
    try {
      const res = await apiFetch("/api/history/rename", {
        method: "POST",
        body: { id: state.selectedHistoryId, label: nextLabel },
      });
      state.history = res.items || [];
      renderHistoryTab();
      showToast("✏️ Snapshot Renamed");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#history-delete-btn").addEventListener("click", async () => {
    if (!state.selectedHistoryId) return;
    try {
      const res = await apiFetch("/api/history/delete", {
        method: "POST",
        body: { id: state.selectedHistoryId },
      });
      state.history = res.items || [];
      state.selectedHistoryId = state.history[0]?.id || "";
      $("#nav-history-badge").textContent = `(${state.history.length})`;
      renderHistoryTab();
      showToast("🗑 Snapshot Deleted");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $$("#raw-target-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => loadRawTab(btn.dataset.rawTarget));
  });

  $("#raw-format-btn").addEventListener("click", () => {
    const ta = $("#raw-textarea");
    try {
      const obj = JSON.parse(ta.value);
      ta.value = `${JSON.stringify(obj, null, 2)}\n`;
      showToast("✓ Valid JSON formatted");
    } catch (err) {
      showToast(`Invalid JSON: ${err.message}`, true);
    }
  });

  $("#raw-save-btn").addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/raw", {
        method: "POST",
        body: {
          target: state.rawTarget,
          content: $("#raw-textarea").value,
        },
      });
      ingestServerState(res);
      renderAll();
      showToast("💾 Saved & Applied!");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("#shutdown-btn").addEventListener("click", async () => {
    try {
      await apiFetch("/api/shutdown", { method: "POST" });
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px;text-align:center">
          <h2 style="margin:0">Herdrstyle Studio Stopped</h2>
          <p style="color:var(--muted);margin:0">All changes are saved in ~/.config/herdr-app. You can safely close this tab.</p>
        </div>
      `;
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

async function init() {
  bindEvents();
  try {
    const data = await apiFetch("/api/state");
    ingestServerState(data);
    renderAll();
  } catch (err) {
    showToast(err.message, true);
  }
}

init();
