/**
 * CROSS-SURFACE CANONICAL PARITY (founder invariant, 2026-10-29) — for each sport + game id + player id + market +
 * official forecast version + frozen pregame snapshot there is exactly ONE official number, and every public consumer
 * reads it. This file builds the canonical value ONCE per key from the official snapshot owner
 * (official-snapshot.mjs, through the same loader the game page uses) and then calls each public consumer's OWN
 * accessor on the ACTUAL committed artifacts, asserting value AND version for the same key. A mismatch fails.
 *
 *   NFL (week 8, CAR @ GB 401873023 Thursday + BAL @ BUF 401873026 Sunday)
 *     canonical  officialSnapshotFor(record of the live union resolved through nflPublicRecordResolver, raw board, WM)
 *     consumers  game page view (loadForecastView) · game page hero summary (the union forecastSummary)
 *                · week page (weekGames) · nfl/index.json (the hub read, homepage/Today featured cards, top reads,
 *                  the game page's save card, product-day all read it) · nflHub read · featuredNfl card
 *                · Live Hub roster featured rows (buildNflHubRoster) · player pages + Ask player rows (buildMyPlayerRows)
 *                · End Zone Vault (hub vault card) · Results frozen Top boards (results/top-boards/<day>.json)
 *                · Ask GameTime's NFL forecast builder (source rule: the same record resolver)
 *   NBA (2026-10-29 lane)
 *     canonical  nbaOfficialSnapshot (Elo side + v0.1 players) over the committed v0.1 receipt
 *     consumers  public lane file · Elo game-winner accessor (eloWinProbabilityOf — /nba cards, Theater panel, boards,
 *                Level A) · /nba/projections boardRows · Level A selections + projections (bank builder / Today)
 *                · Level A game-winner display · /nba hub + homepage Command Center favoured side (nbaTodaySlate)
 *                · homepage latest lane (latest.json byte-equal to the date file)
 *
 * Read-only over committed files. Run (from app/): npx tsx --test src/lib/consistency/cross-surface-canonical.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { officialSnapshotFor, loadForecastView } from "../sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../sports/nfl/public-record.mjs";
import { readWorldModelArtifacts } from "../sports/nfl/world-model-v2/read.mjs";
import { weekGames } from "../sports/nfl/week-games.ts";
import { nflHub } from "../sport-hub/adapters.ts";
import { featuredNfl } from "../command-center/featured.ts";
import { buildNflHubRoster } from "../live/nfl-hub-data.ts";
import { buildMyPlayerRows } from "../my/read-model.ts";
import { playerOf, nbaOfficialSnapshot } from "./official-snapshot.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { boardRows } from "../sports/nba/projection-board-ops.mjs";
import { STATS, PROJECTION_BOARD_STATS } from "../sports/nba/experimental-public-lane.mjs";
import { nbaSelections } from "../products/level-a/sources.mjs";
import { nbaGameWinnerDisplay } from "../products/level-a/nba-game-winner-source.mjs";
import { nbaTodaySlateFrom } from "../sport-hub/nba-hub.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const PUB = path.join(APP, "public");
const DATA = path.join(PUB, "data");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(String(b).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const r1 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/* ───────────────────────────────────────────── NFL ───────────────────────────────────────────── */

const NFL_EVENTS = Object.freeze([
  { id: "401873023", matchup: "CAR @ GB", weekKey: "2-08", nowIso: "2026-10-29T20:00:00Z" }, // Thursday night
  { id: "401873026", matchup: "BAL @ BUF", weekKey: "2-08", nowIso: "2026-11-01T14:00:00Z" }, // Sunday early window
]);

/** THE canonical NFL key set, built once: exactly the inputs forecast-view-load.mjs hands the snapshot. */
function nflCanonical(eventId) {
  const union = unionFrozenForecasts(
    readJson(path.join(DATA, "nfl/forecasts/latest.json")),
    readJson(path.join(DATA, "nfl/forecasts/frozen-latest.json")),
    { resolve: nflPublicRecordResolver(REPO) },
  );
  const record = union.forecasts.find((f) => String(f.providerEventId) === eventId);
  assert.ok(record, `${eventId}: the forecast of record is committed`);
  const board = readJson(path.join(DATA, "nfl/player-board", `${eventId}.json`));
  const world = readWorldModelArtifacts(PUB).find((a) => String(a.identity.providerEventId) === eventId) ?? null;
  const { snapshot, refusal } = officialSnapshotFor(record, board, world);
  assert.equal(refusal, null, `${eventId}: the official snapshot builds (refusal ${refusal})`);
  return { record, board, snapshot };
}

