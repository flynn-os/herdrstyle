#!/usr/bin/env node
import { startCli } from "../src/server.mjs";

startCli(process.argv.slice(2)).catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
