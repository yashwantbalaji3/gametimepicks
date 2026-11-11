#!/usr/bin/env node
/**
 * NFL QB PROPS · HISTORY FILE (per-slate job). Writes data/internal/research/nfl/qb-props/history.json: each receipt of
 * record's projected QBs and their actual previous games before that kickoff (qb-props-history-file.mjs). Deterministic,
 * no clock. History is not grading: it never joins a forecast to its own game's result.
 *   node app/scripts/nfl/build-qb-props-history.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readShadowReceipts } from "../../src/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { readPlayerEventGames } from "../../src/lib/sports/nfl/qb-props-inputs.mjs";
import { HISTORY_REL, buildQbHistoryFile } from "../../src/lib/sports/nfl/qb-props-history-file.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const doc = buildQbHistoryFile(readShadowReceipts(ROOT), readPlayerEventGames(ROOT).games);
const text = `${JSON.stringify(doc)}\n`;
console.log(`qb-props history: ${Object.keys(doc.events).length} events · ${(text.length / 1024).toFixed(1)} KB`);
if (process.argv.includes("--write")) { fs.writeFileSync(path.join(ROOT, HISTORY_REL), text); console.log(`wrote ${HISTORY_REL}`); }
