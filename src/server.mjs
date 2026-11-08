// ============================================================================
// Herdrstyle — Local HTTP Studio Server & REST API Router
// ============================================================================

import { createServer as createHttpServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir, platform, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  applyStudioChanges,
  fileExists,
  findGhosttyBinary,
  findHerdrAppBinary,
  loadAllFonts,
  loadAllThemes,
  readHerdrState,
  readJsonSafe,
  runCmd,
  syncToGhostty,
  writeFileAtomic,
} from "./herdr-bridge.mjs";
import {
  createSnapshot,
  deleteSnapshotById,
  listSnapshots,
  renameSnapshotById,
  restoreSnapshotById,
} from "./history-store.mjs";
import { slugifyThemeName, toHerdrThemeJson } from "./themes-catalog.mjs";

const execFileAsync = promisify(execFile);
const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SRC_DIR, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const DEFAULT_PORT = 14183;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

export function parseArgs(argv) {
  const result = {
    appHome: process.env.HERDR_APP_HOME || path.join(homedir(), ".config", "herdr-app"),
    open: false,
    help: false,
    version: false,
    port: Number(process.env.PORT || DEFAULT_PORT),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--open") result.open = true;
    else if (arg === "--no-open") result.open = false;
    else if (arg === "-h" || arg === "--help") result.help = true;
    else if (arg === "-v" || arg === "--version") result.version = true;
    else if (arg.startsWith("--port=")) result.port = Number(arg.slice(7));
    else if (arg === "--port") result.port = Number(argv[++i]);
    else if (arg.startsWith("--app-home=")) result.appHome = arg.slice(11);
    else if (arg === "--app-home") result.appHome = argv[++i] || result.appHome;
  }

  if (!Number.isInteger(result.port) || result.port < 0 || result.port > 65535) {
    throw new Error(`Invalid port: ${result.port}`);
  }
  return result;
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Payload exceeds 2 MB limit.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function setSecurityHeaders(response) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cache-Control", "no-store");
}

async function serveStatic(requestPath, response) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const target = path.resolve(PUBLIC_DIR, relativePath);
  if (target !== PUBLIC_DIR && !target.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    jsonResponse(response, 403, { error: "Forbidden" });
    return;
  }
  try {
    const data = await readFile(target);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES.get(path.extname(target)) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch (error) {
    jsonResponse(response, error.code === "ENOENT" ? 404 : 500, {
      error: error.code === "ENOENT" ? "Page not found." : "Unable to read page.",
    });
  }
}

