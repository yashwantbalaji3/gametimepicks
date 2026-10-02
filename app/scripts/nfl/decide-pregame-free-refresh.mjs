#!/usr/bin/env node
/**
 * Session 5 · A4 — decide (and say how long to wait for) the zero-credit pregame refresh.
 * Reads the committed player boards. Usage: --now <ISO> [--json]
 * --json prints the decision as ONE line of JSON on stdout (the workflow loop reads it with jq).
 * The rule lives in src/lib/ops/pregame-free-refresh.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decidePregameFreeRefresh } from "../../src/lib/ops/pregame-free-refresh.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const i = process.argv.indexOf("--now");
const nowIso = i >= 0 ? process.argv[i + 1] : null;
if (!nowIso || !Number.isFinite(Date.parse(nowIso))) { console.error("REFUSED: --now <ISO> is required"); process.exit(2); }
const dir = path.join(APP, "public/data/nfl/player-board");
if (!fs.existsSync(dir)) { console.error("REFUSED: no player-board directory — kickoffs are never guessed"); process.exit(2); }
const boards = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
}).filter((b) => b?.artifact === "nfl-player-board");

const d = decidePregameFreeRefresh({ boards, nowIso });
if (process.argv.includes("--json")) fs.writeSync(1, `${JSON.stringify(d)}\n`);
else console.log(`pregame-free-refresh: ${d.decision}${d.pass ? ` (${d.pass})` : ""} · ${d.reason}${d.waitSeconds ? ` · wait ${d.waitSeconds}s` : ""}`);
