// ============================================================================
// Herdrstyle — Time Machine Snapshot Store
// ============================================================================

import { mkdir, readdir, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileExists, readHerdrState, readJsonSafe, runCmd, writeFileAtomic } from "./herdr-bridge.mjs";
import { slugifyThemeName } from "./themes-catalog.mjs";

export function getHistoryDir(appHome) {
  return path.join(appHome, ".herdrstyle-history");
}

function formatTimestampId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function createSnapshot(appHome, herdrBin, themes, label = "") {
  const historyDir = getHistoryDir(appHome);
  await mkdir(historyDir, { recursive: true });

  const state = await readHerdrState(appHome, herdrBin, themes);
  const settingsRaw = await readJsonSafe(state.rawFiles.settingsPath, {});
  const layoutRaw = await readJsonSafe(state.rawFiles.layoutPath, {});
  let themeRaw = null;
  if (await fileExists(state.rawFiles.themePath)) {
    themeRaw = await readJsonSafe(state.rawFiles.themePath, null);
  }

  const id = `${formatTimestampId()}-${randomBytes(2).toString("hex")}`;
  const snapshot = {
    id,
    label: label.trim() || `${state.themeState.activeHerdrName} · ${state.settings.font}`,
    createdAt: new Date().toISOString(),
    mtime: Date.now(),
    summary: {
      activeThemeId: state.themeState.activeThemeId,
      darkThemeId: state.themeState.darkThemeId,
      lightThemeId: state.themeState.lightThemeId,
      appearance: state.themeState.appearance,
      font: state.settings.font,
      ui_font: state.settings.ui_font,
      font_size: state.settings.font_size,
      zoom: state.settings.zoom,
      pane_radius: state.layoutModel.pane_radius,
      pane_gap: state.layoutModel.pane_gap,
      semantic: state.effectiveSemantic,
    },
    files: {
      activeLayout: state.herdr.activeLayout,
      activeThemeHerdrName: state.themeState.activeHerdrName,
      darkHerdrName: state.themeState.darkHerdrName,
      lightHerdrName: state.themeState.lightHerdrName,
      settings: settingsRaw,
      layout: layoutRaw,
      theme: themeRaw,
    },
  };

  const filePath = path.join(historyDir, `snapshot-${id}.json`);
  await writeFileAtomic(filePath, snapshot);
  return snapshot;
}

export async function listSnapshots(appHome) {
  const historyDir = getHistoryDir(appHome);
  try {
    const files = await readdir(historyDir);
    const snapshots = [];
    for (const f of files) {
      if (!f.startsWith("snapshot-") || !f.endsWith(".json")) continue;
      const data = await readJsonSafe(path.join(historyDir, f), null);
      if (data && data.id) snapshots.push(data);
    }
    snapshots.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    return snapshots;
  } catch {
    return [];
  }
}

export async function restoreSnapshotById(appHome, herdrBin, snapshotId) {
  const safeId = String(snapshotId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(getHistoryDir(appHome), `snapshot-${safeId}.json`);
  if (!(await fileExists(filePath))) {
    throw new Error("Snapshot file not found.");
  }
  const snap = await readJsonSafe(filePath, null);
  if (!snap || !snap.files) throw new Error("Snapshot data is corrupted.");

  if (snap.files.theme && snap.files.activeThemeHerdrName) {
    const themePath = path.join(appHome, "themes", `${slugifyThemeName(snap.files.activeThemeHerdrName)}.json`);
    await writeFileAtomic(themePath, snap.files.theme);
  }
  if (snap.files.settings) {
    await writeFileAtomic(path.join(appHome, "settings.json"), snap.files.settings);
  }
  if (snap.files.layout && snap.files.activeLayout) {
    const layoutPath = path.join(appHome, "layouts", `${snap.files.activeLayout}.json`);
    await writeFileAtomic(layoutPath, snap.files.layout);
    await runCmd(herdrBin, ["do", "layout.set", "--layout", JSON.stringify(snap.files.layout)], {
      env: { HERDR_APP_HOME: appHome },
    });
  }
  if (snap.files.lightHerdrName) {
    await runCmd(herdrBin, ["do", "app.theme", "--name", snap.files.lightHerdrName], {
      env: { HERDR_APP_HOME: appHome },
    });
  }
  if (snap.files.darkHerdrName) {
    await runCmd(herdrBin, ["do", "app.theme", "--name", snap.files.darkHerdrName], {
      env: { HERDR_APP_HOME: appHome },
    });
  }
  if (snap.files.activeThemeHerdrName) {
    await runCmd(herdrBin, ["do", "app.theme", "--name", snap.files.activeThemeHerdrName], {
      env: { HERDR_APP_HOME: appHome },
    });
  }
  return snap;
}

export async function renameSnapshotById(appHome, snapshotId, label) {
  const safeId = String(snapshotId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(getHistoryDir(appHome), `snapshot-${safeId}.json`);
  if (!(await fileExists(filePath))) {
    throw new Error("Snapshot not found.");
  }
  const snap = await readJsonSafe(filePath, null);
  snap.label = String(label || "").trim() || snap.label;
  await writeFileAtomic(filePath, snap);
  return listSnapshots(appHome);
}

export async function deleteSnapshotById(appHome, snapshotId) {
  const safeId = String(snapshotId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(getHistoryDir(appHome), `snapshot-${safeId}.json`);
  await rm(filePath, { force: true });
  return listSnapshots(appHome);
}