export async function createHerdrStyleServer(options = {}) {
  const appHome = options.appHome || path.join(homedir(), ".config", "herdr-app");
  const herdrBin = options.herdrBin ?? (await findHerdrAppBinary());
  const ghosttyBin = options.ghosttyBin ?? (await findGhosttyBinary());
  const shutdownAction = typeof options.shutdownAction === "function" ? options.shutdownAction : null;
  const sessionToken = randomBytes(24).toString("hex");

  let themesCache = null;
  let fontsCache = null;
  let baselineSnapshot = null;

  const getThemes = async (force = false) => {
    if (force || !themesCache) {
      themesCache = await loadAllThemes(appHome, ghosttyBin);
    }
    return themesCache;
  };

  const getFonts = async (force = false) => {
    if (force || !fontsCache) {
      fontsCache = await loadAllFonts(ghosttyBin);
    }
    return fontsCache;
  };

  const ensureBaseline = async () => {
    if (baselineSnapshot) return baselineSnapshot;
    const themes = await getThemes();
    const existing = await listSnapshots(appHome);
    if (existing.length === 0) {
      baselineSnapshot = await createSnapshot(
        appHome,
        herdrBin,
        themes,
        "Initial Baseline · 初始基准快照",
      );
    } else {
      const state = await readHerdrState(appHome, herdrBin, themes);
      baselineSnapshot = {
        id: "session-baseline",
        files: {
          activeLayout: state.herdr.activeLayout,
          activeThemeHerdrName: state.themeState.activeHerdrName,
          darkHerdrName: state.themeState.darkHerdrName,
          lightHerdrName: state.themeState.lightHerdrName,
          settings: await readJsonSafe(state.rawFiles.settingsPath, {}),
          layout: await readJsonSafe(state.rawFiles.layoutPath, {}),
          theme: (await fileExists(state.rawFiles.themePath))
            ? await readJsonSafe(state.rawFiles.themePath, null)
            : null,
        },
      };
    }
    return baselineSnapshot;
  };

  const server = createHttpServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url || "/", "http://127.0.0.1");

    const requireToken = () => {
      if (request.headers["x-herdrstyle-token"] !== sessionToken) {
        jsonResponse(response, 403, {
          error: "Invalid session token. Refresh the page and try again.",
        });
        return false;
      }
      return true;
    };

    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        await ensureBaseline();
        const [themes, fonts, history] = await Promise.all([
          getThemes(),
          getFonts(),
          listSnapshots(appHome),
        ]);
        const state = await readHerdrState(appHome, herdrBin, themes);
        jsonResponse(response, 200, {
          token: sessionToken,
          ...state,
          themes,
          fonts,
          historyCount: history.length,
          shutdownSupported: Boolean(shutdownAction),
        });
        return;
      }

      if (url.pathname === "/api/apply" && request.method === "POST") {
        if (!requireToken()) return;
        const body = await readJsonBody(request);
        const themes = await getThemes();
        const fonts = await getFonts();
        await applyStudioChanges(appHome, herdrBin, themes, body);

        let snapshot = null;
        if (body.createSnapshot) {
          snapshot = await createSnapshot(appHome, herdrBin, themes, body.snapshotLabel || "");
          baselineSnapshot = snapshot;
        }

        const updatedThemes = await getThemes(true);
        const newState = await readHerdrState(appHome, herdrBin, updatedThemes);
        const history = await listSnapshots(appHome);

        jsonResponse(response, 200, {
          ok: true,
          snapshot,
          historyCount: history.length,
          ...newState,
          themes: updatedThemes,
          fonts,
        });
        return;
      }

      if (url.pathname === "/api/revert-baseline" && request.method === "POST") {
        if (!requireToken()) return;
        const base = await ensureBaseline();
        if (base?.files) {
          if (base.files.theme && base.files.activeThemeHerdrName) {
            await writeFileAtomic(
              path.join(appHome, "themes", `${slugifyThemeName(base.files.activeThemeHerdrName)}.json`),
              base.files.theme,
            );
          }
          if (base.files.settings) {
            await writeFileAtomic(path.join(appHome, "settings.json"), base.files.settings);
          }
          if (base.files.layout && base.files.activeLayout) {
            await writeFileAtomic(
              path.join(appHome, "layouts", `${base.files.activeLayout}.json`),
              base.files.layout,
            );
            await runCmd(herdrBin, ["do", "layout.set", "--layout", JSON.stringify(base.files.layout)], {
              env: { HERDR_APP_HOME: appHome },
            });
          }
          if (base.files.lightHerdrName) {
            await runCmd(herdrBin, ["do", "app.theme", "--name", base.files.lightHerdrName], {
              env: { HERDR_APP_HOME: appHome },
            });
          }
          if (base.files.darkHerdrName) {
            await runCmd(herdrBin, ["do", "app.theme", "--name", base.files.darkHerdrName], {
              env: { HERDR_APP_HOME: appHome },
            });
          }
        }
        const [themes, fonts] = await Promise.all([getThemes(true), getFonts()]);
        const newState = await readHerdrState(appHome, herdrBin, themes);
        jsonResponse(response, 200, { ok: true, ...newState, themes, fonts });
        return;
      }

      if (url.pathname === "/api/shot" && request.method === "GET") {
        const shotFile = path.join(tmpdir(), `herdrstyle-shot-${process.pid}-${Date.now()}.png`);
        try {
          const res = await runCmd(herdrBin, ["shot", shotFile], {
            env: { HERDR_APP_HOME: appHome },
            timeout: 8000,
          });
          if (!res.ok || !(await fileExists(shotFile))) {
            jsonResponse(response, 409, {
              error: res.stderr || res.stdout || "Herdr App is not running or has not rendered its first frame yet.",
            });
            return;
          }
          const imgBuf = await readFile(shotFile);
          response.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
          });
          response.end(imgBuf);
        } finally {
          await rm(shotFile, { force: true });
        }
        return;
      }

      if (url.pathname === "/api/sync-ghostty" && request.method === "POST") {
        if (!requireToken()) return;
        const themes = await getThemes();
        const state = await readHerdrState(appHome, herdrBin, themes);
        const activeTheme = themes.find((t) => t.id === state.themeState.activeThemeId) || themes[0];
        const result = await syncToGhostty(state, activeTheme, ghosttyBin);
        jsonResponse(response, 200, result);
        return;
      }

      if (url.pathname === "/api/history" && request.method === "GET") {
        const items = await listSnapshots(appHome);
        jsonResponse(response, 200, { items });
        return;
      }

      if (url.pathname === "/api/history/restore" && request.method === "POST") {
        if (!requireToken()) return;
        const body = await readJsonBody(request);
        const snap = await restoreSnapshotById(appHome, herdrBin, body.id);
        const [themes, fonts] = await Promise.all([getThemes(true), getFonts()]);
        const newState = await readHerdrState(appHome, herdrBin, themes);
        jsonResponse(response, 200, { ok: true, restored: snap, ...newState, themes, fonts });
        return;
      }

      if (url.pathname === "/api/history/rename" && request.method === "POST") {
        if (!requireToken()) return;
        const body = await readJsonBody(request);
        const items = await renameSnapshotById(appHome, body.id, body.label);
        jsonResponse(response, 200, { ok: true, items });
        return;
      }

      if (url.pathname === "/api/history/delete" && request.method === "POST") {
        if (!requireToken()) return;
        const body = await readJsonBody(request);
        const items = await deleteSnapshotById(appHome, body.id);
        jsonResponse(response, 200, { ok: true, items });
        return;
      }

      if (url.pathname === "/api/raw" && request.method === "GET") {
        const target = url.searchParams.get("target") || "settings";
        const themes = await getThemes();
        const state = await readHerdrState(appHome, herdrBin, themes);
        let filePath = state.rawFiles.settingsPath;
        if (target === "layout") filePath = state.rawFiles.layoutPath;
        else if (target === "theme") filePath = state.rawFiles.themePath;

        let content = "{\n}\n";
        if (await fileExists(filePath)) {
          content = await readFile(filePath, "utf8");
        } else if (target === "theme") {
          const activeTheme = themes.find((t) => t.id === state.themeState.activeThemeId) || themes[0];
          content = `${JSON.stringify(toHerdrThemeJson(activeTheme), null, 2)}\n`;
        }
        jsonResponse(response, 200, { target, path: filePath, content });
        return;
      }

      if (url.pathname === "/api/raw" && request.method === "POST") {
        if (!requireToken()) return;
        const body = await readJsonBody(request);
        const target = body.target || "settings";
        let parsed;
        try {
          parsed = JSON.parse(body.content);
        } catch (err) {
          jsonResponse(response, 422, { error: `Invalid JSON syntax: ${err.message}` });
          return;
        }
        const [themes, fonts] = await Promise.all([getThemes(), getFonts()]);
        const state = await readHerdrState(appHome, herdrBin, themes);
        let filePath = state.rawFiles.settingsPath;
        if (target === "layout") filePath = state.rawFiles.layoutPath;
        else if (target === "theme") filePath = state.rawFiles.themePath;

        await writeFileAtomic(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
        if (target === "layout") {
          await runCmd(herdrBin, ["do", "layout.set", "--layout", JSON.stringify(parsed)], {
            env: { HERDR_APP_HOME: appHome },
          });
        } else if (target === "theme") {
          await runCmd(herdrBin, ["do", "app.theme", "--name", state.themeState.activeHerdrName], {
            env: { HERDR_APP_HOME: appHome },
          });
        }

        const updatedThemes = await getThemes(true);
        const newState = await readHerdrState(appHome, herdrBin, updatedThemes);
        jsonResponse(response, 200, { ok: true, path: filePath, ...newState, themes: updatedThemes, fonts });
        return;
      }

      if (url.pathname === "/api/shutdown" && request.method === "POST") {
        if (!requireToken()) return;
        if (!shutdownAction) {
          jsonResponse(response, 409, { error: "Server cannot be stopped remotely." });
          return;
        }
        response.once("finish", () => {
          const timer = setTimeout(() => {
            Promise.resolve(shutdownAction()).catch(() => {});
          }, 60);
          timer.unref?.();
        });
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        jsonResponse(response, 405, { error: "Method not allowed" });
        return;
      }

      await serveStatic(decodeURIComponent(url.pathname), response);
    } catch (error) {
      jsonResponse(response, 500, { error: error.message || "Internal server error" });
    }
  });

  return { server, appHome, herdrBin, ghosttyBin };
}

