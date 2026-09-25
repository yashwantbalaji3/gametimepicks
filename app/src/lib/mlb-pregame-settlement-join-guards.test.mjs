/**
 * MLB PREGAME SETTLEMENT-JOIN — guards (2026-07-22).
 *
 * Pins the settlement-join pipeline (app/scripts/join-mlb-pregame-settlements.mjs): official-StatsAPI-only,
 * deterministic grading, pending≠loss, suspended/postponed handling, playerId-mismatch→ambiguous, no
 * unsupported/ineligible row counted settled-eligible, immutable freezes, path scoping, money-safe.
 * A parity block cross-checks the inline graders against the canonical src/lib/mlb/product-settlement/mlb-markets.ts.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-settlement-join-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { settleOverUnder, settleMoneyline, settleRunLine, gradeLean, gradePlayerLean, gradeTeamLean, extractOfficialGame, findPlayer, mergeLeanKeys, SUPPORTED_JOIN_MARKETS } from "../../scripts/join-mlb-pregame-settlements.mjs";
import { settleOverUnder as ouCanon, settleMlbMoneyline, settleMlbRunLine } from "./mlb/product-settlement/mlb-markets.ts";
import { assertProtectedLedgerIntact } from "./mr-dub/protected-invariant.mjs";

const app = process.cwd();
const repo = path.dirname(app);
const SCRIPT = fs.readFileSync(path.join(app, "scripts/join-mlb-pregame-settlements.mjs"), "utf8");
const JOIN_DIR = path.join(repo, "data/internal/mlb/pregame-archive/settlement-joins");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function makeGame(over = {}) {
  return {
    isFinal: true, abstractGameState: "Final", codedGameState: "F", detailedState: "Final", postponedSuspended: false,
    homeRuns: 5, awayRuns: 3, homeName: "Home Nine", awayName: "Away Nine", homeAbbr: "HN", awayAbbr: "AN", winner: "home",
    players: {
      "111": { id: 111, name: "Sandy Starter", side: "home", batting: null, pitching: { strikeOuts: 7, outs: 18, earnedRuns: 2, inningsPitched: "6.0", gamesStarted: 1, gamesPlayed: 1 } },
      "222": { id: 222, name: "Bobby Bat", side: "away", batting: { hits: 2, totalBases: 5, homeRuns: 1, rbi: 3, runs: 1, atBats: 4, plateAppearances: 4, gamesPlayed: 1 }, pitching: null },
      "333": { id: 333, name: "Duplicate Name", side: "home", batting: { hits: 1, totalBases: 1, homeRuns: 0, rbi: 0, runs: 0, atBats: 3, plateAppearances: 3, gamesPlayed: 1 }, pitching: null },
      "334": { id: 334, name: "Duplicate Name", side: "away", batting: { hits: 0, totalBases: 0, homeRuns: 0, rbi: 0, runs: 0, atBats: 2, plateAppearances: 2, gamesPlayed: 1 }, pitching: null },
    },
    ...over,
  };
}

test("1 · line/selection grading — over/under/push/pending/unavailable", () => {
  assert.equal(settleOverUnder(7, "over", 6.5).status, "win");
  assert.equal(settleOverUnder(7, "under", 6.5).status, "loss");
  assert.equal(settleOverUnder(6, "over", 6.5).status, "loss");
  assert.equal(settleOverUnder(6, "under", 6.5).status, "win");
  assert.equal(settleOverUnder(3, "over", 3).status, "push");     // equal = push, never loss
  assert.equal(settleOverUnder(null, "over", 6.5).status, "pending"); // missing stat = pending, never loss
  assert.equal(settleOverUnder(7, "over", null).status, "unavailable"); // no line
});

test("2 · moneyline / run line / game total grading", () => {
  assert.equal(settleMoneyline(5, 3, "home").status, "win");
  assert.equal(settleMoneyline(5, 3, "away").status, "loss");
  assert.equal(settleMoneyline(4, 4, "home").status, "pending"); // tie is not final in MLB → pending, never loss
  assert.equal(settleRunLine(5, 3, "home", -1.5).status, "win");  // margin +2 -1.5 = +0.5
  assert.equal(settleRunLine(5, 3, "away", 1.5).status, "loss");  // margin -2 +1.5 = -0.5
  assert.equal(settleRunLine(5, 4, "home", -1.5).status, "loss"); // margin +1 -1.5 = -0.5
  const g = makeGame();
  assert.equal(gradeTeamLean({ market: "totals", selection: "Over", line: 7.5 }, g).settlementStatus, "win");  // 5+3=8 > 7.5
  assert.equal(gradeTeamLean({ market: "totals", selection: "Under", line: 8.5 }, g).settlementStatus, "win"); // 8 < 8.5
  assert.equal(gradeTeamLean({ market: "totals", selection: "Over", line: 8 }, g).settlementStatus, "push");   // 8 == 8
  assert.equal(gradeTeamLean({ market: "h2h", selection: "Home Nine", line: null }, g).settlementStatus, "win");
});

test("3 · all 9 supported player-prop markets grade from box-score stats", () => {
  const g = makeGame();
  const pitcher = { gamePk: 1, playerId: 111, market: "", selection: "Over", researchEligible: true };
  const batter = { gamePk: 1, playerId: 222, market: "", selection: "Over", researchEligible: true };
  assert.equal(gradePlayerLean({ ...pitcher, market: "pitcher_strikeouts", line: 6.5 }, g).settlementStatus, "win");  // 7>6.5
  assert.equal(gradePlayerLean({ ...pitcher, market: "pitcher_outs", line: 17.5 }, g).settlementStatus, "win");       // 18>17.5
  assert.equal(gradePlayerLean({ ...pitcher, market: "pitcher_earned_runs", line: 2.5 }, g).settlementStatus, "loss"); // 2<2.5 over loses
  assert.equal(gradePlayerLean({ ...batter, market: "batter_hits", line: 1.5 }, g).settlementStatus, "win");          // 2>1.5
  assert.equal(gradePlayerLean({ ...batter, market: "batter_total_bases", line: 4.5 }, g).settlementStatus, "win");   // 5>4.5
  assert.equal(gradePlayerLean({ ...batter, market: "batter_home_runs", line: 0.5 }, g).settlementStatus, "win");     // 1>0.5
  assert.equal(gradePlayerLean({ ...batter, market: "batter_rbis", line: 2.5 }, g).settlementStatus, "win");          // 3>2.5
  assert.equal(gradePlayerLean({ ...batter, market: "batter_runs_scored", line: 1.5 }, g).settlementStatus, "loss");  // 1<1.5 over loses
  assert.equal(gradePlayerLean({ ...batter, market: "batter_hits_runs_rbis", line: 5.5 }, g).settlementStatus, "win"); // 2+1+3=6>5.5
});

test("4 · pending is NOT a loss (game not final / missing stat)", () => {
  const notFinal = makeGame({ isFinal: false, detailedState: "In Progress", homeRuns: null, awayRuns: null });
  assert.equal(gradeLean({ gamePk: 1, playerId: 111, market: "pitcher_strikeouts", selection: "Over", line: 6.5, researchEligible: true }, notFinal).settlementStatus, "pending");
  assert.equal(gradeLean({ gamePk: 1, market: "h2h", selection: "Home Nine", line: null, researchEligible: true }, notFinal).settlementStatus, "pending");
  // final game but the player has no stat block ⇒ unavailable (DNP), still never a loss
  const g = makeGame();
  const dnp = gradePlayerLean({ gamePk: 1, playerId: 999, player: "Ghost Player", market: "batter_hits", selection: "Over", line: 0.5, researchEligible: true }, g);
  assert.equal(dnp.settlementStatus, "unavailable");
});

test("5 · suspended / postponed / cancelled ⇒ not final, pending, never loss", () => {
  for (const [coded, detail] of [["D", "Postponed"], ["C", "Cancelled"], ["U", "Suspended"], ["F", "Postponed"]]) {
    const feed = { gameData: { status: { abstractGameState: coded === "F" ? "Final" : "Preview", codedGameState: coded, detailedState: detail }, teams: {} }, liveData: {} };
    const game = extractOfficialGame(feed);
    assert.equal(game.isFinal, false, `${detail} (${coded}) is not final`);
    assert.equal(game.postponedSuspended, true);
    assert.equal(gradeLean({ gamePk: 1, market: "totals", selection: "Over", line: 7.5, researchEligible: true }, game).settlementStatus, "pending");
  }
});

test("6 · playerId mismatch ⇒ ambiguous or unavailable, never a silent grade", () => {
  const g = makeGame();
  // playerId absent, name matches TWO players ⇒ ambiguous
  const amb = gradePlayerLean({ gamePk: 1, playerId: 987654, player: "Duplicate Name", market: "batter_hits", selection: "Over", line: 0.5, researchEligible: true }, g);
  assert.equal(amb.settlementStatus, "ambiguous");
  // playerId present ⇒ used first (exact id match), name ignored
  assert.equal(findPlayer({ playerId: 222, player: "Wrong Name" }, g).matchBy, "playerId");
  // playerId absent, unique name ⇒ guarded name fallback
  assert.equal(findPlayer({ playerId: null, player: "Bobby Bat" }, g).matchBy, "name-fallback");
});

test("7 · unsupported markets grade 'unsupported' and can never be settled-eligible", () => {
  const g = makeGame();
  assert.equal(gradeLean({ gamePk: 1, playerId: 222, market: "batter_walks", selection: "Over", line: 1.5, researchEligible: true }, g).settlementStatus, "unsupported");
  assert.ok(!SUPPORTED_JOIN_MARKETS.has("batter_walks"));
  // malformed line ⇒ unsupported (never a guess)
  assert.equal(gradePlayerLean({ gamePk: 1, playerId: 222, market: "batter_hits", selection: "Over", line: null, researchEligible: true }, g).settlementStatus, "unsupported");
});

test("8 · WRITTEN join files: only researchEligible win|loss are settled-eligible; nothing else is", () => {
  if (!fs.existsSync(JOIN_DIR)) { console.log("  (skip — no join files in this checkout)"); return; }
  let checked = 0;
  for (const d of fs.readdirSync(JOIN_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const f of fs.readdirSync(path.join(JOIN_DIR, d)).filter((x) => x.endsWith(".json"))) {
      const j = readJson(path.join(JOIN_DIR, d, f));
      for (const r of j.marketRows || []) {
        checked++;
        if (r.countsAsSettledEligible) {
          assert.equal(r.researchEligible, true, "settled-eligible ⇒ researchEligible");
          assert.ok(r.settlementStatus === "win" || r.settlementStatus === "loss", "settled-eligible ⇒ decisive");
        }
        if (r.settlementStatus === "pending" || r.settlementStatus === "push" || r.settlementStatus === "unavailable" || r.settlementStatus === "ambiguous" || r.settlementStatus === "unsupported") {
          assert.equal(r.countsAsSettledEligible, false, `${r.settlementStatus} is never settled-eligible`);
        }
        if (r.researchEligible !== true) assert.equal(r.countsAsSettledEligible, false, "ineligible lean is never settled-eligible");
      }
    }
  }
  console.log(`  (checked ${checked} market rows across written join files)`);
});

test("9 · official StatsAPI is the only outcome source; join records prove official provenance", () => {
  assert.match(SCRIPT, /const HOST = "https:\/\/statsapi\.mlb\.com"/, "statsapi host");
  assert.ok(!/the-odds-api|oddsapi|fanduel\.com|espn\.com/i.test(SCRIPT.replace(/bookmaker/gi, "")), "no non-official outcome source");
  const anyJoin = fs.existsSync(JOIN_DIR) && fs.readdirSync(JOIN_DIR).filter((x) => /^\d{4}/.test(x))[0];
  if (anyJoin) {
    const d = path.join(JOIN_DIR, anyJoin);
    const j = readJson(path.join(d, fs.readdirSync(d)[0]));
    assert.match(j.officialSource.source, /MLB Stats API/);
    assert.equal(j.officialSource.sourceType, "official_league");
    assert.match(j.officialSource.endpoint, /statsapi\.mlb\.com/);
  }
});

test("10 · immutable freezes/snapshots: the join writes ONLY to settlement-joins/", () => {
  const writes = [...SCRIPT.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1]);
  assert.ok(writes.length >= 1, "the join writes something");
  for (const w of writes) assert.match(w, /outDir|settlement-joins|JOIN_DIR/, `write target is the join dir, not freezes/snapshots: ${w}`);
  assert.ok(!/writeFileSync\([^)]*FREEZE_DIR|writeFileSync\([^)]*SNAP_DIR|writeFileSync\([^)]*MKT_DIR/.test(SCRIPT), "never writes into freezes/snapshots/market-snapshots");
});

test("11 · no archive/join files are web-served (out/ is clean)", () => {
  const out = path.join(app, "out");
  if (!fs.existsSync(out)) return;
  const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("settlement-joins") || String(p).includes("pregame-archive"));
  assert.equal(hit.length, 0, "no internal join/archive files under out/");
});

test("12 · workflow: join step is non-blocking, free StatsAPI, writes only the internal archive", () => {
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /join-mlb-pregame-settlements\.mjs/, "join step present");
  const step = wf.slice(wf.indexOf("Settlement join"), wf.indexOf("Coverage / gate audit"));
  assert.match(step, /continue-on-error:\s*true/, "join step is non-blocking");
  assert.ok(!/ODDS_API_KEY/.test(step), "join step uses no Odds API key (free StatsAPI only)");
  assert.match(step, /--write/, "join persists");
});

test("13 · parity: inline graders match the canonical mlb-markets.ts", () => {
  for (const [a, s, l] of [[7, "over", 6.5], [6, "over", 6.5], [3, "over", 3], [null, "over", 6.5], [5, "under", 4.5]]) {
    assert.equal(settleOverUnder(a, s, l).status, ouCanon(a, s, l).status, `OU parity ${a}/${s}/${l}`);
  }
  for (const [h, aw, sel] of [[5, 3, "home"], [3, 5, "home"], [4, 4, "away"]]) {
    assert.equal(settleMoneyline(h, aw, sel).status, settleMlbMoneyline({ homeScore: h, awayScore: aw, selectedTeam: sel, gameFinal: true }).status, `ML parity ${h}-${aw}/${sel}`);
  }
  for (const [h, aw, sel, l] of [[5, 3, "home", -1.5], [5, 3, "away", 1.5], [5, 4, "home", -1.5]]) {
    assert.equal(settleRunLine(h, aw, sel, l).status, settleMlbRunLine({ homeScore: h, awayScore: aw, selectedTeam: sel, line: l, gameFinal: true }).status, `RL parity ${h}-${aw}/${sel}/${l}`);
  }
});

test("15 · REGRESSION: lean merge keeps the LATEST capturedAt (older capture never regresses newer; idempotent)", () => {
  const existing = [{ market: "pitcher_outs", gamePk: 1, playerId: 111, selection: "Over", line: 17.5, researchEligible: true, noVigProbability: 0.55, capturedAt: "2026-07-22T04:25:00Z" }];
  // a STALE re-capture of the same key (older timestamp, different prob) must NOT override the newer carried lean
  const staleCaptured = [{ market: "pitcher_outs", gamePk: 1, playerId: 111, selection: "Over", line: 17.5, researchEligible: true, noVigProbability: 0.40, capturedAt: "2026-07-21T22:00:00Z" }];
  const merged = mergeLeanKeys(existing, staleCaptured);
  const row = [...merged.values()][0];
  assert.equal(merged.size, 1, "same key ⇒ one lean");
  assert.equal(row.capturedAt, "2026-07-22T04:25:00Z", "newer capturedAt kept");
  assert.equal(row.noVigProbability, 0.55, "newer value kept — no stale regression");
  // a genuinely FRESHER capture DOES update
  const fresher = [{ market: "pitcher_outs", gamePk: 1, playerId: 111, selection: "Over", line: 17.5, researchEligible: true, noVigProbability: 0.60, capturedAt: "2026-07-22T10:00:00Z" }];
  assert.equal([...mergeLeanKeys(existing, fresher).values()][0].noVigProbability, 0.60, "fresher capture updates");
  // re-merging existing with itself is a no-op (idempotent)
  assert.equal([...mergeLeanKeys(existing, existing).values()][0].capturedAt, existing[0].capturedAt);
});

test("14 · money md5 unchanged (settlement-join is internal + money-independent)", () => {
  assertProtectedLedgerIntact(app); // P256: history + crown fixed; bankroll = July base + Rule S fold (was a whole-file md5 pin)
});

/* ── ONE gamePk BELONGS TO ONE DATE (2026-09-25) ───────────────────────────────────────────────── */

