/**
 * Public forecasts for an accepted soccer league (P257). A league publishes only after its preregistered
 * backtest accepted it; every row must reconcile to the league's own history; the page reads only the
 * public file; and what the page discloses about the model is the backtest report's own numbers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SOCCER_LEAGUES } from "./leagues.mjs";
import { ROUTE_TABLE } from "../../audits/route-inventory.mjs";

const APP = process.cwd();
const REPO = path.join(APP, "..");
const accepted = SOCCER_LEAGUES.filter((l) => l.stage === "ACCEPTED_V1");
const artifact = (k) => { try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer", k, "forecasts/latest.json"), "utf8")); } catch { return null; } };

test("a league the backtest rejected is refused and writes nothing", () => {
  const r = spawnSync(process.execPath, ["scripts/soccer/build-league-forecasts.mjs", "--league", "laliga", "--now", "2026-09-11T15:00:00Z"], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, 3, r.stderr || r.stdout);
  assert.match(r.stderr, /REFUSED: LaLiga is REJECTED_V1/);
  assert.ok(!fs.existsSync(path.join(APP, "public/data/soccer/laliga/forecasts")), "no forecast file for a rejected league");
});

test("every accepted league has its page, its route entry, and its forecasts in the daily workflow", () => {
  assert.ok(accepted.length >= 1);
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/soccer-leagues.yml"), "utf8");
  assert.match(wf, /build-league-forecasts\.mjs --league "\$k"/);
  assert.match(wf, /git add [^\n]*app\/public\/data\/soccer\//, "the forecasts are committed, not dropped");
  for (const l of accepted) {
    assert.ok(fs.existsSync(path.join(APP, "src/app/soccer", l.key, "page.tsx")), `${l.key}: page exists`);
    assert.equal(ROUTE_TABLE[`/soccer/${l.key}`]?.classification, "public", `${l.key}: route owned and public`);
  }
});

test("every published row reconciles to the league's own history and the model", () => {
  for (const l of accepted) {
    const a = artifact(l.key);
    if (!a) continue;
    const corpus = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/soccer", l.key, "corpus-football-data-v1.json"), "utf8"));
    const clubs = new Set(corpus.rows.flatMap((r) => [r.home, r.away]));
    const ids = new Set();
    for (const r of a.rows) {
      assert.ok(!ids.has(r.eventId), `${r.eventId}: duplicated`); ids.add(r.eventId);
      const s = r.probs.home + r.probs.draw + r.probs.away;
      assert.ok(Math.abs(s - 1) < 1e-4, `${r.matchup}: probabilities sum to ${s}`);
      assert.ok(clubs.has(r.historyNames.home) && clubs.has(r.historyNames.away), `${r.matchup}: both clubs exist in the league history`);
      assert.ok(Date.parse(r.kickoffUtc) > Date.parse(a.generatedAt), `${r.matchup}: forecast before kickoff, never after`);
      assert.equal(r.modelOnly, true);
    }
  }
});

test("what the page discloses is the backtest report's own numbers — and never a claim over the market", () => {
  for (const l of accepted) {
    const a = artifact(l.key);
    if (!a) continue;
    const rep = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/soccer", l.key, "reports/walk-forward-v1.json"), "utf8"));
    assert.equal(a.validation.verdict, "ACCEPTED_FOR_MODEL_ONLY_FORECASTS");
    assert.equal(a.validation.holdout.logLoss, rep.scores.poisson.bySeason["2025-26"].logLoss);
    assert.equal(a.validation.limitations.closingMarketBetterBy, rep.reportedNotGating.poissonMinusMarket);
    assert.equal(a.validation.limitations.eloBetterBy, rep.reportedNotGating.poissonMinusElo);
    const text = JSON.stringify(a);
    assert.match(text, /not betting advice/);
    assert.ok(!/\bbeat\b|\bedge\b|\block\b|guarantee/i.test(text), "no advantage language anywhere in the public file");
    assert.ok(!/data\/internal/.test(text), "no internal path in a public file");
  }
});

test("the page reads only the public artifact", () => {
  const view = fs.readFileSync(path.join(APP, "src/lib/sports/soccer/forecast-view.ts"), "utf8");
  const page = fs.readFileSync(path.join(APP, "src/components/soccer/league-forecast-page.tsx"), "utf8");
  assert.match(view, /"public", "data", "soccer"/);
  /* Paths, not words: the disclosure legitimately says "for research and entertainment". */
  const code = (view + page).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/data\/internal|["'\/]research\//.test(code), "no research path is read from a public page");
});
