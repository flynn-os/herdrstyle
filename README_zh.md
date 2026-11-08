# Herdrstyle

**让 Herdr App 的主题与外观定制得心应手 —— 800+ 全景主题库、毫秒级热重载与深度布局微调工作台。**

<p align="left">
  <a href="README.md"><img src="https://img.shields.io/badge/Language-English-007acc?style=for-the-badge" alt="English"></a>
  <a href="README_zh.md"><img src="https://img.shields.io/badge/语言-简体中文-de342f?style=for-the-badge" alt="简体中文"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-success?style=for-the-badge" alt="License"></a>
</p>

**Herdrstyle** 是一个支持中英双语、零第三方依赖的 **[Herdr App](https://herdr.dev)** 本地可视化主题与外观配置工作台，设计理念致敬并借鉴了 [Ghosttyle](https://github.com/JoeyOnMars/ghosttyle)。

它完全运行在你的本机（`127.0.0.1`），自动将本机 **800+ 套 Ghostty 与社区经典主题**无损桥接至 Herdr 的原生主题系统（`~/.config/herdr-app/themes/*.json`），提供针对 Herdr 专属的侧边栏/画布/强调色微调、分屏卡片圆角与间距控制、真实窗口 GPU 抓拍预览（`herdr-app shot`），并通过 Herdr 原生 CLI 实现毫秒级实时热重载。

---

## ✨ 核心特性

- **800+ 全景主题画廊与精选经典**：
  - 自动汇聚 **Herdr 官方内置预设**（`Graphite`、`Ink`、`Moss`、`Paper`）、**30+ 套社区人气 Top 经典**（`Catppuccin Mocha`、`TokyoNight Night`、`Rosé Pine`、`Kanagawa Wave`、`Gruvbox`、`Dracula`、`Nord`、`Vesper`、`Poimandres`、`Dayfox`、`Flexoki Light` 等）以及本机全量 Ghostty 主题库。
  - 点击任意卡片即可自动转换生成 `~/.config/herdr-app/themes/<slug>.json`（内置深色主题暗部注释色 `ansi[8]` 智能对比度补偿），并调用 `herdr-app do app.theme` 即刻刷新桌面端窗口。
- **双模式吸顶实时预览舞台**：
  - **🖥 仿真交互预览**：在浏览器中实时还原 Herdr 的侧边栏 (`chrome`)、工作区画布 (`canvas`)、标签栏、分屏终端卡片（圆角、间距、焦点边框、字体、内边距）与 16 色 ANSI 调色板。
  - **📸 真实窗口抓拍**：一键调用 `herdr-app shot` 抓取正在运行的 Herdr 真实 GPU 渲染画面（无需额外开启 macOS 录屏权限）。
- **Herdr 专属外观与布局微调工坊**：
  - **界面语义色板微调 (`settings.json -> colors`)**：提供 12 项核心 UI 语义色独立拾色器（`accent` 主强调色、`chrome` 侧边栏、`canvas` 底层画布、`background` 终端背景、`raised` 激活标签、`border` 边框、主/次/暗文本及 Agent 状态色），支持一键清除恢复主题原生派生色。
  - **分屏卡片与工作区几何参数 (`layouts/<active>.json`)**：可视化滑动调节卡片圆角 (`pane.radius`)、分屏间距 (`pane.gap`)、工作区外边距 (`work-body.padding`)、焦点边框颜色与粗细、单窗格卡片框架 (`pane.lone`)、窗格顶栏显示模式 (`always` / `hover` / `none`)、侧边栏宽度及 7 款极光渐变画布背景。
- **字体、全局缩放与 Ghostty 跨端同步**：
  - 独立设置 **终端等宽主字体 (`font`)** 与 **界面 UI 字体 (`ui_font`)**、基准字号、编程连字 (`font_ligatures`)、全局 DPI 缩放 (`zoom`: `80%` ~ `200%`) 与最低对比度保护 (`minimum_contrast`)。
  - **🔗 一键同步至 Ghostty**：点击按钮即可将当前 Herdr 的主题与字体同步写入 `~/.config/ghostty/config` 并自动触发 Ghostty 热重载。
- **Time Machine 历史快照与原始 JSON 直编**：
  - 每次保存均可生成包含 `settings.json` + 当前布局 + 当前主题的完整原子快照（存放于 `~/.config/herdr-app/.herdrstyle-history/`），支持自定义备注与一键无损回滚。
  - 内置 `settings.json`、`layout.json` 与 `theme.json` 在线编辑器，支持 JSON 语法校验与一键美化。
- **纯本地零依赖安全架构**：
  - 仅使用 Node.js 原生内置模块，零第三方 npm 依赖；仅监听 `127.0.0.1` 回环地址，写操作具备基于 Session Token 的防 CSRF 保护。

---

## 📂 目录架构

```text
herdrstyle/
├── bin/
│   └── herdrstyle.mjs          # CLI 命令行入口 (--open, --port, --app-home, --help)
├── src/
│   ├── server.mjs              # 本地 HTTP 服务与 REST API 路由
│   ├── herdr-bridge.mjs        # Herdr 状态读取、CLI 热重载桥接、布局树补丁与 Ghostty 同步
│   ├── themes-catalog.mjs      # Herdr 内置预设、精选经典元数据与语义色推导引擎
│   └── history-store.mjs       # Time Machine 历史快照创建、重命名、删除与一键回滚
├── public/
│   ├── index.html              # 双语可视化工作台前端页面
│   ├── styles.css              # 现代 macOS Studio 深浅双模式样式表
│   ├── app.js                  # 交互式前端控制器
│   ├── i18n.js                 # 中英双语词典
│   └── favicon.svg             # 矢量图标
├── scripts/
│   └── close-terminal.applescript
├── test/
│   ├── themes-catalog.test.mjs # 色彩数学、对比度补偿与主题转换单元测试
│   ├── herdr-bridge.test.mjs   # 布局树解析与补丁更新单元测试
│   └── server-smoke.test.mjs   # 端到端 HTTP API 与 CSRF 安全校验集成测试
├── Herdrstyle.command          # macOS Finder 双击启动脚本
├── server.mjs                  # 根目录兼容入口与模块导出
└── package.json
```

---

## 🚀 快速上手

### 1. 启动方式

克隆仓库并启动工作台：

```bash
git clone https://github.com/flynn-os/herdrstyle.git
cd herdrstyle
npm start
```

或将命令行工具软链至 `~/.local/bin`，随时在任意终端启动：

```bash
ln -sf "$(pwd)/bin/herdrstyle.mjs" ~/.local/bin/herdrstyle
ln -sf "$(pwd)/bin/herdrstyle.mjs" ~/.local/bin/hstyle
herdrstyle
```

在 macOS Finder 中，你也可以直接双击 **`Herdrstyle.command`** 启动。

### 2. 浏览器可视化调优

启动后会自动在浏览器打开 **`http://127.0.0.1:14183`**：
- 默认开启 **⚡️ 真实 Herdr 实时联动**，点击左侧任意主题卡片或拖动滑块（缩放、圆角、间距、不透明度）即可实时在 Herdr App 窗口看到效果。
- 调出满意的外观后，点击 **💾 保存快照并应用** 即可在历史记录中留下还原点。

### 3. 命令行参数

```bash
herdrstyle --help
herdrstyle --port=15183
herdrstyle --app-home=/custom/path/to/herdr-app
```

---

## 🧪 本地开发与测试

运行完整语法校验、单元测试与本地 API 冒烟测试：

```bash
npm run check
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源协议发布。
