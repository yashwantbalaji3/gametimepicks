/**
 * gtp-graphics-export@1 (Track E) — on the COMMITTED artifacts: NFL week 8 player boards + weekly-boards 2-08.json, the
 * NBA 2026-10-29 lane and its official receipts. Values must equal the website's board/game value AND the official
 * snapshot; experimental/estimate rows are never graphic-eligible; withheld sportsbook fields never carry a number;
 * output is byte-deterministic; started games never contribute a row.
 * Run: cd app && npx tsx --test src/lib/social/graphics-export.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { nbaExportArgs, nflExportArgs, runExport } from "../../../scripts/social/export-graphics.mjs";
import {
  buildNbaGraphicsExport, buildNflGraphicsExport, GRAPHICS_EXPORT_SCHEMA, MODEL_STATUS, WITHHELD_REASON, graphicsExportViolations, marketFields, serializeGraphicsExport,
} from "./graphics-export.mjs";
import { DISPLAY_AUTHORIZATION } from "../odds/display-authorization.mjs";
import { officialSnapshotFor } from "../sports/nfl/forecast-view-load.mjs";
import { playerOf } from "../consistency/official-snapshot.mjs";

const APP = process.cwd();
const PUB = path.join(APP, "public");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(PUB, rel), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-graphics-export-"));
const run = (args, name) => runExport({ ...args, out: path.join(tmp, name) });

const WEEK_ARTIFACT = read("data/nfl/weekly-boards/2-08.json");
const TNF = "401873023"; // CAR @ GB, 2026-10-30T00:15Z — Thursday night of week 8
const FRIDAY = "2026-10-30T13:00:00Z";
const NBA_DATE = "2026-10-29";
const NBA_BEFORE_TIPS = "2026-10-29T20:00:00Z";
const NBA_LANE = read(`data/nba/experimental-public/${NBA_DATE}.json`);

const nflFriday = run({ sport: "nfl", week: "8", "as-of": FRIDAY }, "nfl-friday.json").doc;
const nflAtArtifact = run({ sport: "nfl", week: "8", "as-of": WEEK_ARTIFACT.generatedAt }, "nfl-artifact.json").doc;
// After the week rolls over, week 8 leaves the forecast union and its game pages read the archive: then these
// committed-week assertions no longer describe a live page and are skipped (never weakened).
const WEEK8_LIVE = nflFriday.rows.length > 0 && nflFriday.rows.every((r) => r.checks.gamePageValue === "EQUAL");

const isNumDeep = (v) => (typeof v === "number" ? true : v && typeof v === "object" ? Object.values(v).some(isNumDeep) : false);

test("NFL: the contract holds on the committed week 8 export (validator clean, schema, five boards)", () => {
  for (const doc of [nflFriday, nflAtArtifact]) {
    assert.deepEqual(graphicsExportViolations(doc), []);
    assert.equal(doc.schemaVersion, GRAPHICS_EXPORT_SCHEMA);
    assert.deepEqual(doc.boards.map((b) => b.id), ["top5_pass_yds", "top5_rush_yds", "top5_reception_yds", "top5_receptions", "top5_anytime_td"]);
  }
});

test("NFL: Friday export excludes Thursday night and every started game; only Sunday/Monday games", { skip: !WEEK8_LIVE && "week 8 is no longer in the live forecast union" }, () => {
  assert.deepEqual(nflFriday.scope.eventsExcludedStarted.map((e) => e.eventId), [TNF]);
  assert.equal(nflFriday.scope.eventsIncluded.length, 13);
  const asOf = Date.parse(FRIDAY);
  for (const r of nflFriday.rows) {
    assert.notEqual(r.identity.eventId, TNF);
    assert.ok(Date.parse(r.identity.kickoffUtc.replace(/Z$/, ":00Z")) > asOf, `${r.rowId} kicked off before asOf`);
    assert.ok(["Sun", "Mon"].includes(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(Date.parse(r.identity.kickoffUtc.replace(/Z$/, ":00Z"))))));
  }
  // and a started game is refused by the validator if anyone forces it in
  const forced = structuredClone(nflFriday);
  forced.rows[0].identity.kickoffUtc = "2026-10-30T00:15Z";
  assert.ok(graphicsExportViolations(forced).some((v) => /game started at asOf/.test(v)));
});

test("NFL: receiving yards, receptions, anytime TD are OFFICIAL Top 5s; passing and rushing yards are labelled OFFICIAL_ESTIMATE Top 5s (founder P0 2026-10-30)", { skip: !WEEK8_LIVE && "week 8 rolled over" }, () => {
  const by = Object.fromEntries(nflFriday.boards.map((b) => [b.id, b]));
  for (const id of ["top5_reception_yds", "top5_receptions", "top5_anytime_td"]) {
    assert.equal(by[id].modelStatus, MODEL_STATUS.OFFICIAL);
    assert.equal(by[id].rowIds.length, 5);
    assert.equal(by[id].graphicEligible, true);
  }
  /* The written policy permits public display of an ESTIMATE with its label (family-publication.mjs ESTIMATE DISPLAY
     POLICY), so these rows are graphic-eligible ONLY carrying that label — never promoted, never a direction. */
  for (const id of ["top5_pass_yds", "top5_rush_yds"]) {
    assert.equal(by[id].modelStatus, MODEL_STATUS.OFFICIAL_ESTIMATE);
    assert.equal(by[id].label, "Estimate · calibration standard not yet met");
    assert.ok(by[id].rowIds.length >= 1 && by[id].rowIds.length <= 5);
    assert.equal(by[id].graphicEligible, true);
    assert.equal(by[id].readiness, null);
    for (const rid of by[id].rowIds) {
      const r = nflFriday.rows.find((x) => x.rowId === rid);
      assert.equal(r.model.status, MODEL_STATUS.OFFICIAL_ESTIMATE);
      assert.equal(r.model.label, by[id].label, `${rid}: the one label rides on the row`);
      assert.equal(r.graphicEligibility.eligible, true, `${rid}: ${r.graphicEligibility.reasons}`);
      assert.equal(r.marketEligibility.directionQualified, false, `${rid}: an estimate is never direction-qualified`);
      assert.ok(["WITHHELD", "NOT_APPLICABLE"].includes(r.market.direction.state));
      assert.notEqual(r.market.direction.reason, WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1);
    }
  }
});