test("16 · the official date is extracted from the feed the grader already fetches", () => {
  const feed = {
    gameData: {
      status: { abstractGameState: "Final", codedGameState: "F", detailedState: "Final" },
      datetime: { dateTime: "2026-09-23T17:35:00Z", officialDate: "2026-09-23", originalDate: "2026-09-23" },
      teams: { home: { name: "Baltimore Orioles", abbreviation: "BAL" }, away: { name: "Toronto Blue Jays", abbreviation: "TOR" } },
    },
    liveData: { linescore: { teams: { home: { runs: 4 }, away: { runs: 2 } } }, boxscore: { teams: { home: { players: {} }, away: { players: {} } } } },
  };
  const g = extractOfficialGame(feed);
  assert.equal(g.officialDate, "2026-09-23", "the day the game was played");
  assert.equal(g.officialStartTime, "2026-09-23T17:35:00Z");
  assert.equal(g.isFinal, true);

  // A feed with no datetime block must report null rather than a guess.
  const bare = extractOfficialGame({ gameData: { status: { abstractGameState: "Final", codedGameState: "F" } }, liveData: {} });
  assert.equal(bare.officialDate, null, "absent is null, never inferred");
  assert.equal(bare.officialStartTime, null);
});

test("16b · a join under a date the game was not played on is refused by the observation builder", async () => {
  /*
   * THE DEFECT. `/game/<gamePk>/feed/live` is keyed by gamePk alone and carries no date, so every date
   * directory holding a join for one gamePk grades against the same box score. gamePk 824785 (TOR @ BAL)
   * held a join under 2026-09-22 claiming a 22:35Z first pitch and another under 2026-09-23 claiming
   * 17:35Z. `officialDate` says the 23rd. The 22nd's fixture graded flawlessly anyway — 267 rows settled
   * under a day on which nothing happened, 201 of them the SAME official outcome already recorded under
   * the 23rd. `observationId` is sha(gamePk|player|market|selection|line) and carries no date, so those
   * 201 arrived as duplicate ids, the observation-quality gate refused to commit, and the pregame archive
   * stopped growing for three days.
   *
   * Pinned on the BUILDER because that is the fail-closed reader: it must refuse regardless of whether
   * the writer has re-stamped the file.
   */
  const mod = await import("../../scripts/build-mlb-research-observations.mjs");
  const src = fs.readFileSync(path.join(app, "scripts/build-mlb-research-observations.mjs"), "utf8");
  assert.ok(mod.buildObservation, "the builder still exports buildObservation");

  // The refusal must rest on TWO independent facts, so a join written before officialDate existed is
  // still caught by its own recorded date, and a superseded one by its status.
  assert.match(src, /joinStatus === "superseded"/, "a superseded join yields no observations");
  assert.match(src, /join\.officialDate != null && join\.officialDate !== date/, "and a misdated one is refused on its own recorded date");
});

