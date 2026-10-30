/**
 * NBA SINGLE-SNAPSHOT PARITY (founder requirement 2026-10-29: one canonical value everywhere) — for EVERY committed
 * public lane date, each player median a reader can see is the official snapshot's number:
 *
 *   official snapshot (Elo side + v0.1 players, official-snapshot.mjs nbaOfficialSnapshot), 1 dp
 *     == the public lane file (public/data/nba/experimental-public/<date>.json — what /nba, the homepage lane and the
 *        Command Center / social queue read)
 *     == /nba/projections rows (projection-board-ops boardRows, the board's only source)
 *     == the game page's Official Predictions table (officialPanel → official-predictions.tsx, rendered digits)
 *
 * The consistency audit pins this for 2026-10-20 only (DEFAULT_NBA_DATES); this walks every committed date.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/nba-single-snapshot-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { nbaOfficialSnapshot, SnapshotRefusal } from "../../consistency/official-snapshot.mjs";
import { officialPanel, PANEL_FAMILIES } from "../../simulation-theater/nba/possession/payload.mjs";
import { boardRows } from "./projection-board-ops.mjs";
import { STATS, PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";

globalThis.React = React;
const { default: Official } = await import("../../../components/nba/official-predictions.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const LANE_DIR = path.join(APP, "public/data/nba/experimental-public");
const OFFICIAL_DIR = path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts");
const r1 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const dates = fs.readdirSync(LANE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();

test("the committed latest lane is one of the dated lane files, byte for byte", () => {
  const latest = fs.readFileSync(path.join(LANE_DIR, "latest.json"), "utf8");
  assert.ok(dates.some((d) => fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8") === latest), "latest.json is a committed date's lane, not a second number source");
});

test("every committed lane date: official snapshot == lane == /nba/projections == game-page Official Predictions", () => {
  let checked = 0; let games = 0; let rendered = 0;
  for (const date of dates) {
    const lane = JSON.parse(fs.readFileSync(path.join(LANE_DIR, `${date}.json`), "utf8"));
    const offPath = path.join(OFFICIAL_DIR, `${date}.json`);
    if (!fs.existsSync(offPath)) continue;
    const official = { doc: JSON.parse(fs.readFileSync(offPath, "utf8")), path: offPath, sha256: null };
    const board = new Map(boardRows(lane, PROJECTION_BOARD_STATS).map((r) => [r.id, r]));
    for (const g of lane.games ?? []) {
      let snap;
      try { snap = nbaOfficialSnapshot(String(g.providerEventId), { official, supporting: null }); } catch (e) {
        if (e instanceof SnapshotRefusal) continue; // no official snapshot → the lane cannot print one either (lane test)
        throw e;
      }
      games += 1;
      const panel = officialPanel(snap);
      const panelBy = new Map(panel.players.map((p) => [p.playerId, p]));
      const html = renderToStaticMarkup(React.createElement(Official, { official: panel, teams: { away: g.away, home: g.home }, lane: g, finalNote: null, resultsHref: "/nba/#nba-results" }));
      for (const side of ["away", "home"]) for (const row of g.players?.[side] ?? []) {
        const pid = String(row.providerAthleteId);
        const p = snap.players.find((x) => String(x.playerId) === pid);
        assert.ok(p, `${date} ${row.name}: the lane prints only official players`);
        const pp = panelBy.get(pid);
        assert.ok(pp, `${date} ${row.name}: on the game page's Official Predictions`);
        const br = board.get(`${g.providerEventId}:${pid}`);
        assert.ok(br, `${date} ${row.name}: on /nba/projections`);
        for (const [k] of STATS) {
          const want = r1(p.families?.[k]?.median);
          assert.equal(row.medians?.[k] ?? null, want, `${date} ${row.name} ${k}: lane == official snapshot`);
          assert.equal(br.v[PROJECTION_BOARD_STATS.findIndex(([x]) => x === k)], row.medians?.[k] ?? null, `${date} ${row.name} ${k}: projections == lane`);
          if (PANEL_FAMILIES.includes(k)) assert.equal(r1(pp.medians[k]), want, `${date} ${row.name} ${k}: game page == official snapshot`);
          checked += 1;
        }
        /* The rendered game-page row prints the same one-decimal digits the lane prints. */
        const tr = html.match(new RegExp(`<tr><th scope="row">[^<]*${(row.name ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "&#x27;")}[^<]*</th>((?:<td>[^<]*</td>)+)</tr>`));
        if (tr) {
          rendered += 1;
          const cells = [...tr[1].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1]);
          for (const [k] of STATS) {
            const v = row.medians?.[k];
            assert.ok(cells.includes(v == null ? "—" : String(v)), `${date} ${row.name} ${k}: rendered ${v} on the game page (the lane's digits)`);
          }
        }
      }
    }
  }
  assert.ok(games >= 10 && checked >= 400, `checked ${checked} medians over ${games} games`);
  assert.ok(rendered >= checked / STATS.length / 2, `rendered game-page rows matched for ${rendered} players`);
});

test("SOURCE · the projections board and the homepage / Command Center lane import no second engine", () => {
  const importsOf = (rel) => [...fs.readFileSync(path.join(APP, rel), "utf8").matchAll(/^import [^;]* from "([^"]+)";?$/gm)].map((m) => m[1]);
  for (const rel of ["src/lib/sports/nba/projection-board-ops.mjs", "src/lib/command-center/nba-lane.ts"]) {
    for (const spec of importsOf(rel)) assert.doesNotMatch(spec, /theater|possession|experimental-v1|world-model|game-sim|^node:fs$/i, `${rel} imports ${spec}`);
  }
});