test("NFL: at the artifact's own instant the export IS the website's Top 5 (same players, ranks, values, ranges, readiness)", () => {
  const site = Object.fromEntries(WEEK_ARTIFACT.topBoards.weekly.boards.map((b) => [b.id, b]));
  for (const b of nflAtArtifact.boards) {
    const s = site[b.id];
    if (s.state === "ESTIMATE") {
      /* founder P0 2026-10-30: the site ranks a labelled ESTIMATE family exactly as the export does — same players,
         ranks, values and ranges, carrying the site's one estimate label; never direction-qualified */
      assert.equal(b.modelStatus, MODEL_STATUS.OFFICIAL_ESTIMATE, b.id);
      assert.equal(b.label, s.estimate.label, b.id);
      assert.equal(b.label, "Estimate · calibration standard not yet met", b.id);
      assert.ok(b.rowIds.length >= 1, b.id);
      for (const id of b.rowIds) {
        const r = nflAtArtifact.rows.find((x) => x.rowId === id);
        assert.equal(r.model.status, MODEL_STATUS.OFFICIAL_ESTIMATE, id);
        assert.equal(r.model.label, s.estimate.label, id);
        assert.equal(r.marketEligibility.directionQualified, false, `${id}: an estimate is never direction-qualified`);
      }
    } else if (s.state !== "PUBLISHED") {
      assert.deepEqual(b.rowIds, []);
      assert.equal(b.readiness.text, s.readiness.text);
      continue;
    }
    const rows = b.rowIds.map((id) => nflAtArtifact.rows.find((r) => r.rowId === id));
    assert.deepEqual(
      rows.map((r) => [r.board.rank, r.identity.playerId, r.identity.eventId, r.model.value, r.model.p10 ?? null, r.model.p90 ?? null]),
      s.rows.map((r) => [r.rank, r.playerId, String(r.providerEventId), r.value, r.p10 ?? null, r.p90 ?? null]),
      b.id,
    );
  }
});