test("16c · the writer marks a rescheduled fixture superseded, grades nothing, and destroys nothing", () => {
  const src = fs.readFileSync(path.join(app, "scripts/join-mlb-pregame-settlements.mjs"), "utf8");

  // superseded is its own status, not folded into unsupported — a game the schedule moved and a game we
  // cannot grade are different facts.
  assert.match(src, /joinStatus = supersededByReschedule\s*\n?\s*\? "superseded"/, "the status exists");
  assert.match(src, /game\.officialDate != null && game\.officialDate !== date/, "and is decided by the official date");

  // An unknown official date must not be a licence to grade.
  assert.match(src, /officialDateUnknown = game\.isFinal && game\.officialDate == null/);

  /*
   * AND THE ROT MUST BE REACHABLE. The 09-22 fixture was `isFinal` and `joined`, which made it terminal,
   * so every later run reused it verbatim — a fix in joinGame alone would never have touched it. Terminal
   * now requires that the date attribution was actually established.
   */
  assert.match(src, /const dateEstablished = existing\?\.officialDate != null;/);
  assert.match(src, /const terminal =[^;]*dateEstablished/s, "an unchecked record is not terminal");

  // Evidence-preserving: the superseded path must not delete or skip writing the file.
  assert.ok(!/unlinkSync|rmSync/.test(src), "a superseded fixture is kept, never deleted");
});