for (const ev of NFL_EVENTS) {
  test(`NFL ${ev.matchup} ${ev.id}: every game-outcome consumer equals the official snapshot (value + version)`, () => {
    const { record, snapshot: snap } = nflCanonical(ev.id);
    const g = snap.game;
    const want = {
      home: g.pHomePublished, away: g.pAway,
      scoreHome: g.projectedScore.home, scoreAway: g.projectedScore.away,
      totalMedian: record.forecastSummary.total.median,
      generatedAt: snap.generatedAt, inputHash: record.model?.inputHash ?? null,
    };
    assert.equal(snap.modelVersions.game, `${record.model.id}@v${record.model.version}`, "snapshot names the record's model version");
    assert.ok(sameInstant(snap.generatedAt, record.generatedAt), "snapshot version == record revision");

    // 1. game page view — the same loader the page calls
    const view = loadForecastView(PUB, ev.id);
    assert.ok(view, "game page view exists");
    assert.equal(view.official.snapshotId, snap.snapshotId, "game page official snapshot id == canonical");

    // 2. game page hero (`s = f.forecastSummary` from the page's own union) — same object the snapshot sealed
    const s = record.forecastSummary;
    assert.deepEqual([s.winProbability.home, s.winProbability.away, s.projectedScore.home, s.projectedScore.away], [want.home, want.away, want.scoreHome, want.scoreAway], "game page hero == canonical");

    // 3. week page
    const wk = weekGames(DATA, ev.weekKey).games.find((x) => String(x.providerEventId) === ev.id);
    assert.ok(wk, "week page lists the game");
    assert.deepEqual([wk.forecastSummary.winProbability.home, wk.forecastSummary.winProbability.away, wk.forecastSummary.projectedScore.home, wk.forecastSummary.projectedScore.away], [want.home, want.away, want.scoreHome, want.scoreAway], "week page == canonical");
    assert.ok(sameInstant(want.generatedAt, wk.generatedAt), "week page reads the canonical revision");

    // 4. nfl/index.json — the hub read, homepage / Today featured cards, top reads, product-day and the save card
    const idx = readJson(path.join(DATA, "nfl/index.json")).events.find((e) => String(e.providerEventId) === ev.id);
    assert.ok(idx, "index carries the game");
    assert.deepEqual([idx.winProbability.home, idx.winProbability.away, idx.projectedScore.home, idx.projectedScore.away, idx.total.median], [want.home, want.away, want.scoreHome, want.scoreAway, want.totalMedian], "index == canonical");
    assert.ok(sameInstant(want.generatedAt, idx.receipt.generatedAt), `index revision ${idx.receipt.generatedAt} == canonical ${want.generatedAt}`);
    assert.equal(idx.receipt.inputHash, want.inputHash, "index input hash == canonical");
    assert.equal(`${idx.receipt.model}@v${idx.receipt.version}`, snap.modelVersions.game, "index model version == canonical");

    // 5. /nfl hub read (nflHub) — the split bar's numbers
    const hub = nflHub(ev.nowIso);
    const row = (hub.rows ?? []).find((r) => r.id === `nfl:${ev.id}`);
    assert.ok(row?.read, "the /nfl hub row carries the official read");
    const split = Object.fromEntries(row.read.split.map((x) => [x.label, x.p]));
    assert.deepEqual([split[record.away.abbr], split[record.home.abbr]], [want.away, want.home], "hub read == canonical");
    assert.ok(sameInstant(hub.freshness, readJson(path.join(DATA, "nfl/index.json")).generatedAt), "hub stamp is the index it read");

    // 6. homepage / Today featured NFL card (index-sourced; only the next pregame game is featured)
    const fc = featuredNfl({ dataRoot: DATA, today: ev.nowIso.slice(0, 10), nowIso: ev.nowIso, freshness: null, status: null });
    if (fc.card && fc.card.settlement.providerEventId === ev.id) {
      assert.equal(fc.card.signal.probability, Math.max(want.home, want.away), "featured card probability == canonical favourite");
    }
  });

  test(`NFL ${ev.matchup} ${ev.id}: every player-prop consumer equals the official snapshot (value + board version)`, () => {
    const { snapshot: snap, board } = nflCanonical(ev.id);
    const canon = (pid, fam) => playerOf(snap, pid)?.families?.[fam] ?? null;
    let checked = 0;

    // 1. Live Hub roster (frozen halves) — featured rows on the game's ET day
    const roster = buildNflHubRoster(ev.nowIso);
    const lg = roster.games.find((x) => x.providerEventId === ev.id);
    assert.ok(lg, "Live Hub lists the game on its ET day");
    assert.ok(sameInstant(board.generatedAt, lg.boardGeneratedAt), "Live Hub reads the canonical board revision");
    for (const f of lg.featured) {
      const c = canon(f.playerId, f.family);
      assert.ok(c, `Live Hub ${f.playerName} ${f.family}: an official snapshot value exists`);
      if (f.kind === "PROBABILITY") assert.equal(f.modelProbability, c.distribution.p, `Live Hub ${f.playerName} ${f.family}`);
      else assert.equal(f.modelValue, c.median, `Live Hub ${f.playerName} ${f.family}`);
      checked += 1;
    }
    for (const t of lg.trackedPredictions) {
      const c = canon(t.playerId, t.market);
      assert.ok(c, `Live Hub tracked ${t.player} ${t.market} is official`);
      if (t.pregameProbability != null) assert.equal(t.pregameProbability, c.distribution.p);
      else assert.equal(t.gtp, c.expected, `Live Hub tracked ${t.player} ${t.market}: the official expected value`);
    }

    // 2. Player pages + Ask player rows (buildMyPlayerRows → nflPlayerForecasts / build-ask-projections)
    const mine = buildMyPlayerRows().filter((r) => board.players.some((p) => p.playerId === r.playerId) && r.matchup === board.matchup);
    /* Player pages list upcoming games only: once the committed forecasts were regenerated after kickoff (TNF CAR @ GB
       after 2026-10-30 00:15Z) the game leaves them. Coverage is required while it is pregame in the committed data. */
    const liveAt = readJson(path.join(DATA, "nfl/forecasts/latest.json")).generatedAt;
    if (Date.parse(board.kickoffUtc) > Date.parse(liveAt)) assert.ok(mine.length > 0, "player pages carry this game's players");
    else assert.equal(mine.length, 0, "a game that has kicked off is no longer on the player pages");
    for (const r of mine) {
      for (const m of r.markets) {
        const c = canon(r.playerId, m.key);
        assert.ok(c, `player page ${r.name} ${m.key} is official`);
        assert.equal(c.state, "PUBLISHED", `player page ${r.name} ${m.key}: only PUBLISHED families`);
        assert.equal(m.median, r1(c.median), `player page ${r.name} ${m.key} median == canonical (1 dp)`);
        checked += 1;
      }
      if (r.anytimeTd != null) { assert.equal(r.anytimeTd, canon(r.playerId, "anytime_td")?.distribution.p, `player page ${r.name} anytime TD`); checked += 1; }
    }

    // 3. End Zone Vault (the /nfl hub vault card) — anytime-TD rows for this game
    const vault = readJson(path.join(DATA, "nfl/end-zone-vault/latest.json"));
    for (const v of [...(vault.selections ?? []), ...(vault.watchlist ?? [])].filter((x) => String(x.providerEventId) === ev.id)) {
      assert.equal(v.tdProbability, canon(v.playerId, "anytime_td")?.distribution.p, `vault ${v.name} == canonical`);
      checked += 1;
    }

    // 4. Results frozen Top boards (write-once) — same value under the freeze's own documented rounding
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.parse(snap.lockAt)));
    const tbFile = path.join(DATA, "results/top-boards", `${day}.json`);
    if (fs.existsSync(tbFile)) {
      for (const b of readJson(tbFile).boards ?? []) for (const row of b.rows ?? []) {
        if (String(row.providerEventId) !== ev.id) continue;
        const c = canon(row.playerId, b.propFamily);
        assert.ok(c, `Results top board ${row.name} ${b.propFamily} is official`);
        if ("probability" in row.projection) assert.equal(row.projection.probability, c.distribution.p, `Results top board ${row.name}`);
        else assert.equal(row.projection.median, Math.round(c.median), `Results top board ${row.name} ${b.propFamily} (frozen integer rounding)`);
        checked += 1;
      }
    }
    assert.ok(checked >= 5, `checked ${checked} player values`);
  });
}

