import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCli } from "./src/server.mjs";

export * from "./src/server.mjs";
export * from "./src/herdr-bridge.mjs";
export * from "./src/themes-catalog.mjs";
export * from "./src/history-store.mjs";

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