/**
 * The two corpus scans, as pure functions over a join root, so each can be run against the committed
 * archive AND against a fixture that is known to be defective. A scan whose only subject is healthy
 * data has not been shown to detect anything — which is the exact failure mode this whole lane is
 * about, so neither of these ships without a positive control.
 */
function scanMisdated(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const date of fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    for (const f of fs.readdirSync(path.join(root, date)).filter((x) => x.endsWith(".json"))) {
      const j = readJson(path.join(root, date, f));
      if (!j?.officialDate) continue;   // written before the field existed — the builder refuses those by status
      if (j.officialDate !== date && j.joinStatus !== "superseded") out.push(`${date}/${f}: officialDate ${j.officialDate}, joinStatus ${j.joinStatus}`);
    }
  }
  return out;
}
function scanDoubleGraded(root) {
  const gradedDates = new Map();
  if (!fs.existsSync(root)) return [];
  for (const date of fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    for (const f of fs.readdirSync(path.join(root, date)).filter((x) => x.endsWith(".json"))) {
      const j = readJson(path.join(root, date, f));
      if (!j) continue;
      // Only a join that actually produces settled rows can double-count an outcome.
      if (!(j.counts?.marketSettledEligible > 0)) continue;
      if (!gradedDates.has(j.gamePk)) gradedDates.set(j.gamePk, []);
      gradedDates.get(j.gamePk).push(date);
    }
  }
  return [...gradedDates.entries()].filter(([, ds]) => ds.length > 1).map(([pk, ds]) => `gamePk ${pk} grades under ${ds.join(" and ")}`);
}