test("NFL: every exported value == raw player board == game page view == official snapshot", { skip: !WEEK8_LIVE && "week 8 rolled over" }, () => {
  const forecasts = read("data/nfl/forecasts/latest.json").forecasts;
  for (const r of nflFriday.rows) {
    const board = read(`data/nfl/player-board/${r.identity.eventId}.json`);
    const m = board.players.find((p) => p.playerId === r.identity.playerId).markets[r.identity.market];
    assert.equal(r.model.value, m[r.identity.metric], `${r.rowId} board`);
    assert.equal(r.checks.gamePageValue, "EQUAL");
    assert.equal(r.provenance.playerBoardSha256, crypto.createHash("sha256").update(fs.readFileSync(path.join(PUB, "data/nfl/player-board", `${r.identity.eventId}.json`))).digest("hex"));
    const f = forecasts.find((x) => String(x.providerEventId) === r.identity.eventId);
    const { snapshot } = officialSnapshotFor(f, board);
    assert.ok(snapshot, `${r.rowId}: no official snapshot`);
    const fam = playerOf(snapshot, r.identity.playerId).families[r.identity.market];
    assert.equal(r.model.value, r.identity.metric === "probability" ? fam.distribution.p : fam.median, `${r.rowId} snapshot`);
    assert.match(r.snapshot.id, /^[0-9a-f]{64}$/);
  }
});

test("NBA: every player median == the lane the site renders == the official snapshot (1 dp); sides official; estimate and team scores never graphics", () => {
  const doc = run({ sport: "nba", date: NBA_DATE, "as-of": NBA_BEFORE_TIPS }, "nba.json").doc;
  assert.deepEqual(graphicsExportViolations(doc), []);
  assert.equal(doc.publication.status, "PUBLISHED");
  assert.equal(doc.scope.eventsIncluded.length, NBA_LANE.games.length);
  let players = 0;
  for (const g of NBA_LANE.games) {
    const ev = doc.events.find((e) => e.eventId === String(g.providerEventId));
    assert.match(ev.snapshotId, /^[0-9a-f]{64}$/);
    for (const side of ["away", "home"]) for (const p of g.players[side]) {
      for (const [k, v] of [...Object.entries(p.medians), ...Object.entries(p.comboMedians ?? {})]) {
        const r = doc.rows.find((x) => x.rowId === `nba:${NBA_DATE}:${g.providerEventId}:${p.providerAthleteId}:${k}`);
        assert.equal(r.model.value, v);
        assert.equal(r.model.status, MODEL_STATUS.OFFICIAL);
        assert.equal(r.checks.officialSnapshot, "EQUAL_1DP");
        assert.equal(r.snapshot.id, ev.snapshotId);
        assert.equal(r.graphicEligibility.eligible, true);
        players += 1;
      }
    }
    const side = doc.rows.find((x) => x.rowId === `nba:${NBA_DATE}:${g.providerEventId}:game:winner_side`);
    assert.equal(side.model.value, g.elo.state === "FAVOURED" ? g.elo.favoured : null);
    const est = doc.rows.find((x) => x.rowId === `nba:${NBA_DATE}:${g.providerEventId}:game:elo_win_estimate`);
    if (est.model.value != null) assert.equal(est.model.value, g.elo.winProbability.home);
    assert.equal(est.graphicEligibility.eligible, false);
    const ts = doc.rows.find((x) => x.rowId === `nba:${NBA_DATE}:${g.providerEventId}:game:team_scores`);
    assert.equal(ts.model.status, MODEL_STATUS.UNAVAILABLE);
    assert.equal(ts.model.value, null);
    assert.equal(ts.graphicEligibility.eligible, false);
  }
  assert.ok(players > 100);
});

