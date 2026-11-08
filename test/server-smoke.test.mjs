import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHerdrStyleServer, listenWithFallback } from "../src/server.mjs";

test("server exposes state, enforces CSRF token on write endpoints, and manages snapshots", async () => {
  const tempHome = await mkdtemp(path.join(tmpdir(), "herdrstyle-test-"));
  await mkdir(path.join(tempHome, "layouts"), { recursive: true });
  await mkdir(path.join(tempHome, "themes"), { recursive: true });
  await writeFile(
    path.join(tempHome, "settings.json"),
    JSON.stringify({ zoom: 1.2, font: "JetBrains Mono", appearance: "dark" }, null, 2),
  );
  await writeFile(
    path.join(tempHome, "layouts", "mine.json"),
    JSON.stringify({ id: "root", type: "row", children: [] }, null, 2),
  );

  const { server } = await createHerdrStyleServer({
    appHome: tempHome,
    herdrBin: "",
    ghosttyBin: "",
  });
  const port = await listenWithFallback(server, 0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.ok(state.token);
    assert.ok(Array.isArray(state.themes) && state.themes.length >= 4);

    // Write without token should be rejected with 403
    const forbiddenRes = await fetch(`${baseUrl}/api/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settingsPatch: { zoom: 1.4 } }),
    });
    assert.equal(forbiddenRes.status, 403);

    // Write with valid token should succeed and create snapshot
    const applyRes = await fetch(`${baseUrl}/api/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-herdrstyle-token": state.token,
      },
      body: JSON.stringify({
        settingsPatch: { zoom: 1.35 },
        createSnapshot: true,
        snapshotLabel: "Test Snapshot",
      }),
    });
    assert.equal(applyRes.status, 200);
    const applied = await applyRes.json();
    assert.equal(applied.settings.zoom, 1.35);
    assert.ok(applied.snapshot?.id);
  } finally {
    server.close();
    await rm(tempHome, { recursive: true, force: true });
  }
});