/** The real 824785 shape: one gamePk, two dates, both grading, the feed's officialDate naming one of them. */
function writeReschedulFixture(root) {
  const mk = (date, officialDate, settled, joinStatus) => {
    fs.mkdirSync(path.join(root, date), { recursive: true });
    fs.writeFileSync(path.join(root, date, "824785.json"), JSON.stringify({
      gamePk: 824785, date, officialDate, joinStatus,
      counts: { marketSettledEligible: settled },
    }));
  };
  mk("2026-09-22", "2026-09-23", 241, "joined");   // the fixture the schedule left behind, grading anyway
  mk("2026-09-23", "2026-09-23", 252, "joined");   // the game as played
}

test("16d · every committed join sits under the date its own officialDate names", (t) => {
  // POSITIVE CONTROL FIRST: the scan must fail on the real defect before its verdict on our data means
  // anything. Written before the officialDate field existed, every committed join is currently exempt by
  // design, so without this the assertion below would be an empty set congratulating itself.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-join-"));
  try {
    writeReschedulFixture(tmp);
    const caught = scanMisdated(tmp);
    assert.equal(caught.length, 1, `the scan must catch a join filed under the wrong date, caught ${JSON.stringify(caught)}`);
    assert.match(caught[0], /2026-09-22.*officialDate 2026-09-23/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  assert.deepEqual(scanMisdated(JOIN_DIR), [], "a join graded under a date its game was not played on");
});

test("16e · one gamePk never contributes a graded join under two dates", () => {
  // POSITIVE CONTROL: the 824785 shape, which is what BLOCKED the capture for three days.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-join-"));
  try {
    writeReschedulFixture(tmp);
    const caught = scanDoubleGraded(tmp);
    assert.deepEqual(caught, ["gamePk 824785 grades under 2026-09-22 and 2026-09-23"], "the scan must catch one outcome graded twice");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // And it is a real scan of real data, not an empty directory walk.
  const graded = fs.existsSync(JOIN_DIR)
    ? fs.readdirSync(JOIN_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .flatMap((d) => fs.readdirSync(path.join(JOIN_DIR, d)).filter((x) => x.endsWith(".json")).map((f) => readJson(path.join(JOIN_DIR, d, f))))
        .filter((j) => j?.counts?.marketSettledEligible > 0).length
    : 0;
  assert.ok(graded > 100, `expected the committed archive to hold graded joins, saw ${graded}`);

  assert.deepEqual(scanDoubleGraded(JOIN_DIR), [], "one real-world game settled under two dates — its outcome enters the corpus twice");
});

test("16f · a superseded join still FITS the commit cap — a per-row reason multiplies by the rows", () => {
  /*
   * ⚠ THE REGRESSION THIS EXISTS TO STOP, WHICH WE SHIPPED ONCE.
   *
   * The first superseded implementation wrote the full explanation into every row's
   * `settlementReason`. On gamePk 824785 that is the same 95-character sentence 267 times: the file
   * went from 119,812 committed bytes to 145,619, past the 128 KiB metadata guard in
   * mlb-pregame-capture — so the ONE game the whole incident was about became the one file that could
   * not be committed, and main kept a stale `pending` verdict for a game finished two days earlier.
   * It stayed contained only because a pending join yields no observations: luck, not design.
   *
   * The invariant is the shape, not the byte count: prose belongs on the RECORD once, and a per-row
   * field carries a code. The size assertion below is the consequence, checked against the real
   * 267-row shape so it cannot pass on a toy fixture.
   */
  const MAX_FILE_BYTES = 131072;   // mlb-pregame-capture.yml
  const src = fs.readFileSync(path.join(app, "scripts/join-mlb-pregame-settlements.mjs"), "utf8");

  // The per-row reason must be a SHORT CODE. A reason containing a space is a sentence.
  const arm = /settlementStatus: "unavailable", actual: null, reason: supersededByReschedule \? "([^"]*)" : "([^"]*)"/.exec(src);
  assert.ok(arm, "the superseded/unknown-date arm still sets a per-row reason");
  for (const code of [arm[1], arm[2]]) {
    assert.ok(code.length <= 32, `a per-row reason is a code, not prose: "${code}"`);
    assert.ok(!code.includes(" "), `a per-row reason must not be a sentence: "${code}"`);
  }
  // And the human explanation must still exist, once, on the record.
  assert.match(src, /joinReason: supersededByReschedule[\s\S]{0,400}was played on/, "the record carries the sentence");

  // Against the widest real join committed, rewritten as superseded: still under the cap.
  let widest = null;
  if (fs.existsSync(JOIN_DIR)) {
    for (const date of fs.readdirSync(JOIN_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      for (const f of fs.readdirSync(path.join(JOIN_DIR, date)).filter((x) => x.endsWith(".json"))) {
        const j = readJson(path.join(JOIN_DIR, date, f));
        if (j?.marketRows?.length && (!widest || j.marketRows.length > widest.marketRows.length)) widest = j;
      }
    }
  }
  if (!widest) return;   // no committed joins in this checkout
  assert.ok(widest.marketRows.length >= 100, `expected a wide real join to test against, widest had ${widest.marketRows.length} rows`);

  const asSuperseded = JSON.parse(JSON.stringify(widest));
  asSuperseded.joinStatus = "superseded";
  asSuperseded.officialDate = "2026-09-23";
  asSuperseded.officialStartTime = "2026-09-23T17:35:00Z";
  asSuperseded.joinReason = `superseded: this game was played on 2026-09-23, not ${widest.date} — the fixture under this date is kept as pregame evidence and does not grade`;
  for (const r of asSuperseded.marketRows) {
    r.settlementStatus = "unavailable";
    r.actual = null;
    r.settlementReason = arm[1];
    r.countsAsSettledEligible = false;
  }
  const bytes = Buffer.byteLength(JSON.stringify(asSuperseded));
  assert.ok(
    bytes < MAX_FILE_BYTES,
    `a superseded ${asSuperseded.marketRows.length}-row join is ${bytes} bytes, at or over the ${MAX_FILE_BYTES}-byte commit cap — it would be silently skipped and the verdict would never reach the repository`,
  );
});
