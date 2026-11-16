/**
 * ONE COMPARISON INSTANT for every NFL line surface: the game page's line section (withNflPropLines → NflPropLines), its
 * Recent form panel (nflEvidenceLines) and /nfl/trends (buildTrendRows) all select lines at buildAsOfIso() — so a line
 * near the 12 h freshness edge is compared on all three or on none.
 *   1. source: withNflPropLines defaults asOf to buildAsOfIso() and passes it on; the game page's panel and the Trends
 *      page select at buildAsOfIso(); the page's hook call is unchanged (main's switch-off guard pins it);
 *   2. behaviour (real encrypted artifact, key/dir pattern): a line captured 1 minute INSIDE the 12 h window of
 *      buildAsOfIso() is shown by all three, one 1 minute OUTSIDE by none — each called as its page calls it.
 * Run (from app/): npx tsx --test src/components/nfl/line-asof.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { buildAsOfIso } from "../../lib/build-asof";
import { FX_BOARD, FX_EVENT } from "../../lib/sports/nfl/__fixtures__/nfl-prop-line-synthetic.mjs";
import { NFL_LINES_DIR_ENV, NFL_LINES_SCHEMA, nflLinesAad } from "../../lib/sports/nfl/public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../lib/odds/display-crypto.mjs";
import { nflOpenLineRecords } from "../../lib/sports/nfl/line-display-open.mjs";
import { nflEvidenceLines } from "../../lib/sports/nfl/evidence-line.mjs";
import { buildTrendRows } from "../../lib/sports/nfl/trends-rows.mjs";

const { withNflPropLines } = await import("./nfl-prop-lines.tsx");
const SRC = path.join(process.cwd(), "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

test("source: one instant — buildAsOfIso() — for the section, the panel and Trends", () => {
  const hook = read("components/nfl/nfl-prop-lines.tsx");
  assert.match(hook, /export function withNflPropLines\([^\n]*asOf: string = buildAsOfIso\(\)\): React\.ReactNode \{/);
  assert.match(hook, /<NflPropLines board=\{b\} offers=\{rows\} fromArtifact display=\{display\} asOf=\{asOf\} \/>/);
  const game = read("app/nfl/game/[eventId]/page.tsx");
  assert.match(game, /nflEvidenceLines\(\{ board: playerBoard, rows: lineRows, asOf: buildAsOfIso\(\) \}\)/);
  assert.match(game, /\) : null, playerBoard\)\}/, "the hook call is unchanged: its asOf is the default, buildAsOfIso()");
  assert.doesNotMatch(game.slice(game.indexOf("const recentForm"), game.indexOf("const idx = indexArtifact()")), /new Date\(/, "the panel never reads its own clock");
  const trends = read("app/nfl/trends/page.tsx");
  assert.match(trends, /const now = buildAsOfIso\(\);/);
  assert.match(trends, /nflEvidenceLines\(\{ board: b, rows: open, asOf: now \}\)/);
});

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test("behaviour: a line 1 minute inside the 12 h window is shown by all three surfaces; 1 minute outside by none", () => {
  const AS_OF = buildAsOfIso();
  const at = Date.parse(AS_OF);
  const board = { ...FX_BOARD, kickoffUtc: new Date(at + 2 * 3600_000).toISOString() };
  const P = "nfl-athlete-1";
  const LOG = [5, 4, 6, 4, 3].map((rec, i) => ({ eventId: `g${i}`, week: 9 - i, date: "2026-10-01", team: "AAA", opponent: "ZZZ", homeAway: "H", state: "STAT_LINE", stats: { rec, recYds: rec * 10 } }));
  for (const [why, offsetMin, shown] of [["inside", 12 * 60 - 1, true], ["outside", 12 * 60 + 1, false]]) {
    const key = crypto.randomBytes(32);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-asof-"));
    const rows = [{ canonicalEventId: `nfl-${FX_EVENT}`, playerId: P, market: "player_receptions", book: "draftkings", line: 4.5, overPrice: -110, underPrice: -110, capturedAt: new Date(at - offsetMin * 60_000).toISOString() }];
    fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(JSON.stringify({ schema: NFL_LINES_SCHEMA, sport: "nfl", eventId: FX_EVENT, rows }), key, nflLinesAad(FX_EVENT)));
    try {
      withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
        const open = nflOpenLineRecords(FX_EVENT);
        assert.ok(open, "THE rule is open");
        // the section, exactly as the game page calls the hook (no asOf)
        const node = React.createElement("section", { id: "players" });
        const section = renderToStaticMarkup(withNflPropLines(node, board)).replace(/<!-- -->/g, "");
        const states = [...section.matchAll(/data-prop-line="([A-Z_]+)"/g)].map((m) => m[1]);
        assert.equal(states.length, 1, `one offer ⇒ one section row: ${states}`);
        const sectionCompares = states[0] === "DIRECTION_WITHHELD" || states[0] === "COMPARED"; // a qualified line (no NFL family is direction-qualified)
        if (!shown) assert.equal(states[0], "STALE");
        // the panel, as the game page builds its lines
        const panel = nflEvidenceLines({ board, rows: open, asOf: buildAsOfIso() })[`${P}|player_receptions`];
        // Trends, as its page builds its rows
        const now = buildAsOfIso();
        const trend = buildTrendRows({ boards: [board], evidenceByEvent: { [FX_EVENT]: { [P]: LOG } }, now, linesByEvent: { [FX_EVENT]: nflEvidenceLines({ board, rows: open, asOf: now }) } })
          .find((r) => r.playerId === P && r.family === "player_receptions");
        assert.deepEqual([sectionCompares, panel.state === "OBSERVED", trend.lineState === "COMPLETE"], [shown, shown, shown], `${why}: ${panel.state} / ${trend.lineState}`);
        if (!shown) assert.equal(panel.state, "UNUSABLE", "outside: the section calls it stale, the panel says not compared");
      });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