export function listenWithFallback(server, initialPort, host = "127.0.0.1", maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let currentPort = initialPort;
    let attempts = 0;

    function tryListen() {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        if (
          error.code === "EADDRINUSE" &&
          currentPort > 0 &&
          attempts < maxAttempts &&
          currentPort < 65535
        ) {
          attempts += 1;
          currentPort += 1;
          tryListen();
        } else {
          reject(error);
        }
      };

      const onListening = () => {
        server.removeListener("error", onError);
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : currentPort;
        resolve(port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(currentPort, host);
    }

    tryListen();
  });
}

export async function openBrowser(url) {
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    await execFileAsync(command, args, { timeout: 5_000 });
  } catch {}
}

export function closeTerminalWindow() {
  if (process.platform !== "darwin" || process.env.HERDRSTYLE_KEEP_TERMINAL === "1") return;
  try {
    const tty = execFileSync("/usr/bin/tty", [], {
      stdio: ["inherit", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!tty || !tty.startsWith("/dev/")) return;
    const scriptPath = path.join(ROOT_DIR, "scripts", "close-terminal.applescript");
    const child = spawn("/usr/bin/osascript", [scriptPath, tty], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {}
}

export async function startCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Herdrstyle — Visual Theme & Appearance Studio for Herdr App

Usage:
  herdrstyle [options]
  node server.mjs [--open] [--port=14183] [--app-home=~/.config/herdr-app]

Options:
  --open               Open the studio automatically in your default browser
  --no-open            Start the server without opening a browser
  --port=<number>      Custom port (default: 14183, auto-increments if busy)
  --app-home=<path>    Custom Herdr App config directory (default: ~/.config/herdr-app)
  -v, --version        Print version
  -h, --help           Print this help message`);
    return;
  }

  if (args.version) {
    console.log("herdrstyle 1.0.0");
    return;
  }

  let server;
  const shutdownAction = () =>
    new Promise((resolve) => {
      console.log("Herdrstyle: stopping local studio server…");
      closeTerminalWindow();
      server.close(() => {
        resolve();
        process.exit(0);
      });
      server.closeIdleConnections?.();
      const t = setTimeout(() => {
        server.closeAllConnections?.();
        process.exit(0);
      }, 600);
      t.unref?.();
    });

  const created = await createHerdrStyleServer({ appHome: args.appHome, shutdownAction });
  ({ server } = created);

  const port = await listenWithFallback(server, args.port, "127.0.0.1");
  const url = `http://127.0.0.1:${port}`;
  console.log(`Herdrstyle Studio: ${url}`);
  console.log(`Herdr App Home:    ${created.appHome}`);
  console.log(`Herdr CLI Binary:  ${created.herdrBin || "not found"}`);
  console.log("Press Ctrl+C to stop the local server.");
  if (args.open) await openBrowser(url);
}
