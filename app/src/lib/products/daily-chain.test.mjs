import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * THE DAILY CHAIN, END TO END, ON THE REAL SETTLER.
 *
 * Not a re-implementation of its rules: this runs `scripts/settle-mlb-player-props.mjs` itself, in a
 * child process, against a disposable repo-shaped store. It is the script `nightly-settle` invokes,
 * so what passes here is what runs in production.
 *
 * Every fixture below carries the leg shape the generator actually writes — content-derived gameId
 * in the id, no player, no gamePk, matchup as "away @ home" — because that shape is exactly what
 * defeated settlement on 2026-09-06.
 */

const REPO = path.resolve(process.cwd(), "..");
const SCRIPT = path.join(process.cwd(), "scripts", "settle-mlb-player-props.mjs");
const DATE = "2026-09-06";

const leg = (market, selection, matchup, gid) => ({
  id: `MLB:${gid}:${market}:${selection.replace(/\s+/g, "_")}`,
  matchup, market: market === "mlb_moneyline" ? "Moneyline" : "Total Runs",
  selection, player: null, odds: -150, modelConfidence: 0.6, provider: "draftkings",
  kickoffEt: "7:00 PM ET", risk: "Lower-volatility", teamLogo: null,
});

const lane = (id, legs, stake = 100) => ({
  id, product: "bank-builder", productLabel: "Bank Builder", lane: "A",
  step: 1, clearedSteps: 0, status: "active", stake, exposure: stake,
  targetReturn: null, fitsTarget: true, combinedOdds: 124, combinedDecimal: 2.24,
  potentialReturn: stake * 2.24, legCount: legs.length, targetLegs: legs.length, legs,
  correlationNote: null, shortfallNote: null, whyThisCard: [],
  activationEligibility: { eligible: true, reason: "test" },
});