test("NBA: started games are excluded at asOf; a date with no committed lane is NOT_PUBLISHED with zero rows", () => {
  const firstTip = NBA_LANE.games.map((g) => g.tipUtc).sort()[0];
  const mid = new Date(Date.parse(firstTip.replace(/Z$/, ":00Z")) + 60_000).toISOString();
  const doc = run({ sport: "nba", date: NBA_DATE, "as-of": mid }, "nba-mid.json").doc;
  const startedIds = NBA_LANE.games.filter((g) => Date.parse(g.tipUtc.replace(/Z$/, ":00Z")) <= Date.parse(mid)).map((g) => String(g.providerEventId));
  assert.ok(startedIds.length > 0);
  assert.deepEqual(doc.scope.eventsExcludedStarted.map((e) => e.eventId).sort(), startedIds.sort());
  assert.ok(doc.rows.every((r) => !startedIds.includes(r.identity.eventId)));
  assert.deepEqual(graphicsExportViolations(doc), []);
  const none = run({ sport: "nba", date: "2026-07-04", "as-of": "2026-07-04T12:00:00Z" }, "nba-none.json").doc;
  assert.equal(none.publication.status, "NOT_PUBLISHED");
  assert.deepEqual(none.rows, []);
});

test("withheld sportsbook fields never contain numbers (line, price, direction) — today NOT_AUTHORIZED_FOR_SOCIAL everywhere", () => {
  const nba = run({ sport: "nba", date: NBA_DATE, "as-of": NBA_BEFORE_TIPS }, "nba-w.json").doc;
  for (const doc of [nflFriday, nba]) {
    assert.equal(doc.authorization.social.authorized, false);
    for (const r of doc.rows) {
      for (const k of ["line", "price", "direction"]) {
        assert.equal(isNumDeep(r.market[k]), false, `${r.rowId} ${k}`);
        assert.ok(["WITHHELD", "NOT_APPLICABLE"].includes(r.market[k].state));
      }
      assert.equal(r.market.price.reason, WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL);
      if (r.marketEligibility.marketType === "OVER_UNDER") {
        assert.equal(r.market.line.reason, WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL);
        assert.equal(r.market.direction.reason, WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL);
      } else assert.equal(r.market.direction.state, "NOT_APPLICABLE");
    }
  }
  // a smuggled number is caught
  const bad = structuredClone(nflFriday);
  bad.rows[0].market.line = { state: "WITHHELD", reason: "NOT_AUTHORIZED_FOR_SOCIAL", value: 5.5 };
  assert.ok(graphicsExportViolations(bad).some((v) => /market\.line carries a number/.test(v)));
});

test("even with the social surface authorized, contract @1 carries no number and no direction for an unqualified family", () => {
  const rec = structuredClone(DISPLAY_AUTHORIZATION);
  for (const s of ["nba", "nfl"]) Object.assign(rec[s], { socialDisplay: true, socialFeedPrices: true, socialFeedPricesConfirmationRef: "docs/x.md" });
  const td = marketFields({ sport: "nfl", directionKey: null, marketType: "YES_NO", record: rec });
  assert.equal(td.market.direction.state, "NOT_APPLICABLE");
  const rec_ = marketFields({ sport: "nfl", directionKey: "receptions", marketType: "OVER_UNDER", record: rec });
  assert.equal(rec_.market.direction.reason, WITHHELD_REASON.DIRECTION_NOT_QUALIFIED);
  assert.equal(rec_.market.line.reason, WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1);
  const tpm = marketFields({ sport: "nba", directionKey: "threePm", marketType: "OVER_UNDER", record: rec });
  assert.equal(tpm.market.direction.reason, WITHHELD_REASON.DIRECTION_NOT_QUALIFIED);
  const pts = marketFields({ sport: "nba", directionKey: "pts", marketType: "OVER_UNDER", record: rec });
  assert.equal(pts.marketEligibility.directionQualified, true);
  for (const f of [td, rec_, tpm, pts]) for (const k of ["line", "price", "direction"]) assert.equal(isNumDeep(f.market[k]), false);
});

