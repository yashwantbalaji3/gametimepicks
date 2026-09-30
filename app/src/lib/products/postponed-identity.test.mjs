/**
 * F3 (Session 1B, 2026-09-30) · POSTPONED-EVENT IDENTITY AND RECEIPT IDENTITY — on the REAL settler.
 *
 * Founder direction: a leg on a game that is later postponed is graded on the makeup ONLY when the makeup
 * is provably the same canonical event (the same gamePk). Never guess among games by teams + date. New
 * receipts store the strongest identity they have (gamePk, the provider's eventId, the original startUtc);
 * legacy receipts without it stay valid and are resolved when provable.
 *
 * Runs scripts/settle-mlb-player-props.mjs itself against disposable repo-shaped stores (the same seam as
 * daily-chain.test.mjs).
 *
 * Run: npx tsx --test src/lib/products/postponed-identity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findLinescore, resolveLegGameIdentity } from "./mlb-team-market-grading.mjs";

const SCRIPT = path.join(process.cwd(), "scripts", "settle-mlb-player-props.mjs");
const DATE = "2031-07-14";
const NEXT = "2031-07-15";
const AWAY = "Toronto Blue Jays", HOME = "Baltimore Orioles", MATCHUP = `${AWAY} @ ${HOME}`;

const teamLeg = (selection, extra = {}) => ({
  id: `MLB:ev1:mlb_total_runs:${selection.replace(/\s+/g, "_")}`, matchup: MATCHUP, market: "Total Runs", marketKey: "mlb_total_runs",
  selection, player: null, odds: -110, provider: "draftkings", eventId: "ev1", startUtc: `${DATE}T23:05:00Z`, ...extra,
});
const lane = (legs, product = "moonshot", id = "A") => ({
  id: `${product}-${id}`, product, productLabel: product === "moonshot" ? "Moonshot" : "Bank Builder", lane: id, step: 1, clearedSteps: 0,
  status: "active", stake: 25, exposure: 25, potentialReturn: 100, legCount: legs.length, targetLegs: legs.length, legs,
});
const row = (o) => ({ gamePk: 777001, officialDate: DATE, homeTeam: HOME, awayTeam: AWAY, homeRuns: 4, awayRuns: 2, isFinal: true, status: "Final", ...o });

function store({ lanes, linescores = {}, dpDate = DATE, receipt = null }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-f3-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public", "data", "mr-dub", "settled"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "internal", "mlb", "linescores"), { recursive: true });
  fs.writeFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), JSON.stringify({
    date: dpDate, activeBankroll: 1000, crownBankroll: 1000, openExposure: 0, availableBankroll: 0,
    products: { bankBuilder: { exposure: 0, record: { wins: 0, losses: 0, voids: 0, pending: 0 } }, moonshot: { exposure: 0, record: { wins: 0, losses: 0, voids: 0, pending: 0 } } },
    lanes,
  }, null, 2));
  for (const [d, rows] of Object.entries(linescores)) fs.writeFileSync(path.join(root, "data", "internal", "mlb", "linescores", `${d}.json`), JSON.stringify({ date: d, games: rows }));
  if (receipt) fs.writeFileSync(path.join(app, "public", "data", "mr-dub", "settled", `${DATE}.json`), JSON.stringify(receipt, null, 1));
  return { root, app };
}
const run = (app, extra = []) => execFileSync("npx", ["tsx", SCRIPT, "--date", DATE, "--app-root", app, ...extra], { encoding: "utf8", cwd: process.cwd() });
const receiptOf = (app) => JSON.parse(fs.readFileSync(path.join(app, "public", "data", "mr-dub", "settled", `${DATE}.json`), "utf8"));
const portfolioOf = (app) => JSON.parse(fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8"));

test("NORMAL · a single game settles as before, and the new receipt stores gamePk + eventId + startUtc", () => {
  const { app } = store({ lanes: [lane([teamLeg("Over 7")])], linescores: { [DATE]: [row({})] } });
  run(app, ["--apply"]);
  assert.equal(portfolioOf(app).lanes[0].result, "lost", "6 runs, Over 7 loses");
  const leg = receiptOf(app).lanes[0].legs[0];
  assert.equal(leg.gamePk, 777001);
  assert.equal(leg.eventId, "ev1");
  assert.equal(leg.startUtc, `${DATE}T23:05:00Z`);
  assert.equal(leg.result, "lost");
});

test("POSTPONED · the proven gamePk's makeup final on a later date grades the leg", () => {
  const leg = teamLeg("Over 7", { gamePk: 777001 });   // identity proven (a receipt-era leg)
  const { app } = store({
    lanes: [lane([leg])],
    linescores: {
      [DATE]: [row({ isFinal: false, status: "Postponed", homeRuns: null, awayRuns: null })],
      [NEXT]: [row({ officialDate: NEXT, homeRuns: 5, awayRuns: 4 })],   // makeup: 9 runs
    },
  });
  const out = run(app, ["--apply"]);
  assert.match(out, /Over 7 .*→ 9 WON/);
  const dp = portfolioOf(app);
  assert.equal(dp.lanes[0].result, "won");
  assert.equal(dp.lanes[0].legs[0].settlement.makeupOf, DATE);
  assert.equal(dp.lanes[0].legs[0].settlement.makeupDate, NEXT);
});

test("POSTPONED · a makeup that names other teams, or two later finals, holds the leg", () => {
  const leg = teamLeg("Over 7", { gamePk: 777001 });
  const stub = row({ isFinal: false, status: "Postponed", homeRuns: null, awayRuns: null });
  const a = store({ lanes: [lane([leg])], linescores: { [DATE]: [stub], [NEXT]: [row({ officialDate: NEXT, homeTeam: "New York Yankees" })] } });
  run(a.app, ["--apply"]);
  assert.equal(portfolioOf(a.app).lanes[0].result, "pending");
  const b = store({ lanes: [lane([leg])], linescores: { [DATE]: [stub], [NEXT]: [row({ officialDate: NEXT })], "2031-07-16": [row({ officialDate: "2031-07-16" })] } });
  run(b.app, ["--apply"]);
  assert.equal(portfolioOf(b.app).lanes[0].result, "pending");
  const c = store({ lanes: [lane([leg])], linescores: { [DATE]: [stub], [NEXT]: [row({ officialDate: NEXT, gamePk: 999999 })] } });
  run(c.app, ["--apply"]);
  assert.equal(portfolioOf(c.app).lanes[0].result, "pending", "the same teams under ANOTHER gamePk is a different game, not the makeup");
});

test("POSTPONED · with no proven gamePk a later final of the same TEAMS is never used", () => {
  // No gamePk on the leg, no slate artifacts: the legacy teams+date join. The makeup row is by teams only.
  const { app } = store({
    lanes: [lane([teamLeg("Over 7")])],
    linescores: { [DATE]: [], [NEXT]: [row({ officialDate: NEXT, homeRuns: 5, awayRuns: 4 })] },
  });
  run(app, ["--apply"]);
  assert.equal(portfolioOf(app).lanes[0].result, "pending", "teams + a later date is not an identity");
});

test("DOUBLEHEADER · each game maps uniquely by gamePk; an unproven DH leg stays pending and stores no gamePk", () => {
  const g1 = row({ gamePk: 824785, homeRuns: 4, awayRuns: 2 });      // 6 runs
  const g2 = row({ gamePk: 824784, homeRuns: 6, awayRuns: 5 });      // 11 runs
  for (const [pk, want] of [[824785, "lost"], [824784, "won"]]) {
    const { app } = store({ lanes: [lane([teamLeg("Over 7", { gamePk: pk })])], linescores: { [DATE]: [g1, g2] } });
    run(app, ["--apply"]);
    assert.equal(portfolioOf(app).lanes[0].result, want, `gamePk ${pk}`);
    assert.equal(receiptOf(app).lanes[0].legs[0].gamePk, pk);
  }
  const { app } = store({ lanes: [lane([teamLeg("Over 7")])], linescores: { [DATE]: [g1, g2] } });
  run(app, ["--apply"]);
  assert.equal(portfolioOf(app).lanes[0].result, "pending", "two games, no proof → held, not guessed");
  assert.equal(receiptOf(app).lanes[0].legs[0].gamePk, undefined, "an unproven leg records no gamePk");
});

test("LEGACY · a receipt written before identity existed is not 'different' for lacking it — left untouched", () => {
  const { app } = store({ lanes: [lane([teamLeg("Over 7")])], linescores: { [DATE]: [row({})] } });
  run(app, ["--apply"]);
  const withId = receiptOf(app);
  const legacy = { ...withId, lanes: withId.lanes.map((l) => ({ ...l, legs: l.legs.map(({ gamePk, eventId, startUtc, ...rest }) => rest) })) };
  const p = path.join(app, "public", "data", "mr-dub", "settled", `${DATE}.json`);
  fs.writeFileSync(p, JSON.stringify(legacy, null, 1) + "\n");
  const before = fs.readFileSync(p, "utf8");
  const out = run(app, ["--apply"]);
  assert.match(out, /already recorded and identical — left untouched/);
  assert.doesNotMatch(out, /REFUSED/);
  assert.equal(fs.readFileSync(p, "utf8"), before, "the legacy receipt is not rewritten to add identity");
});

test("LEGACY · a changed OUTCOME is still refused even though identity fields are ignored", () => {
  const { app } = store({ lanes: [lane([teamLeg("Over 7")])], linescores: { [DATE]: [row({})] } });
  run(app, ["--apply"]);
  const p = path.join(app, "public", "data", "mr-dub", "settled", `${DATE}.json`);
  const r = receiptOf(app); r.lanes[0].legs[0].result = "won"; r.lanes[0].result = "won";
  fs.writeFileSync(p, JSON.stringify(r, null, 1) + "\n");
  assert.throws(() => run(app, ["--apply"]), /REFUSED|Command failed/);
});

test("CATCH-UP · a receipt leg's stored gamePk is used directly after the portfolio has rolled", () => {
  const receipt = {
    date: DATE, settledAt: `${DATE}T08:00:00Z`, source: "test",
    lanes: [{ product: "moonshot", lane: "A", step: 1, stake: 25, status: "active", result: "pending", potentialReturn: 100,
      legs: [{ id: "MLB:ev1:mlb_total_runs:Over_7", matchup: MATCHUP, selection: "Over 7", player: null, market: "Total Runs", line: 7, official: null, result: "pending", gamePk: 824784 }] }],
    record: { wins: 0, losses: 0, pending: 1 },
  };
  const { app } = store({ lanes: [], dpDate: NEXT, receipt,
    linescores: { [DATE]: [row({ gamePk: 824785, homeRuns: 4, awayRuns: 2 }), row({ gamePk: 824784, homeRuns: 6, awayRuns: 5 })] } });
  run(app, ["--apply"]);
  assert.equal(receiptOf(app).lanes[0].result, "won", "the doubleheader's game 2 (11 runs), by its stored gamePk");
});

test("RESOLVER · a stored gamePk wins; a non-integer one is ignored and the slate proof applies", () => {
  assert.deepEqual(resolveLegGameIdentity({ gamePk: 824785, matchup: MATCHUP }, null), { gamePk: 824785, resolved: true, method: "receipt-gamePk", doubleheader: false });
  assert.equal(resolveLegGameIdentity({ gamePk: "abc", matchup: MATCHUP }, null), undefined, "no stored identity and no slate artifacts → the legacy join");
  const r = findLinescore({ matchup: MATCHUP }, [row({ isFinal: false, status: "Postponed" })], DATE, { gamePk: 777001, resolved: true }, { makeup: [row({ officialDate: "2031-07-13" })] });
  assert.equal(r.ok, true); assert.equal(r.line.isFinal, false, "an EARLIER final is never a makeup; the stub holds (the grader keeps it pending)");
});
