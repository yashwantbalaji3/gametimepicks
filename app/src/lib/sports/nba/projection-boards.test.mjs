/**
 * §13 AMENDMENT A — projection-only player boards (founder decision 2026-10-20, conditional approval). Every condition
 * the founder set is a pinned assertion here:
 *   - combos derive from the SAME frozen simulation draws and pass source-reconciliation on the real receipts;
 *   - every published number is the receipt's stored value (and the 10-20 regeneration only ADDED fields);
 *   - /nba/projections reads only the lane snapshot, hides a past slate, and carries the UNVALIDATED notice, freeze
 *     times and receipt hashes; no line / odds / edge / EV / chance / pick / ordering vocabulary; no rank numbers.
 * Run: npx tsx --test src/lib/sports/nba/projection-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildExperimentalSnapshot, snapshotMatchesSource, comboReconciliation, laneIsCurrent,
  STATS, PROJECTION_BOARD_STATS, COMBO_STATS, COMBO_COMPONENTS, COMBO_LABEL, AMENDMENT_A, LANE, WITHHELD,
} from "./experimental-public-lane.mjs";
import { COMBO_KEYS } from "./game-sim.mjs";
import { gamePayloadHash } from "./forecast-receipt.mjs";
import { boardRows, filterRows, sortRows, statGroups, boardOptions } from "./projection-board-ops.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DOC = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json"), "utf8"));
const PUB_REL = "public/data/nba/experimental-public/2026-10-20.json";
const PUB_TEXT = fs.readFileSync(path.join(APP, PUB_REL), "utf8");
const PUB = JSON.parse(PUB_TEXT);
const r1 = (x) => Math.round(x * 10) / 10;
const snap = (doc = DOC) => buildExperimentalSnapshot({ forecastDoc: structuredClone(doc), sourceFile: "x", sourceCommit: null, generatedAt: "2026-10-20T17:20:00Z" });
const srcPlayers = (g) => new Map([...g.forecast.players.away, ...g.forecast.players.home].map((p) => [String(p.providerAthleteId), p]));
const byEvent = new Map(DOC.games.map((g) => [String(g.providerEventId), g]));

test("the stat lists: STATS (the /nba card) unchanged; PROJECTION_BOARD_STATS adds exactly PRA / P+R / P+A", () => {
  assert.deepEqual(STATS.map(([k]) => k), ["pts", "reb", "ast", "threePm"]);
  assert.deepEqual(PROJECTION_BOARD_STATS.map(([k, l]) => `${k}:${l}`), ["pts:PTS", "reb:REB", "ast:AST", "threePm:3PM", "pra:PRA", "ptsReb:P+R", "ptsAst:P+A"]);
  assert.deepEqual(COMBO_STATS.map(([k]) => k), ["pra", "ptsReb", "ptsAst"]);
  // The combo definitions are the v0 engine's own (game-sim.mjs comboDraws sums these components per draw).
  assert.deepEqual(Object.fromEntries(Object.entries(COMBO_COMPONENTS).map(([k, v]) => [k, [...v]])), Object.fromEntries(Object.entries(COMBO_KEYS).map(([k, v]) => [k, [...v]])));
  for (const unsupported of ["rebAst", "ra", "stl", "blk", "tov", "turnovers", "steals", "blocks"]) assert.ok(!PROJECTION_BOARD_STATS.some(([k]) => k === unsupported), unsupported);
  assert.equal(COMBO_LABEL, "sum over the same simulated draws (v0 engine; components independent within a player)");
  assert.equal(AMENDMENT_A.enabled, true);
  assert.ok(LANE.surfaces.includes("/nba/projections"));
});

test("source reconciliation on the REAL 2026-10-20 receipts: each combo median is the receipt's own p50, not a sum of medians", () => {
  let rows = 0, differ = 0;
  for (const g of PUB.games) {
    const src = srcPlayers(byEvent.get(g.providerEventId));
    for (const side of ["away", "home"]) for (const row of g.players[side]) {
      rows += 1;
      const p = src.get(row.providerAthleteId);
      assert.deepEqual(Object.keys(row.comboMedians), ["pra", "ptsReb", "ptsAst"]);
      for (const [k, parts] of Object.entries(COMBO_COMPONENTS)) {
        assert.equal(row.comboMedians[k], r1(p[k].p50), `${row.name} ${k}: published = the receipt's own p50 (1 dp)`);
        const sumOfMedians = r1(parts.reduce((a, q) => a + p[q].p50, 0));
        if (sumOfMedians !== r1(p[k].p50)) {
          differ += 1;
          assert.notEqual(row.comboMedians[k], sumOfMedians, `${row.name} ${k}: never the sum of component medians`);
        }
      }
    }
  }
  assert.equal(rows, 55, "11+9, 10+9, 9+7 published rows");
  assert.ok(differ >= 100, `the receipt's combo medians differ from summed medians in many cells (${differ} of ${rows * 3}) — so a sum would be caught`);
});

test("draw additivity: for EVERY receipt player, combo mean = sum of component means within 0.02", () => {
  let n = 0;
  for (const g of DOC.games) for (const p of [...g.forecast.players.away, ...g.forecast.players.home]) {
    n += 1;
    assert.deepEqual(comboReconciliation(p), [], `${p.name}`);
    for (const [k, parts] of Object.entries(COMBO_COMPONENTS)) assert.ok(Math.abs(parts.reduce((a, q) => a + p[q].mean, 0) - p[k].mean) <= 0.02 + 1e-9, `${p.name} ${k}`);
  }
  assert.equal(n, 81);
});

test("any mismatch refuses the build (mutation probes on re-hashed receipts) and fails re-derivation", () => {
  // A combo whose mean no longer reconciles — even with a VALID re-stamped hash — refuses the whole build.
  const bad = structuredClone(DOC);
  bad.games[1].forecast.players.home[0].pra.mean += 0.5;
  bad.games[1].receipt.payloadSha256 = gamePayloadHash(bad.games[1]);
  assert.throws(() => snap(bad), /REFUSED: 401909089 .* combos do not reconcile/);
  const missing = structuredClone(DOC);
  delete missing.games[0].forecast.players.away[2].ptsAst;
  missing.games[0].receipt.payloadSha256 = gamePayloadHash(missing.games[0]);
  assert.throws(() => snap(missing), /REFUSED/);
  // An unhashed edit to a combo breaks the receipt → that game is excluded, never published.
  const unhashed = structuredClone(DOC);
  unhashed.games[2].forecast.players.away[0].ptsReb.p50 += 1;
  assert.equal(snap(unhashed).games.find((g) => g.providerEventId === "401909090"), undefined);
  // A snapshot combo that was tampered, summed from medians, or dropped does not re-derive (the builder exits 1).
  const s = snap();
  const g0 = s.games[0];
  const src = byEvent.get(g0.providerEventId);
  assert.ok(snapshotMatchesSource(g0, src));
  const t1 = structuredClone(g0); t1.players.away[0].comboMedians.pra += 0.1;
  assert.equal(snapshotMatchesSource(t1, src), false);
  const t2 = structuredClone(g0);
  const p = srcPlayers(src).get(t2.players.home[0].providerAthleteId);
  t2.players.home[0].comboMedians.pra = r1(p.pts.p50 + p.reb.p50 + p.ast.p50);
  assert.equal(snapshotMatchesSource(t2, src), r1(p.pts.p50 + p.reb.p50 + p.ast.p50) === r1(p.pra.p50));
  const t3 = structuredClone(g0); delete t3.players.away[1].comboMedians;
  assert.equal(snapshotMatchesSource(t3, src), false);
});

test("the 10-20 regeneration only ADDED fields: stripping them gives the pre-amendment @1 snapshot byte-for-byte", () => {
  // sha256 of app/public/data/nba/experimental-public/2026-10-20.json at origin/main fb19745ed2 (before amendment A).
  const PRE_AMENDMENT_SHA256 = "177a932616b54529af8de52260c536467a686564f3af94c407fa076359629a33";
  const stripped = JSON.parse(PUB_TEXT);
  for (const g of stripped.games) {
    assert.equal(g.players.comboSource, `PRA, P+R and P+A: ${COMBO_LABEL}`);
    delete g.players.comboSource;
    for (const side of ["away", "home"]) for (const r of g.players[side]) delete r.comboMedians;
  }
  assert.equal(crypto.createHash("sha256").update(`${JSON.stringify(stripped, null, 1)}\n`).digest("hex"), PRE_AMENDMENT_SHA256);
  assert.equal(PUB.schema, "nba-experimental-public-snapshot@1", "additive only, so no schema bump");
  assert.equal(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public/latest.json"), "utf8"), PUB_TEXT, "latest.json is the same bytes");
  // …and the committed file is exactly what the producer builds now.
  const rebuilt = buildExperimentalSnapshot({ forecastDoc: structuredClone(DOC), sourceFile: PUB.source.file, sourceCommit: PUB.source.commit, generatedAt: PUB.generatedAt });
  assert.equal(`${JSON.stringify(rebuilt, null, 1)}\n`, PUB_TEXT);
});

test("withheld under amendment A: no range, mean, chance, price or per-draw data travels in the snapshot", () => {
  const text = JSON.stringify({ ...PUB, withheld: null });
  assert.doesNotMatch(text, /"(p10|p90|mean|sd|pHome|pAway|probability|odds|line|edge|ev|rank|draws|samples)"\s*:/i);
  assert.doesNotMatch(text, /\d%/);
});

// ── the view ──────────────────────────────────────────────────────────────────────────────────────────────────────
const renderView = async (lane) => {
  const { default: View } = await import("../../../components/nba/projections-view.tsx");
  return renderToStaticMarkup(React.createElement(View, { lane }));
};
const visibleText = (html) => html.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("every view carries the UNVALIDATED notice, freeze times, receipt hashes and the combo label", async () => {
  const html = await renderView(JSON.parse(PUB_TEXT));
  assert.match(html, /UNVALIDATED EXPERIMENTAL SIMULATION/);
  for (const g of PUB.games) {
    assert.ok(html.includes(g.receipt.payloadSha256.slice(0, 12)), `receipt hash ${g.providerEventId}`);
    assert.ok(html.includes(g.receipt.modelVersion));
  }
  assert.match(visibleText(html), /frozen Oct 20, 8:29 AM ET/);
  assert.ok(html.includes(COMBO_LABEL));
  assert.match(visibleText(html), /default order is expected minutes/);
  // The empty state (switch off or past slate) still carries the notice and states why it is empty.
  const empty = await renderView(null);
  assert.match(empty, /UNVALIDATED EXPERIMENTAL SIMULATION/);
  assert.match(empty, /No current experimental projections/);
  assert.doesNotMatch(empty, /<table/);
});

test("every rendered number equals the snapshot: each board cell is the snapshot's value for that player", async () => {
  const html = await renderView(JSON.parse(PUB_TEXT));
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const trs = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')));
  const expected = [];
  for (const g of PUB.games) for (const side of ["away", "home"]) for (const r of g.players[side]) expected.push({ g, side, r });
  assert.equal(trs.length, expected.length, "every published player, once");
  const ix = new Map(expected.map((e) => [`${e.r.name}${e.r.injuryStatus ? ` · ${e.r.injuryStatus}` : ""}|${e.g[e.side].abbr}`, e]));
  const f = (v) => (v == null ? "—" : String(v));
  const seen = new Set();
  for (const cells of trs) {
    const e = ix.get(`${cells[0]}|${cells[1]}`);
    assert.ok(e, `row ${cells[0]} is a snapshot player`);
    seen.add(e.r.providerAthleteId);
    assert.deepEqual(cells.slice(2), [f(e.r.expectedMinutes), ...STATS.map(([k]) => f(e.r.medians[k])), ...COMBO_STATS.map(([k]) => f(e.r.comboMedians[k]))]);
  }
  assert.equal(seen.size, expected.length);
  // Default order: expected minutes, high to low — and no position number column.
  const mins = trs.map((c) => Number(c[2]));
  assert.deepEqual(mins, [...mins].sort((a, b) => b - a));
  const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(head, "Player Team Min PTS REB AST 3PM PRA P+R P+A");
});

test("forbidden vocabulary is absent from the rendered view (beyond the withheld disclaimers that name it)", async () => {
  for (const lane of [JSON.parse(PUB_TEXT), null]) {
    let rest = visibleText(await renderView(lane)).replace(/not a betting\s+recommendation/g, "");
    for (const v of Object.values(WITHHELD)) rest = rest.split(v).join("");
    assert.doesNotMatch(rest, /%|probabilit|\bpicks?\b|\bedges?\b|\blean\b|\bodds\b|\blines?\b|\bEV\b|\btop\b|\brank|#\s?\d|best bet|\block\b|\bvalue\b|\blive\b/i);
  }
  // The client island's own strings too (sort status, buttons, empty filter state).
  const src = fs.readFileSync(path.join(APP, "src/components/nba/projection-board.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /probabilit|\bpicks?\b|\bedge\b|\blean\b|\bodds\b|\bEV\b|\btop\b|\brank|highlight|badge/i);
});

test("the route reads ONLY the lane snapshot: no data/internal, no fs in the view/island/ops, same laneIsCurrent gate", () => {
  const page = fs.readFileSync(path.join(APP, "src/app/nba/projections/page.tsx"), "utf8");
  // Follow-up to PR 1163: the default view goes through boardContext with no date, whose no-date branch is exactly
  // loadCurrentLane(buildEtDate) behind the amendment switch — the same gate /nba uses.
  assert.match(page, /boardContext\(\{ date: null, nowIso: now\.toISOString\(\), buildEtDate: currentEtDate\(now\), enabled: AMENDMENT_A\.enabled \}\)/);
  const ctx = fs.readFileSync(path.join(APP, "src/components/nba/projection-board-context.ts"), "utf8");
  assert.match(ctx, /!enabled \? null : date == null \? loadCurrentLane\(buildEtDate\) : loadLaneForDate\(date\)/);
  for (const rel of ["src/app/nba/projections/page.tsx", "src/app/nba/projections/[date]/page.tsx", "src/components/nba/projections-view.tsx", "src/components/nba/projection-board.tsx", "src/components/nba/projection-game-status.tsx", "src/lib/sports/nba/projection-board-ops.mjs", "src/components/nba/experimental-lane.tsx", "src/components/nba/projection-board-context.ts"]) {
    const s = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.ok(!s.includes("data/internal") && !s.includes('"internal"'), `${rel} never names data/internal`);
    if (!["src/components/nba/experimental-lane.tsx", "src/components/nba/projection-board-context.ts"].includes(rel)) assert.doesNotMatch(s, /from "node:|require\(/, `${rel} reads no file`);
  }
  const lane = fs.readFileSync(path.join(APP, "src/components/nba/experimental-lane.tsx"), "utf8");
  assert.match(lane, /path\.join\(process\.cwd\(\), "public", "data", "nba", "experimental-public", "latest\.json"\)/, "the only file the loader reads");
  assert.equal(laneIsCurrent(PUB, "2026-10-21"), false, "the next day's build hides this slate on /nba/projections as on /nba");
});

test("controls: native labelled select/input/button (keyboard), table scrolls in its own container, no motion", async () => {
  const html = await renderView(JSON.parse(PUB_TEXT));
  for (const name of ["Matchup", "Team", "Player", "Stat"]) assert.match(html, new RegExp(`<label[^>]*for="[^"]+"[^>]*>${name}<`), name);
  assert.equal((html.match(/<select /g) ?? []).length, 3);
  assert.match(html, /<input [^>]*type="search"/);
  assert.equal((html.match(/<button type="button"[^>]*aria-label="Sort by /g) ?? []).length, 7, "one sort button per stat column");
  assert.match(html, /class="overflow-x-auto max-w-full[^"]*"[^>]*tabindex="0" role="region"/);
  assert.match(html, /vault-page-shell[^"]*overflow-x-hidden/);
  for (const rel of ["src/components/nba/projections-view.tsx", "src/components/nba/projection-board.tsx"]) {
    const code = fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /\btransition|animate-|@keyframes|scroll-smooth|behavior: "smooth"/, `${rel} has no motion`);
  }
});

test("view ops: filters and a reader's sort change only order/visibility, never a value", () => {
  const rows = boardRows(PUB, PROJECTION_BOARD_STATS);
  assert.equal(rows.length, 55);
  const { matchups, teams } = boardOptions(PUB);
  assert.deepEqual(matchups.map((m) => m.label), ["Boston Celtics at Detroit Pistons", "Philadelphia 76ers at New York Knicks", "Oklahoma City Thunder at San Antonio Spurs"]);
  assert.equal(teams.length, 6);
  assert.equal(filterRows(rows, { matchup: "401909089" }).length, 19);
  assert.equal(filterRows(rows, { team: "SA" }).length, 7);
  const one = filterRows(rows, { player: rows[0].name.slice(0, 4).toUpperCase() });
  assert.ok(one.some((r) => r.id === rows[0].id));
  const pra = PROJECTION_BOARD_STATS.findIndex(([k]) => k === "pra");
  const sorted = sortRows(rows, { key: pra, dir: "desc" });
  assert.deepEqual(sorted.map((r) => r.v[pra]), [...rows.map((r) => r.v[pra])].sort((a, b) => b - a));
  assert.deepEqual(sortRows(rows, { key: pra, dir: "asc" }).map((r) => r.v[pra]), [...rows.map((r) => r.v[pra])].sort((a, b) => a - b));
  // Same multiset of rows, same objects: nothing recomputed.
  assert.deepEqual(new Set(sorted), new Set(rows));
  assert.deepEqual(sortRows(rows, {}).map((r) => r.min), [...rows.map((r) => r.min)].sort((a, b) => b - a));
  const groups = statGroups(PROJECTION_BOARD_STATS, COMBO_STATS.map(([k]) => k));
  assert.deepEqual(groups.slice(0, 3).map((g) => g.cols), [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3], [4, 5, 6]]);
});

test("/nba links the board with one line from the lane, without odds/edge vocabulary", async () => {
  const { default: Lane } = await import("../../../components/nba/experimental-lane.tsx");
  const html = renderToStaticMarkup(React.createElement(Lane, { snapshot: JSON.parse(PUB_TEXT) }));
  assert.equal((html.match(/href="\/nba\/projections\/"/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(html.indexOf('href="/nba/projections/"'), html.indexOf("</a>", html.indexOf('href="/nba/projections/"'))), /odds|edge|pick|top|rank/i);
});
