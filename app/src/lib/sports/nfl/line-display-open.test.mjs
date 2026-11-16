/**
 * THE ONE NFL LINE-DISPLAY RULE (line-display-open.mjs) — every surface uses it, and they agree.
 *   1. source: the game page's line section (withNflPropLines), the game page's Recent form panel and /nfl/trends each
 *      take their rows from nflOpenLineRecords (the panel and Trends then select per pair with nflEvidenceLines, the
 *      section's own selection); no NFL page or component reads nflPublicLineRecords or gates on
 *      NFL_LINE_DISPLAY itself (the one pinned exception: NflPropLines's direct-caller fallback, after its own
 *      `display.public` check — main's switch-off guard pins that literal call);
 *   2. behaviour: for closed (switch off), no artifact (no key / no file) and open (switch on + readable artifact) the
 *      three surfaces agree with the rule.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/line-display-open.test.mjs
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

import { nflLineDisplayOpen, nflOpenLineRecords } from "./line-display-open.mjs";
import { NFL_LINES_DIR_ENV, NFL_LINES_SCHEMA, nflLinesAad } from "./public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../odds/display-crypto.mjs";
import { buildTrendRows } from "./trends-rows.mjs";
import { nflEvidenceLines } from "./evidence-line.mjs";
import { FX_BOARD, FX_EVENT } from "./__fixtures__/nfl-prop-line-synthetic.mjs";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const { withNflPropLines } = await import("../../../components/nfl/nfl-prop-lines.tsx");
const { default: Panel } = await import("../../../components/nfl/player-evidence-panel.tsx");

test("source: the three surfaces call THE rule; no NFL page or component computes it another way", () => {
  const hookFile = read("components/nfl/nfl-prop-lines.tsx");
  const hook = hookFile.slice(hookFile.indexOf("export function withNflPropLines"));
  assert.ok(hook.length > 50, "withNflPropLines found");
  assert.match(hook, /const rows = nflOpenLineRecords\(b\.providerEventId, display\);/, "withNflPropLines reads its rows through the rule");
  assert.doesNotMatch(hook, /nflPublicLineRecords/);
  assert.match(hookFile, /import \{ nflOpenLineRecords \} from "@\/lib\/sports\/nfl\/line-display-open\.mjs";/);
  // the one pinned exception (main's switch-off guard requires this literal, after the component's own gate)
  assert.equal(hookFile.split("nflPublicLineRecords(").length - 1, 1, "exactly one direct reader call in nfl-prop-lines.tsx");
  assert.ok(hookFile.indexOf("if (!display.public) return null;") < hookFile.indexOf("nflPublicLineRecords(b.providerEventId)"));
  assert.ok(hookFile.indexOf("nflPublicLineRecords(b.providerEventId)") < hookFile.indexOf("export function withNflPropLines"), "…and it is in NflPropLines, not the page hook");

  const game = read("app/nfl/game/[eventId]/page.tsx");
  assert.match(game, /import \{ nflOpenLineRecords \} from "@\/lib\/sports\/nfl\/line-display-open\.mjs";/);
  assert.match(game, /const lineRows = nflOpenLineRecords\(params\.eventId\);\n    const lines = lineRows \? nflEvidenceLines\(\{ board: playerBoard, rows: lineRows, asOf: buildAsOfIso\(\) \}\) : null;/);
  assert.match(game, /<NflPlayerEvidencePanel [^>]*lines=\{lines\} \/>/, "the panel gets the rule's rows, as the section selects them");

  const trends = read("app/nfl/trends/page.tsx");
  assert.match(trends, /import \{ nflOpenLineRecords \} from "@\/lib\/sports\/nfl\/line-display-open\.mjs";/);
  assert.match(trends, /const open = nflOpenLineRecords\(String\(b\.providerEventId\)\);/);
  assert.match(trends, /buildTrendRows\(\{ boards, evidenceByEvent, now, linesByEvent \}\)/);

  for (const [rel, src] of [["app/nfl/game/[eventId]/page.tsx", game], ["app/nfl/trends/page.tsx", trends], ["components/nfl/player-evidence-panel.tsx", read("components/nfl/player-evidence-panel.tsx")], ["lib/sports/nfl/trends-rows.mjs", read("lib/sports/nfl/trends-rows.mjs")]]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /nflPublicLineRecords|public-line-records|NFL_LINE_DISPLAY|line-display\.mjs/, `${rel} computes no gate of its own`);
  }
  // no other NFL page / component under app/ or components/ reads the artifact or gates on the switch directly
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|mjs|js)$/.test(p) && !/\.test\./.test(p)) out.push(p); } return out; };
  const offenders = [...walk(path.join(SRC, "app")), ...walk(path.join(SRC, "components"))]
    .filter((f) => /nflPublicLineRecords\(|NFL_LINE_DISPLAY\.public/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
    .filter((f) => f !== "components/nfl/nfl-prop-lines.tsx");
  assert.deepEqual(offenders, []);
});

// ── behaviour ────────────────────────────────────────────────────────────────────────────────────────────────────────
function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/** a minimal valid artifact (no rows): readable ⇒ OPEN (the line section's NO_LINES state) */
function artifactDir(key) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-line-open-"));
  const text = JSON.stringify({ schema: NFL_LINES_SCHEMA, sport: "nfl", eventId: FX_EVENT, rows: [] });
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(text, key, nflLinesAad(FX_EVENT)));
  return dir;
}

