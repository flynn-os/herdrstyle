// ============================================================================
// Herdrstyle — Theme Catalog, Color Derivation & Ghostty-to-Herdr Converter
// ============================================================================

export function normalizeHex(value, fallback = "#1e1e2e") {
  const raw = String(value || "").trim();
  const m6 = raw.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = raw.match(/^#?([0-9a-f]{3})$/i);
  if (m3) {
    return `#${[...m3[1].toLowerCase()].map((c) => c + c).join("")}`;
  }
  return fallback;
}

export function hexToRgb(hex) {
  const clean = normalizeHex(hex, "#000000").slice(1);
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(hexA, hexB, weightB = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex([
    a[0] * (1 - w) + b[0] * w,
    a[1] * (1 - w) + b[1] * w,
    a[2] * (1 - w) + b[2] * w,
  ]);
}

export function getLuminance(hex) {
  const rgb = hexToRgb(hex).map((v) => v / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function getContrastRatio(hexA, hexB) {
  const l1 = getLuminance(hexA);
  const l2 = getLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

export function isLightColor(hex) {
  return getLuminance(hex) > 0.45;
}

export function slugifyThemeName(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom-theme"
  );
}

// Derive full Herdr semantic UI palette from terminal colors + overrides
export function deriveHerdrSemanticColors(themeObj, userOverrides = {}) {
  const bg = normalizeHex(themeObj.background, "#1e1e2e");
  const fg = normalizeHex(themeObj.foreground, "#cdd6f4");
  const light = isLightColor(bg);
  const ansi =
    Array.isArray(themeObj.ansi) && themeObj.ansi.length >= 16
      ? themeObj.ansi.map((c, idx) => normalizeHex(c, idx < 8 ? "#6c7086" : "#a6adc8"))
      : [
          "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
          "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
        ];

  const baseColors = themeObj.colors || {};
  const defaultAccent = normalizeHex(
    baseColors.accent || ansi[4] || ansi[12] || themeObj.cursor || "#89b4fa",
    "#89b4fa",
  );

  const chrome = light ? mixHex(bg, "#000000", 0.045) : mixHex(bg, "#000000", 0.22);
  const canvas = light ? mixHex(bg, "#000000", 0.03) : mixHex(bg, "#000000", 0.14);
  const surface = bg;
  const raised = light ? mixHex(bg, "#000000", 0.065) : mixHex(bg, "#ffffff", 0.065);
  const hover = light ? mixHex(bg, "#000000", 0.09) : mixHex(bg, "#ffffff", 0.095);
  const selected = light ? mixHex(bg, defaultAccent, 0.16) : mixHex(bg, defaultAccent, 0.18);
  const border = light ? mixHex(bg, fg, 0.14) : mixHex(bg, fg, 0.13);
  const input = light ? mixHex(bg, fg, 0.22) : mixHex(bg, fg, 0.2);
  const muted = mixHex(fg, bg, 0.32);
  const dim = mixHex(fg, bg, 0.52);

  const selection = normalizeHex(
    themeObj.selection ||
      baseColors.selection ||
      (light ? mixHex(bg, defaultAccent, 0.25) : mixHex(bg, defaultAccent, 0.3)),
    "#45475a",
  );
  const cursor = normalizeHex(themeObj.cursor || defaultAccent, fg);

  const derived = {
    background: bg,
    foreground: fg,
    canvas,
    chrome,
    surface,
    popover: raised,
    raised,
    hover,
    selected,
    border,
    input,
    muted,
    dim,
    accent: defaultAccent,
    accent_foreground: isLightColor(defaultAccent) ? "#11111b" : "#ffffff",
    solid: fg,
    solid_foreground: bg,
    selection,
    cursor,
    working: normalizeHex(baseColors.working || ansi[3] || "#f9e2af", "#f9e2af"),
    blocked: normalizeHex(baseColors.blocked || ansi[1] || "#f38ba8", "#f38ba8"),
    done: normalizeHex(baseColors.done || ansi[2] || "#a6e3a1", "#a6e3a1"),
    idle: normalizeHex(baseColors.idle || dim, dim),
  };

  for (let i = 0; i < 16; i += 1) {
    derived[`ansi${i}`] = ansi[i];
  }

  for (const [k, v] of Object.entries(baseColors)) {
    if (v && typeof v === "string") derived[k] = normalizeHex(v, derived[k] || v);
  }
  for (const [k, v] of Object.entries(userOverrides || {})) {
    if (v && typeof v === "string") derived[k] = normalizeHex(v, derived[k] || v);
  }

  return derived;
}

// Convert any catalog theme entry into a clean Herdr themes/<slug>.json object
export function toHerdrThemeJson(themeEntry) {
  const bg = normalizeHex(themeEntry.background, "#1e1e2e");
  const fg = normalizeHex(themeEntry.foreground, "#cdd6f4");
  const selection = normalizeHex(themeEntry.selection || mixHex(bg, fg, 0.22), "#45475a");
  const cursor = normalizeHex(themeEntry.cursor || fg, fg);
  const ansi =
    Array.isArray(themeEntry.ansi) && themeEntry.ansi.length === 16
      ? themeEntry.ansi.map((c) => normalizeHex(c, "#888888"))
      : [
          "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
          "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
        ];

  const adjustedAnsi = [...ansi];
  if (!isLightColor(bg) && getContrastRatio(adjustedAnsi[8], bg) < 2.5) {
    adjustedAnsi[8] = mixHex(adjustedAnsi[8], fg, 0.32);
  }

  const accent = normalizeHex(
    themeEntry.colors?.accent || adjustedAnsi[4] || adjustedAnsi[12] || cursor,
    "#89b4fa",
  );

  return {
    background: bg,
    foreground: fg,
    selection,
    cursor,
    ansi: adjustedAnsi,
    colors: {
      accent,
      ...(themeEntry.colors || {}),
    },
  };
}

// Herdr's 4 built-in presets
export const HERDR_BUILTIN_THEMES = [
  {
    id: "graphite",
    herdrName: "graphite",
    name: "Graphite (Herdr Built-in)",
    source: "herdr-builtin",
    featured: true,
    badge: "Herdr 官方内置",
    badgeEn: "Herdr Built-in",
    description: "Herdr 默认旗舰石墨暗色主题，冷静克制的工程灰阶美学。",
    descriptionEn: "Herdr's default flagship slate dark theme with balanced neutral grays.",
    mode: "dark",
    background: "#141619",
    foreground: "#e2e5ea",
    selection: "#2b313a",
    cursor: "#9ba8b8",
    ansi: [
      "#23272e", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
      "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff",
    ],
    colors: {
      accent: "#7b93b6",
      chrome: "#0f1114",
      canvas: "#0b0d0f",
    },
  },
  {
    id: "ink",
    herdrName: "ink",
    name: "Ink (Herdr Built-in)",
    source: "herdr-builtin",
    featured: true,
    badge: "Herdr 官方内置",
    badgeEn: "Herdr Built-in",
    description: "Herdr 官方深邃午夜墨蓝主题，更高对比度与沉浸感。",
    descriptionEn: "Deep midnight ink theme shipped with Herdr for high-contrast focus.",
    mode: "dark",
    background: "#0f1218",
    foreground: "#dce3ef",
    selection: "#232c3d",
    cursor: "#7aa2f7",
    ansi: [
      "#1a202c", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
      "#565f89", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    ],
    colors: {
      accent: "#6e96e8",
      chrome: "#0a0d12",
      canvas: "#07090d",
    },
  },
  {
    id: "moss",
    herdrName: "moss",
    name: "Moss (Herdr Built-in)",
    source: "herdr-builtin",
    featured: true,
    badge: "Herdr 官方内置",
    badgeEn: "Herdr Built-in",
    description: "Herdr 官方森林苔藓暗绿主题，自然温润、长时间盯屏极度护眼。",
    descriptionEn: "Organic forest moss dark palette designed for long coding sessions.",
    mode: "dark",
    background: "#131715",
    foreground: "#d8e2dc",
    selection: "#26332c",
    cursor: "#87b398",
    ansi: [
      "#1e2622", "#e67e80", "#a7c080", "#dbbc7f", "#7fbbb3", "#d699b6", "#83c092", "#d3c6aa",
      "#5c6a62", "#e67e80", "#a7c080", "#dbbc7f", "#7fbbb3", "#d699b6", "#83c092", "#edf3ef",
    ],
    colors: {
      accent: "#7dab8e",
      chrome: "#0e1210",
      canvas: "#0a0d0b",
    },
  },
  {
    id: "paper",
    herdrName: "paper",
    name: "Paper (Herdr Built-in)",
    source: "herdr-builtin",
    featured: true,
    badge: "Herdr 官方内置",
    badgeEn: "Herdr Built-in",
    description: "Herdr 官方暖白纸张浅色主题，日光下清爽通透、如纸质书籍般舒适。",
    descriptionEn: "Warm daylight paper light theme with crisp ink typography.",
    mode: "light",
    background: "#f7f5f0",
    foreground: "#1f2328",
    selection: "#dce4f2",
    cursor: "#3b5bdb",
    ansi: [
      "#24292f", "#cf222e", "#1a7f37", "#9a6700", "#0969da", "#8250df", "#1b7c83", "#6e7781",
      "#57606a", "#a40e26", "#116329", "#7d4e00", "#0550ae", "#6639ba", "#136065", "#1f2328",
    ],
    colors: {
      accent: "#3b5bdb",
      chrome: "#eeeae2",
      canvas: "#e8e3da",
    },
  },
];

// Metadata for top community classics
export const FEATURED_CLASSICS_META = new Map([
  ["catppuccin-mocha", {
    rank: 1,
    badge: "社区人气 #1",
    badgeEn: "Community #1",
    description: "Catppuccin 旗舰深色主题：柔和紫蓝暗底配温润粉彩语义色，对比度均衡不刺眼。",
    descriptionEn: "Soothing pastel dark theme with warm indigo-charcoal base and vibrant semantics.",
  }],
  ["tokyonight-night", {
    rank: 2,
    badge: "极客经典",
    badgeEn: "Dev Classic",
    description: "TokyoNight 午夜霓虹冷蓝调，深邃静谧，现代开发者最钟爱的暗夜配色之一。",
    descriptionEn: "Clean midnight neon blue palette celebrating the lights of downtown Tokyo.",
  }],
  ["rose-pine", {
    rank: 3,
    badge: "文艺高颜值",
    badgeEn: "Aesthetic",
    description: "Rosé Pine 低饱和丝绒暗紫底配玫瑰金与松木青，极简优雅。",
    descriptionEn: "All natural pine, faux fur and a bit of soho vibes for the classy minimalist.",
  }],
  ["kanagawa-wave", {
    rank: 4,
    badge: "东方美学",
    badgeEn: "Ukiyo-e",
    description: "灵感源自葛饰北斋《神奈川冲浪里》，墨蓝底配浮世绘米白与珊瑚红。",
    descriptionEn: "Inspired by Katsushika Hokusai's famous woodblock print with sumi ink tones.",
  }],
  ["gruvbox-dark", {
    rank: 5,
    badge: "复古常青树",
    badgeEn: "Retro Groove",
    description: "Gruvbox 经典暖调复古暗色，琥珀黄与砖红高辨识度，老牌程序员信仰之选。",
    descriptionEn: "Iconic warm retro groove palette with unmistakable amber and earth accents.",
  }],
  ["dracula", {
    rank: 6,
    badge: "传奇暗色",
    badgeEn: "Iconic Dark",
    description: "Dracula 经典暗紫高饱和配色，色彩鲜明、语法高亮层次极强。",
    descriptionEn: "Legendary high-contrast dark purple theme with punchy syntax highlights.",
  }],
  ["nord", {
    rank: 7,
    badge: "极地冷淡风",
    badgeEn: "Arctic",
    description: "Nord 北极冰川冷蓝灰配色，克制纯净，适合沉浸式编码。",
    descriptionEn: "An arctic, north-bluish clean and uncluttered color palette.",
  }],
  ["everforest-dark-hard", {
    rank: 8,
    badge: "护眼森林",
    badgeEn: "Eye Care",
    description: "Everforest 柔和森林绿暗调，专为降低视觉疲劳设计的有机自然色盘。",
    descriptionEn: "Green-based soft organic color scheme designed to be warm and easy on the eyes.",
  }],
  ["catppuccin-macchiato", {
    rank: 9,
    badge: "Catppuccin",
    badgeEn: "Catppuccin",
    description: "比 Mocha 略轻盈半档的中深色玛奇朵色调，层次细腻。",
    descriptionEn: "Medium-dark Catppuccin flavor with balanced contrast and gentle warmth.",
  }],
  ["catppuccin-frappe", {
    rank: 10,
    badge: "Catppuccin",
    badgeEn: "Catppuccin",
    description: "柔和暮色紫灰底，适合偏爱中等暗度与柔和反差的开发者。",
    descriptionEn: "Soft twilight slate variant of Catppuccin with subdued contrast.",
  }],
  ["tokyonight-storm", {
    rank: 11,
    badge: "TokyoNight",
    badgeEn: "TokyoNight",
    description: "风暴灰蓝版 TokyoNight，底色比 Night 稍亮，蓝紫霓虹依旧犀利。",
    descriptionEn: "Stormy deep-slate variant of TokyoNight with crisp neon accents.",
  }],
  ["rose-pine-moon", {
    rank: 12,
    badge: "Rosé Pine",
    badgeEn: "Rosé Pine",
    description: "月光版 Rosé Pine，更具通透感的深靛紫与月白组合。",
    descriptionEn: "Moonlit indigo variant of Rosé Pine with airy contrast.",
  }],
  ["kanagawa-dragon", {
    rank: 13,
    badge: "深邃炭黑",
    badgeEn: "Deep Charcoal",
    description: "Kanagawa 暗黑龙版，炭黑暖灰底色，更适合深夜低光环境。",
    descriptionEn: "Darker charcoal dragon variant of Kanagawa for late-night sessions.",
  }],
  ["atom-one-dark", {
    rank: 14,
    badge: "经典编辑器",
    badgeEn: "Editor Classic",
    description: "Atom / VS Code 时代最深入人心的经典 One Dark 配色。",
    descriptionEn: "The timeless Atom One Dark palette loved across modern code editors.",
  }],
  ["vesper", {
    rank: 15,
    badge: "极简高定",
    badgeEn: "Minimal Dark",
    description: "Vercel 风格碳黑配暖杏橙与薄荷绿，极致克制的高级现代暗黑风。",
    descriptionEn: "Sublime high-contrast minimalism pairing carbon black with warm peppermint & amber.",
  }],
  ["poimandres", {
    rank: 16,
    badge: "现代极光",
    badgeEn: "Neon Mint",
    description: "冷调深青灰碰撞薄荷青与星云粉，极具未来感。",
    descriptionEn: "Deep blue-gray slate with glowing neon mint and soft magenta accents.",
  }],
  ["night-owl", {
    rank: 17,
    badge: "夜猫子专属",
    badgeEn: "Night Owl",
    description: "Sarah Drasner 专为夜间低光阅读调校的深海蓝配色。",
    descriptionEn: "Fine-tuned by Sarah Drasner for low-light nighttime legibility.",
  }],
  ["ayu-mirage", {
    rank: 18,
    badge: "现代明快",
    badgeEn: "Ayu Mirage",
    description: "Ayu Mirage 柔和深蓝灰配暖橙高亮，UI 与代码质感极佳。",
    descriptionEn: "Modern deep blue-gray UI palette with warm golden-orange highlights.",
  }],
  ["solarized-dark-higher-contrast", {
    rank: 19,
    badge: "科学色盘",
    badgeEn: "Solarized",
    description: "增强对比度版 Solarized Dark，经典的青蓝底色与精密光学对称色。",
    descriptionEn: "High-contrast edition of Ethan Schoonover's precision Solarized Dark.",
  }],
  ["synthwave-84", {
    rank: 20,
    badge: "复古合成波",
    badgeEn: "Synthwave",
    description: "80 年代复古霓虹落日风，赛博粉与电光青。",
    descriptionEn: "80s retro outrun sunset vibes with glowing neon magenta and cyan.",
  }],
  ["catppuccin-latte", {
    rank: 21,
    badge: "人气浅色 #1",
    badgeEn: "Top Light #1",
    description: "Catppuccin 拿铁浅色主题，暖奶油白底配高饱和语义色，浅色党首选。",
    descriptionEn: "Warm creamy daylight flavor of Catppuccin with crisp semantic colors.",
  }],
  ["dayfox", {
    rank: 22,
    badge: "温润浅色",
    badgeEn: "Warm Day",
    description: "Nightfox 家族白昼主题，暖灰白底配紫调正文，长时间阅读不刺眼。",
    descriptionEn: "Warm stone-white daytime palette with deep plum-slate typography.",
  }],
  ["flexoki-light", {
    rank: 23,
    badge: "墨水纸张",
    badgeEn: "Inky Paper",
    description: "Steph Ango (Obsidian CEO) 设计的暖白纸张与印刷墨水色盘。",
    descriptionEn: "Inky color scheme for prose and code on warm paper by Steph Ango.",
  }],
  ["rose-pine-dawn", {
    rank: 24,
    badge: "晨曦浅色",
    badgeEn: "Dawn Light",
    description: "Rosé Pine 晨光暖米白配色，温柔雅致的文艺浅色方案。",
    descriptionEn: "Warm morning light variant of Rosé Pine with muted botanical tones.",
  }],
  ["tokyonight-day", {
    rank: 25,
    badge: "清爽浅色",
    badgeEn: "Crisp Light",
    description: "TokyoNight 白昼版，冷调银白底配清晰蓝紫高亮。",
    descriptionEn: "Cool daylight edition of TokyoNight with sharp cobalt and violet accents.",
  }],
  ["kanagawa-lotus", {
    rank: 26,
    badge: "和纸浅色",
    badgeEn: "Washi Light",
    description: "Kanagawa 宣纸暖黄浅色版，古籍和纸质感。",
    descriptionEn: "Warm Japanese washi paper light variant of Kanagawa.",
  }],
  ["gruvbox-light", {
    rank: 27,
    badge: "复古羊皮纸",
    badgeEn: "Parchment",
    description: "Gruvbox 暖黄羊皮纸浅色主题，怀旧温暖。",
    descriptionEn: "Warm parchment daylight edition of the classic Gruvbox palette.",
  }],
]);

// Extra curated themes guaranteed to be available even without Ghostty installed
export const EXTRA_CURATED_THEMES = [
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    source: "curated",
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    selection: "#585b70",
    cursor: "#f5e0dc",
    ansi: [
      "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
      "#7f849c", "#f37799", "#89d88b", "#ebd391", "#74a8fc", "#f2aede", "#6bd7ca", "#bac2de",
    ],
    colors: { accent: "#89b4fa" },
  },
  {
    id: "tokyonight-night",
    name: "TokyoNight Night",
    source: "curated",
    background: "#1a1b26",
    foreground: "#c0caf5",
    selection: "#283457",
    cursor: "#c0caf5",
    ansi: [
      "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
      "#6b7394", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    ],
    colors: { accent: "#7aa2f7" },
  },
  {
    id: "rose-pine",
    name: "Rose Pine",
    source: "curated",
    background: "#191724",
    foreground: "#e0def4",
    selection: "#403d52",
    cursor: "#ebbcba",
    ansi: [
      "#26233a", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
      "#8682a2", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
    ],
    colors: { accent: "#c4a7e7" },
  },
  {
    id: "kanagawa-wave",
    name: "Kanagawa Wave",
    source: "curated",
    background: "#1f1f28",
    foreground: "#dcd7ba",
    selection: "#2d4f67",
    cursor: "#dcd7ba",
    ansi: [
      "#090618", "#e46876", "#87a987", "#c0a36e", "#7e9cd8", "#a48ec7", "#6a9589", "#c8c093",
      "#727169", "#e82424", "#98bb6c", "#e6c384", "#7fb4ca", "#938aa9", "#7aa89f", "#dcd7ba",
    ],
    colors: { accent: "#7e9cd8" },
  },
  {
    id: "vesper",
    name: "Vesper",
    source: "curated",
    background: "#101010",
    foreground: "#ffffff",
    selection: "#282828",
    cursor: "#ffc799",
    ansi: [
      "#1b1b1b", "#fe4450", "#7cc888", "#ffc799", "#65b2ff", "#e072fa", "#6fe2e6", "#a0a0a0",
      "#505050", "#ff6b76", "#9ee2a8", "#ffd7b5", "#89c5ff", "#e892fb", "#8ff0f4", "#ffffff",
    ],
    colors: { accent: "#ffc799" },
  },
  {
    id: "poimandres",
    name: "Poimandres",
    source: "curated",
    background: "#1b1e28",
    foreground: "#a6accd",
    selection: "#2a3141",
    cursor: "#5de4c7",
    ansi: [
      "#171922", "#d0679d", "#5de4c7", "#fffac2", "#89ddff", "#f087bd", "#add7ff", "#e4f0fb",
      "#506477", "#d0679d", "#5de4c7", "#fffac2", "#89ddff", "#f087bd", "#add7ff", "#ffffff",
    ],
    colors: { accent: "#5de4c7" },
  },
  {
    id: "synthwave-84",
    name: "Synthwave 84",
    source: "curated",
    background: "#262335",
    foreground: "#ffffff",
    selection: "#443760",
    cursor: "#f92aad",
    ansi: [
      "#262335", "#fe4450", "#72f1b8", "#fede5d", "#03edf9", "#ff7edb", "#03edf9", "#ffffff",
      "#614d85", "#fe4450", "#72f1b8", "#fede5d", "#03edf9", "#ff7edb", "#03edf9", "#ffffff",
    ],
    colors: { accent: "#f92aad" },
  },
  {
    id: "dayfox",
    name: "Dayfox",
    source: "curated",
    background: "#f6f2ee",
    foreground: "#3d2b5a",
    selection: "#e7d2be",
    cursor: "#3d2b5a",
    ansi: [
      "#352c24", "#a5222f", "#396847", "#ac5402", "#2848a9", "#6e33ce", "#287980", "#f2e9e1",
      "#534c45", "#b3434e", "#577f63", "#b86e28", "#4863b6", "#8452d5", "#488d93", "#f4ece6",
    ],
    colors: { accent: "#2848a9" },
  },
  {
    id: "flexoki-light",
    name: "Flexoki Light",
    source: "curated",
    background: "#fffcf0",
    foreground: "#100f0f",
    selection: "#cecdc3",
    cursor: "#100f0f",
    ansi: [
      "#100f0f", "#af3029", "#66800b", "#ad8301", "#205ea6", "#5e409d", "#24837b", "#e6e4d9",
      "#6f6e69", "#d14d41", "#879a39", "#d0a215", "#4385be", "#8b7ec8", "#3aa99f", "#fffcf0",
    ],
    colors: { accent: "#205ea6" },
  },
];

// Preset Canvas Backgrounds for Herdr root layout
export const CANVAS_BACKGROUND_PRESETS = [
  {
    id: "canvas",
    name: "跟随主题画布 (Default Canvas)",
    nameEn: "Theme Canvas (Default)",
    desc: "使用主题自带的 canvas 语义底色，最干净统一",
    value: "canvas",
  },
  {
    id: "background",
    name: "与终端同色 (Terminal Background)",
    nameEn: "Match Terminal Background",
    desc: "工作区底色与终端背景完全融为一体",
    value: "background",
  },
  {
    id: "chrome",
    name: "与侧边栏同色 (Chrome Background)",
    nameEn: "Match Sidebar Chrome",
    desc: "工作区底色与侧边栏、顶栏保持同一深浅",
    value: "chrome",
  },
  {
    id: "gradient-midnight",
    name: "午夜星云极光 (Midnight Nebula)",
    nameEn: "Midnight Nebula Gradient",
    desc: "深邃蓝紫对角线微光渐变，配合 85%~92% 终端不透明度极具层次感",
    value: { gradient: ["#1e1b4b", "#090d16"], angle: 145 },
  },
  {
    id: "gradient-cyber",
    name: "赛博霓虹暗紫 (Cyber Violet)",
    nameEn: "Cyber Violet Gradient",
    desc: "暗夜紫红到深海蓝渐变，适合 TokyoNight / Catppuccin",
    value: { gradient: ["#2e1065", "#0f172a"], angle: 160 },
  },
  {
    id: "gradient-emerald",
    name: "深海翡翠暗流 (Emerald Abyss)",
    nameEn: "Emerald Abyss Gradient",
    desc: "深林墨绿到碳黑渐变，适合 Moss / Everforest / Kanagawa",
    value: { gradient: ["#064e3b", "#090d12"], angle: 155 },
  },
  {
    id: "gradient-dusk",
    name: "落日余晖暖金 (Warm Dusk)",
    nameEn: "Warm Dusk Gradient",
    desc: "复古暗琥珀到深炭灰渐变，适合 Gruvbox / Rose Pine / Vesper",
    value: { gradient: ["#3b1d1e", "#121318"], angle: 150 },
  },
];