test("experimental / unavailable values and unlabelled estimates are never graphic-eligible (validator refuses a forced one)", () => {
  const nba = run({ sport: "nba", date: NBA_DATE, "as-of": NBA_BEFORE_TIPS }, "nba-e.json").doc;
  for (const doc of [nflFriday, nba]) {
    for (const r of doc.rows) {
      if (r.model.status === MODEL_STATUS.OFFICIAL) continue;
      if (r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE && doc.sport === "nfl") { assert.ok(r.model.label, `${r.rowId}: an NFL estimate always carries its label`); continue; }
      assert.equal(r.graphicEligibility.eligible, false, r.rowId);
    }
  }
  /* the NBA Elo estimate is issued no label: never a graphic */
  assert.ok(nba.rows.filter((r) => r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE).every((r) => !r.model.label && r.graphicEligibility.eligible === false));
  /* an NFL estimate stripped of its label is refused */
  const est = nflFriday.rows.find((r) => r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE && r.graphicEligibility.eligible);
  if (est) {
    const forcedEst = structuredClone(nflFriday);
    delete forcedEst.rows.find((r) => r.rowId === est.rowId).model.label;
    assert.ok(graphicsExportViolations(forcedEst).some((x) => /graphic-eligible with status OFFICIAL_ESTIMATE and no label/.test(x)));
  }
  const forced = structuredClone(nba);
  const r = forced.rows.find((x) => x.kind === "PLAYER_PROP");
  r.model.status = MODEL_STATUS.EXPERIMENTAL;
  const v = graphicsExportViolations(forced);
  assert.ok(v.some((x) => /graphic-eligible with status EXPERIMENTAL/.test(x)));
  assert.ok(v.some((x) => /EXPERIMENTAL row carries a value/.test(x)));
});

test("determinism: the CLI run twice (separate processes) writes byte-identical files; no wall-clock field", () => {
  const outs = [];
  for (const i of [1, 2]) {
    for (const [sport, extra] of [["nfl", ["--week", "8"]], ["nba", ["--date", NBA_DATE]]]) {
      const out = path.join(tmp, `det-${sport}-${i}.json`);
      const res = spawnSync("npx", ["tsx", "scripts/social/export-graphics.mjs", "--sport", sport, ...extra, "--as-of", sport === "nba" ? NBA_BEFORE_TIPS : FRIDAY, "--out", out], { cwd: APP, encoding: "utf8" });
      assert.equal(res.status, 0, res.stderr);
      outs.push([`${sport}`, fs.readFileSync(out)]);
    }
  }
  assert.ok(outs[0][1].equals(outs[2][1]), "nfl bytes differ between runs");
  assert.ok(outs[1][1].equals(outs[3][1]), "nba bytes differ between runs");
  assert.equal(serializeGraphicsExport(JSON.parse(outs[0][1])), outs[0][1].toString("utf8"));
  for (const [, buf] of outs) assert.doesNotMatch(buf.toString("utf8"), /"(generatedAt|builtAt|exportedAt|now)"\s*:/);
});

test("the export is never written under public/ (never served under /data)", () => {
  const res = spawnSync("npx", ["tsx", "scripts/social/export-graphics.mjs", "--sport", "nfl", "--week", "8", "--as-of", FRIDAY, "--out", path.join(APP, "public/data/social/x.json")], { cwd: APP, encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /never served/);
  assert.equal(fs.existsSync(path.join(APP, "public/data/social/x.json")), false);
  const noAsOf = spawnSync("npx", ["tsx", "scripts/social/export-graphics.mjs", "--sport", "nfl", "--week", "8", "--out", path.join(tmp, "y.json")], { cwd: APP, encoding: "utf8" });
  assert.equal(noAsOf.status, 1);
  assert.match(noAsOf.stderr, /--as-of/);
});

test("a value that differs between the website and the official snapshot refuses the export (never published)", () => {
  const nba = nbaExportArgs({ date: NBA_DATE, asOf: NBA_BEFORE_TIPS });
  const [id, entry] = [...nba.snapshots.entries()][0];
  const snap = structuredClone(entry.snapshot);
  const fam = snap.players[0].families.pts;
  fam.median += 0.5;
  nba.snapshots.set(id, { snapshot: snap, refusal: null });
  assert.throws(() => buildNbaGraphicsExport(nba), /lane median .* official snapshot/);

  const nfl = nflExportArgs({ seasonType: 2, week: 8, asOf: FRIDAY });
  const top = nflFriday.rows[0];
  const view = nfl.views.find((v) => String(v.providerEventId) === top.identity.eventId);
  const fams = view.players.find((p) => p.playerId === top.identity.playerId).families;
  const key = Object.keys(fams).find((k) => fams[k].value === top.model.value);
  fams[key] = { ...fams[key], value: fams[key].value + 1 };
  assert.throws(() => buildNflGraphicsExport(nfl), /game page value/);
});