const P = "nfl-athlete-1";
const entry = (week, rec) => ({ eventId: `g${week}`, week, date: `2026-10-${String(week + 10).padStart(2, "0")}`, team: "BBB", opponent: "AAA", homeAway: "H", state: "STAT_LINE", stats: { rec, recYds: rec * 10 } });
const LOG = [8, 7, 6, 5, 4].map((w) => entry(w, w - 2));
const trendBoard = (eventId) => ({ providerEventId: eventId, matchup: "AAA @ BBB", kickoffUtc: "2099-01-01T18:00Z", families: { player_receptions: { state: "PUBLISHED" } },
  players: [{ playerId: P, name: "Fixture One", team: "BBB", markets: { player_receptions: { median: 4, market: null } } }] });

/** each surface, asked the way its page asks */
function surfaces(eventId, display) {
  const node = React.createElement("section", { id: "players" });
  const hook = withNflPropLines(node, { ...FX_BOARD, providerEventId: eventId }, display) !== node;
  /* as each page asks: THE rule's rows, then the section's selection */
  const open = nflOpenLineRecords(eventId, display);
  const tb = trendBoard(eventId);
  const rows = buildTrendRows({ boards: [tb], evidenceByEvent: { [eventId]: { [P]: LOG } }, now: "2026-11-16T00:00Z", linesByEvent: { [eventId]: open ? nflEvidenceLines({ board: tb, rows: open, asOf: "2026-11-16T00:00Z" }) : null } });
  assert.ok(rows.length > 0, "trends rows built");
  const trends = rows.some((r) => r.lineState != null);
  const html = renderToStaticMarkup(React.createElement(Panel, {
    players: [{ playerId: P, name: "Fixture One", team: "BBB" }], evidence: { [P]: LOG }, kickoffUtc: "2099-01-01T18:00Z", sourceNote: "src",
    projections: { [P]: { player_receptions: { value: 4, p10: 2, p90: 7, kind: "count", text: "4", range: "2–7", estimate: null, market: null } } },
    lines: open ? nflEvidenceLines({ board: tb, rows: open, asOf: "2026-11-16T00:00Z" }) : null,
  }));
  assert.match(html, /data-evidence-player=/, "panel rendered");
  const panel = /data-line-state=/.test(html);
  return { rule: nflLineDisplayOpen(eventId, display), hook, trends, panel };
}

test("behaviour: closed, no artifact and open — the hook, the panel and Trends agree with the rule", () => {
  const key = crypto.randomBytes(32);
  const dir = artifactDir(key);
  const ON = { public: true }, OFF = { public: false };
  const all = (v) => ({ rule: v, hook: v, trends: v, panel: v });
  try {
    const cases = [
      ["switch off, key + artifact", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, FX_EVENT, OFF, false],
      ["switch on, no key", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: null }, FX_EVENT, ON, false],
      ["switch on, another key", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }, FX_EVENT, ON, false],
      ["switch on, key, no file for this game", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, "999000003", ON, false],
      ["switch on, key + readable artifact", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, FX_EVENT, ON, true],
      ["committed switch (default display), key + readable artifact", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, FX_EVENT, undefined, true],
    ];
    for (const [why, env, id, display, open] of cases) {
      withEnv(env, () => assert.deepEqual(surfaces(id, display), all(open), why));
    }
    // memoised per (event, cwd, key, dir): a second ask reads nothing new and returns the very same rows
    withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
      const a = nflOpenLineRecords(FX_EVENT);
      fs.rmSync(path.join(dir, `${FX_EVENT}.json.enc`));
      assert.equal(nflOpenLineRecords(FX_EVENT), a, "same process, same inputs ⇒ the memoised rows");
      assert.equal(nflOpenLineRecords(FX_EVENT, { public: false }), null, "the switch is checked before the memo");
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("committed state, no key (every CI build): the rule is closed for a committed game", () => {
  withEnv({ [ODDS_DISPLAY_KEY_ENV]: null, [NFL_LINES_DIR_ENV]: null }, () => {
    assert.equal(nflLineDisplayOpen(FX_EVENT), false);
    assert.equal(nflOpenLineRecords(FX_EVENT), null);
  });
});
