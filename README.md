# Herdrstyle

**Shape Herdr App your way — with 800+ themes, live GPU preview, and deep layout controls.**

<p align="left">
  <a href="README.md"><img src="https://img.shields.io/badge/Language-English-007acc?style=for-the-badge" alt="English"></a>
  <a href="README_zh.md"><img src="https://img.shields.io/badge/语言-简体中文-de342f?style=for-the-badge" alt="简体中文"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-success?style=for-the-badge" alt="License"></a>
</p>

**Herdrstyle** is a bilingual (English / Chinese), zero-dependency local visual configuration studio for **[Herdr App](https://herdr.dev)**, inspired by the design philosophy of [Ghosttyle](https://github.com/JoeyOnMars/ghosttyle).

It runs 100% locally on your machine (`127.0.0.1`), bridges **800+ Ghostty & community themes** directly into Herdr's native theme system (`~/.config/herdr-app/themes/*.json`), provides fine-grained semantic UI color and split-card layout controls, captures live GPU window screenshots via `herdr-app shot`, and hot-reloads the running Herdr desktop app in milliseconds.

---

## ✨ Key Features

- **800+ Panorama Theme Gallery**:
  - Automatically discovers Herdr's built-in presets (`Graphite`, `Ink`, `Moss`, `Paper`), **30+ Featured Community Classics** (`Catppuccin Mocha`, `TokyoNight Night`, `Rosé Pine`, `Kanagawa Wave`, `Gruvbox`, `Dracula`, `Nord`, `Vesper`, `Poimandres`, `Dayfox`, `Flexoki Light`, etc.), and your locally installed Ghostty theme library.
  - Clicking any theme card automatically converts its 16-color ANSI palette into `~/.config/herdr-app/themes/<slug>.json` (with automatic contrast compensation for dark-theme comments) and triggers `herdr-app do app.theme` for instant hot-reload.
- **Dual-Stage Live Preview**:
  - **🖥 Interactive Herdr Mockup**: Simulates Herdr's sidebar (`chrome`), workspace (`canvas`), tab bar, split terminal cards (`radius`, `gap`, `focus` border, `terminal_padding`, `terminal_opacity`), and 16-color ANSI strip in real time.
  - **📸 Live GPU Window Shot**: Captures and displays the actual running Herdr App window frame via `herdr-app shot` without requiring macOS screen-recording permissions.
- **Herdr Exclusive Look & Layout Studio**:
  - **Semantic UI Palette Overrides (`settings.json -> colors`)**: Customize `accent`, `chrome`, `canvas`, `background`, `raised`, `border`, `foreground`, `muted`, `dim`, `working`, `blocked`, and `done` colors independently with live color pickers, or reset to theme-derived defaults with one click.
  - **Pane Frame & Workspace Geometry (`layouts/<active>.json`)**: Adjust card corner `radius`, split `gap`, workspace outer `padding`, active focus border color/width, lone pane framing, pane header visibility (`always` / `hover` / `hidden`), sidebar width, terminal padding, and aurora gradient canvas backgrounds.
- **Typography, Zoom & Ghostty Cross-Sync**:
  - Separate controls for **Terminal Font (`font`)** and **Interface UI Font (`ui_font`)**, font size, programming ligatures (`font_ligatures`), global DPI `zoom` (`80%`–`200%`), and `minimum_contrast` protection.
  - **🔗 One-Click Ghostty Sync**: Push your active Herdr theme and font directly to `~/.config/ghostty/config` and reload Ghostty on macOS.
- **Time Machine Snapshots & Raw JSON Workbench**:
  - Full atomic snapshots of `settings.json`, active layout, and custom theme stored in `~/.config/herdr-app/.herdrstyle-history/` with custom labels and one-click rollback.
  - Built-in Raw JSON editor with syntax validation and formatting for `settings.json`, `layouts/<active>.json`, and `themes/<active>.json`.
- **100% Local & Zero Dependencies**:
  - Built solely on Node.js standard library modules (`node:http`, `node:fs`, `node:child_process`). Listens strictly on `127.0.0.1` with per-session CSRF token protection (`x-herdrstyle-token`).

---

## 📂 Project Structure

```text
herdrstyle/
├── bin/
│   └── herdrstyle.mjs          # CLI entrypoint (--open, --port, --app-home, --help)
├── src/
│   ├── server.mjs              # Local HTTP server & REST API router
│   ├── herdr-bridge.mjs        # Herdr App state reader, CLI runner, layout patcher & Ghostty sync
│   ├── themes-catalog.mjs      # Herdr presets, Featured Classics metadata & color derivation engine
│   └── history-store.mjs       # Atomic snapshot creation, listing, renaming & rollback
├── public/
│   ├── index.html              # Studio Web UI
│   ├── styles.css              # Modern macOS Studio dark/light stylesheet
│   ├── app.js                  # Interactive frontend controller
│   ├── i18n.js                 # Bilingual (ZH / EN) dictionary
│   └── favicon.svg             # Vector studio icon
├── scripts/
│   └── close-terminal.applescript
├── test/
│   ├── themes-catalog.test.mjs # Unit tests for color math & theme conversion
│   ├── herdr-bridge.test.mjs   # Unit tests for layout tree extraction & patching
│   └── server-smoke.test.mjs   # End-to-end HTTP API & CSRF security smoke tests
├── Herdrstyle.command          # Double-clickable macOS launcher
├── server.mjs                  # Root module re-export & compatibility entrypoint
└── package.json
```

---

## 🚀 Quick Start

### 1. Launch from Source or CLI

Clone this repository and start the studio:

```bash
git clone https://github.com/flynn-os/herdrstyle.git
cd herdrstyle
npm start
```

Or link the CLI globally to `~/.local/bin`:

```bash
ln -sf "$(pwd)/bin/herdrstyle.mjs" ~/.local/bin/herdrstyle
ln -sf "$(pwd)/bin/herdrstyle.mjs" ~/.local/bin/hstyle
herdrstyle
```

On macOS Finder, you can also double-click **`Herdrstyle.command`** directly.

### 2. Customize in Your Browser

Herdrstyle opens automatically at **`http://127.0.0.1:14183`**:
- Keep **⚡️ Live Sync to Herdr** enabled to see every theme click, color tweak, and radius/gap slider update your Herdr App window immediately.
- Click **💾 Save Snapshot & Apply** to persist a named restoration point in Time Machine history.

### 3. CLI Options

```bash
herdrstyle --help
herdrstyle --port=15183
herdrstyle --app-home=/custom/path/to/herdr-app
```

---

## 🧪 Development & Testing

Run syntax verification and the full unit + API integration test suite:

```bash
npm run check
```

---

## 📄 License

Released under the [MIT License](LICENSE).
