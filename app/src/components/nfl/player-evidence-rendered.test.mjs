/**
 * RENDERED GUARD (phase 2, reads out/) · the Recent form panel reaches the built NFL game page.
 *
 * Found 2026-11-16: the panel sat only in the legacy (non-simulated) player section, while every current game page
 * renders the simulated #players section — so CI stayed green while no built page carried #recent-form. This guard
 * reads the export: for every event the committed evidence file covers whose built page renders a player board (and
 * whose board artifact exists), the page must carry the panel.
 * Run (after a build, from app/): npx tsx --test src/components/nfl/player-evidence-rendered.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadEvidenceFile } from "../../lib/sports/nfl/player-evidence-file.mjs";

const APP = process.cwd();
const GAME_OUT = path.join(APP, "out", "nfl", "game");
const BOARDS = path.join(APP, "public", "data", "nfl", "player-board");

test("🔴 BUILT · every covered NFL game page with a player board carries the Recent form panel", { skip: !fs.existsSync(GAME_OUT) && "no export at out/nfl/game" }, () => {
  const { doc, problem, file } = loadEvidenceFile(path.join(APP, ".."));
  assert.equal(problem, null, `the evidence file must be readable for this guard: ${file} is ${problem}`);
  const checked = [], missing = [];
  for (const [eventId, ev] of Object.entries(doc.events ?? {})) {
    if (!Object.keys(ev?.players ?? {}).length) continue;
    const page = path.join(GAME_OUT, eventId, "index.html");
    if (!fs.existsSync(page) || !fs.existsSync(path.join(BOARDS, `${eventId}.json`))) continue;
    const html = fs.readFileSync(page, "utf8");
    if (!html.includes('id="player-board"')) continue;
    checked.push(eventId);
    if (!html.includes('id="recent-form"') || !html.includes("Recent form · actual last 5 and last 10 games")) missing.push(eventId);
  }
  assert.ok(checked.length > 0, "no covered event has a built page with a player board — the guard would be vacuous");
  assert.deepEqual(missing, [], `built game pages with evidence and a player board but no #recent-form: ${missing.join(", ")}`);
});