test("NFL: nfl/index.json equals the resolved forecast of record for EVERY indexed game (not only the two above)", () => {
  const union = unionFrozenForecasts(readJson(path.join(DATA, "nfl/forecasts/latest.json")), readJson(path.join(DATA, "nfl/forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(REPO) });
  const byId = new Map(union.forecasts.map((f) => [String(f.providerEventId), f]));
  let n = 0;
  for (const e of readJson(path.join(DATA, "nfl/index.json")).events) {
    const f = byId.get(String(e.providerEventId));
    if (!f || !e.winProbability) continue;
    const s = f.forecastSummary;
    assert.deepEqual([e.winProbability.home, e.winProbability.away, e.projectedScore?.home, e.projectedScore?.away], [s.winProbability.home, s.winProbability.away, s.projectedScore.home, s.projectedScore.away], `${e.matchup}: index == record`);
    assert.ok(sameInstant(f.generatedAt, e.receipt.generatedAt), `${e.matchup}: index revision == record revision`);
    n += 1;
  }
  assert.ok(n >= 2, `checked ${n} indexed games`);
});

test("NFL SOURCE: every producer/consumer of game numbers resolves an excluded public copy to its record", () => {
  // A public copy of an EXCLUDED revision (record-exclusions.mjs) must never reach a reader as itself; the game page,
  // week page and event read model resolve it, so the index (hub / featured cards / top reads) and Ask must too.
  const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const rel of ["scripts/nfl/build-nfl-index.mjs", "scripts/ask/build-ask-projections.mjs", "src/lib/sports/nfl/week-games.ts", "src/lib/events/read-model.ts", "src/lib/sports/nfl/forecast-view-load.mjs", "src/app/nfl/game/[eventId]/page.tsx"]) {
    const s = src(rel);
    assert.match(s, /nflPublicRecordResolver\(/, `${rel} resolves excluded copies to the record`);
    for (const m of s.matchAll(/forecasts\/latest\.json/g)) {
      const around = s.slice(Math.max(0, m.index - 400), m.index + 400);
      if (/run ?counts|nflRunCounts|model\?\.id/.test(around)) continue;
      assert.match(around, /unionFrozenForecasts|nflPublicRecordResolver/, `${rel}: latest.json is read through the record resolver`);
    }
  }
});

/* ───────────────────────────────────────────── NBA ───────────────────────────────────────────── */

const NBA_DATE = "2026-10-29";

test(`NBA ${NBA_DATE}: every consumer equals the official snapshot (Elo side + v0.1 medians, same frozen receipt)`, () => {
  const offPath = path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts", `${NBA_DATE}.json`);
  const official = { doc: readJson(offPath), path: offPath, sha256: null };
  const laneRel = `nba/experimental-public/${NBA_DATE}.json`;
  const laneBytes = fs.readFileSync(path.join(DATA, laneRel), "utf8");
  const lane = JSON.parse(laneBytes);
  assert.equal(lane.date, NBA_DATE);
  assert.ok(lane.games.length >= 1);

  // homepage Command Center reads latest.json; on this slate it must be this date's file byte for byte
  const latest = fs.readFileSync(path.join(DATA, "nba/experimental-public/latest.json"), "utf8");
  if (JSON.parse(latest).date === NBA_DATE) assert.equal(latest, laneBytes, "homepage latest lane == the dated lane");

  const board = new Map(boardRows(lane, PROJECTION_BOARD_STATS).map((r) => [r.id, r]));
  const level = nbaSelections({ repoRoot: REPO, date: NBA_DATE });
  const winner = nbaGameWinnerDisplay({ repoRoot: REPO, date: NBA_DATE });
  const slate = nbaTodaySlateFrom({ nowIso: `${NBA_DATE}T16:30:00Z`, schedule: readJson(path.join(DATA, "nba/schedule/latest.json")), finals: null, lane });
  let medians = 0;

  for (const g of lane.games) {
    const id = String(g.providerEventId);
    const snap = nbaOfficialSnapshot(id, { official, supporting: null });
    // version: the lane game is the snapshot's own frozen receipt
    assert.ok(sameInstant(snap.frozenAt, g.frozenAt), `${id}: lane frozenAt == snapshot frozenAt`);
    assert.equal(g.receipt.modelVersion, official.doc.model?.version ?? official.doc.modelVersion ?? g.receipt.modelVersion);
    // game: Elo side + pHome
    const side = snap.game.winner.side === "HOME" ? g.home.abbr : g.away.abbr;
    assert.equal(g.elo.favoured, side, `${id}: lane favoured side == snapshot`);
    const wp = eloWinProbabilityOf(g);
    assert.ok(wp, `${id}: the lane carries the Elo game-winner estimate (switch ON, field published)`);
    {
      assert.equal(wp.home, snap.game.pHome, `${id}: Elo accessor home == snapshot pHome`);
      assert.equal(wp.away, snap.game.pAway, `${id}: Elo accessor away == snapshot pAway`);
      const w = winner.accessor(id);
      assert.ok(w, `${id}: Level A game-winner display exists`);
      assert.equal(w.pHome, snap.game.pHome, `${id}: Level A game-winner display == snapshot`);
      assert.ok(sameInstant(snap.frozenAt, w.frozenAt), `${id}: Level A display names the snapshot's freeze`);
      assert.equal(w.payloadSha256, g.receipt.payloadSha256, `${id}: Level A display names the lane's receipt`);
    }
    const sel = level.selections.find((x) => x.eventId === id);
    assert.ok(sel, `${id}: Level A selection`);
    assert.equal(sel.selection?.code, snap.game.winner.side.toLowerCase(), `${id}: Level A side == snapshot`);
    assert.equal(sel.uncertainty.home, snap.game.pHome, `${id}: Level A Elo home == snapshot`);
    const hubGame = slate.games.find((x) => String(x.id) === id);
    assert.ok(hubGame?.favoured, `${id}: /nba hub carries the favoured side`);
    if (hubGame?.favoured) assert.equal(hubGame.favoured.abbr, side, `${id}: /nba hub + homepage favoured == snapshot`);

    // players: lane medians, /nba/projections, Level A points
    for (const s of ["away", "home"]) for (const row of g.players?.[s] ?? []) {
      const pid = String(row.providerAthleteId);
      const p = snap.players.find((x) => String(x.playerId) === pid);
      assert.ok(p, `${row.name}: lane prints only official players`);
      const br = board.get(`${id}:${pid}`);
      for (const [k] of STATS) {
        const want = r1(p.families?.[k]?.median);
        assert.equal(row.medians?.[k] ?? null, want, `${row.name} ${k}: lane == snapshot`);
        const i = PROJECTION_BOARD_STATS.findIndex(([x]) => x === k);
        if (i >= 0) assert.equal(br?.v[i], want, `${row.name} ${k}: /nba/projections == snapshot`);
        medians += 1;
      }
      const lp = level.projections.find((x) => x.eventId === id && String(x.playerId) === pid);
      if (lp) assert.equal(lp.points.median, r1(p.families.pts.median), `${row.name}: Level A points == snapshot`);
    }
  }
  assert.ok(medians >= 50, `checked ${medians} medians`);
});

test("NFL: an excluded public copy reaches every resolver-wired consumer as its RECORD revision (committed exclusions)", async () => {
  const { RECORD_EXCLUSIONS } = await import("../sports/nfl/record-exclusions.mjs");
  assert.ok(RECORD_EXCLUSIONS.length >= 1);
  for (const x of RECORD_EXCLUSIONS) {
    const copy = readJson(path.join(REPO, x.file));
    const record = readJson(path.join(REPO, x.recordInstead));
    const live = { generatedAt: "same-run", forecasts: [copy] };
    const shown = unionFrozenForecasts(live, null, { resolve: nflPublicRecordResolver(REPO) }).forecasts[0];
    assert.equal(shown.generatedAt, record.generatedAt, `${x.providerEventId}: the record revision, never the excluded ${copy.generatedAt}`);
    assert.equal(shown.model?.inputHash, record.model?.inputHash);
  }
});

test("NFL settled week 7: Results week report == the archived record the settled game page and week page show", async () => {
  const { archivedForecastFor } = await import("../sports/nfl/archived-forecast.ts");
  const rec = readJson(path.join(DATA, "nfl/reconciliation/2-07.json"));
  let n = 0;
  for (const g of rec.games) {
    const a = archivedForecastFor(DATA, g.providerEventId);
    assert.ok(a, `${g.matchup}: the settled page has its frozen record`);
    const s = a.forecast.forecastSummary;
    const pick = s.winProbability.home >= s.winProbability.away ? { abbr: a.forecast.home.abbr, probability: s.winProbability.home } : { abbr: a.forecast.away.abbr, probability: s.winProbability.away };
    const values = [g.published.projectedScore.home, g.published.projectedScore.away, g.published.pick.abbr, g.published.pick.probability, g.published.total.median];
    const shown = [s.projectedScore.home, s.projectedScore.away, pick.abbr, pick.probability, s.total.median];
    if (a.graded) {
      // a graded EXCLUDED revision: the grade stands, the page shows the record and says so; values may differ only
      // when the exclusion itself records that they do
      assert.equal(a.graded.generatedAt, g.published.generatedAt, `${g.matchup}: Results names the graded revision`);
      if (!a.graded.displayedValueDiffers) assert.deepEqual(values, shown, `${g.matchup}: excluded revision's values equal the record's`);
    } else {
      assert.ok(sameInstant(a.forecast.generatedAt, g.published.generatedAt), `${g.matchup}: Results graded the revision the page shows`);
      assert.deepEqual(values, shown, `${g.matchup}: Results == settled game page`);
    }
    n += 1;
  }
  assert.ok(n >= 10, `checked ${n} settled games`);
});