/** A repo-shaped store: an app/ with the portfolio, and the linescore cache beside it. */
function store({ lanes, linescores }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-chain-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public", "data", "mr-dub"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "internal", "mlb", "linescores"), { recursive: true });
  fs.writeFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"),
    JSON.stringify({
      date: DATE, activeBankroll: 19065.4, crownBankroll: 20465.4, openExposure: 0, availableBankroll: 0,
      // The settler rewrites this block; the real artifact always carries it.
      products: {
        bankBuilder: { exposure: 0, record: { wins: 0, losses: 0, voids: 0, pending: 0 } },
        moonshot: { exposure: 0, record: { wins: 0, losses: 0, voids: 0, pending: 0 } },
      },
      lanes,
    }, null, 2));
  fs.writeFileSync(path.join(root, "data", "internal", "mlb", "linescores", `${DATE}.json`), JSON.stringify(linescores));
  return { root, app };
}
const run = (app, extra = []) => {
  const out = execFileSync("npx", ["tsx", SCRIPT, "--date", DATE, "--app-root", app, ...extra],
    { encoding: "utf8", cwd: process.cwd(), env: { ...process.env } });
  return out;
};
const portfolio = (app) => JSON.parse(fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8"));
const final = (home, away, hr, ar) => ({ gamePk: Math.floor(Math.random() * 1e6), officialDate: DATE, homeTeam: home, awayTeam: away, homeRuns: hr, awayRuns: ar, isFinal: true, status: "Final" });

test("a WINNING card settles won and releases its exposure", () => {
  const { app } = store({
    lanes: [lane("bb-a", [
      leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1"),
      leg("mlb_total_runs", "Over 7", "Athletics @ Seattle Mariners", "g1"),
    ])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],   // home wins, 9 total
  });
  run(app, ["--apply"]);
  const dp = portfolio(app);
  assert.equal(dp.lanes[0].result, "won");
  assert.equal(dp.lanes[0].status, "won");
  assert.equal(dp.lanes[0].exposure, 0, "a settled card no longer holds exposure");
  assert.equal(dp.openExposure, 0);
});

test("ONE losing leg settles the whole card lost", () => {
  const { app } = store({
    lanes: [lane("bb-a", [
      leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1"),
      leg("mlb_total_runs", "Under 7", "Athletics @ Seattle Mariners", "g1"),   // 9 runs → loses
    ])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],
  });
  run(app, ["--apply"]);
  assert.equal(portfolio(app).lanes[0].result, "lost");
});

test("an UNFINISHED game holds the card — never a fabricated loss", () => {
  const { app } = store({
    lanes: [lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")])],
    linescores: [{ ...final("Seattle Mariners", "Athletics", 2, 1), isFinal: false, status: "In Progress" }],
  });
  run(app, ["--apply"]);
  const dp = portfolio(app);
  assert.equal(dp.lanes[0].result, "pending");
  assert.equal(dp.lanes[0].status, "active", "a pending card stays active and keeps its exposure");
  assert.equal(dp.openExposure, 100);
});

test("an ALL-PUSH card is a push, not permanent pending", () => {
  // The defect: `decisive` excludes pushes, so an all-push card fell through to "pending" for ever.
  const { app } = store({
    lanes: [lane("bb-a", [
      leg("mlb_total_runs", "Over 9", "Athletics @ Seattle Mariners", "g1"),
      leg("mlb_total_runs", "Under 9", "Athletics @ Seattle Mariners", "g1"),
    ])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],   // exactly 9
  });
  run(app, ["--apply"]);
  const dp = portfolio(app);
  assert.equal(dp.lanes[0].result, "push");
  assert.notEqual(dp.lanes[0].result, "pending");
  assert.equal(dp.lanes[0].exposure, 0, "a refunded card returns its seed");
});

test("REPLAY: settling twice does not settle twice", () => {
  const { app } = store({
    lanes: [lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],
  });
  run(app, ["--apply"]);
  const first = fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8");
  run(app, ["--apply"]);
  const second = fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8");
  const a = JSON.parse(first), b = JSON.parse(second);
  assert.equal(b.lanes[0].result, a.lanes[0].result);
  assert.equal(b.openExposure, a.openExposure, "a rerun must not move exposure");
  assert.equal(b.lanes[0].settledAt, a.lanes[0].settledAt, "a settled card must not be re-stamped");
});

test("TWO LANES settle independently and do not overwrite each other", () => {
  const a = lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")]);
  const b = { ...lane("ms-a", [leg("mlb_moneyline", "Athletics to win", "Athletics @ Seattle Mariners", "g1")], 25), product: "moonshot", productLabel: "Moonshot", lane: "B" };
  const { app } = store({ lanes: [a, b], linescores: [final("Seattle Mariners", "Athletics", 6, 3)] });
  run(app, ["--apply"]);
  const dp = portfolio(app);
  assert.equal(dp.lanes.find((l) => l.id === "bb-a").result, "won");
  assert.equal(dp.lanes.find((l) => l.id === "ms-a").result, "lost");
  assert.equal(dp.openExposure, 0);
});

test("a DOUBLEHEADER holds rather than grading against the wrong game", () => {
  const { app } = store({
    lanes: [lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3), final("Seattle Mariners", "Athletics", 1, 8)],
  });
  const out = run(app, ["--apply"]);
  assert.equal(portfolio(app).lanes[0].result, "pending");
  assert.match(out, /doubleheader/i);
});

test("a dry run decides everything and writes nothing", () => {
  const { app } = store({
    lanes: [lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],
  });
  const before = fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8");
  const out = run(app);
  assert.match(out, /WON/);
  assert.equal(fs.readFileSync(path.join(app, "public", "data", "mr-dub", "daily-portfolio.json"), "utf8"), before);
});

test("the fixture root is honoured — production is untouched", () => {
  const real = path.join(process.cwd(), "public", "data", "mr-dub", "daily-portfolio.json");
  const before = fs.readFileSync(real);
  const { app } = store({
    lanes: [lane("bb-a", [leg("mlb_moneyline", "Seattle Mariners to win", "Athletics @ Seattle Mariners", "g1")])],
    linescores: [final("Seattle Mariners", "Athletics", 6, 3)],
  });
  run(app, ["--apply"]);
  assert.ok(before.equals(fs.readFileSync(real)), "the real portfolio must be byte-identical after a fixture run");
});
