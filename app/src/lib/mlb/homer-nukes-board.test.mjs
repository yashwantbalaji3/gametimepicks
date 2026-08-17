/**
 * HOMER NUKES guards — the model's home-run board.
 *
 * The board is a PREDICTION product: it publishes a probability the model computed, with no market
 * price fetched and no comparison claimed. These pin the properties that keep it honest, and the
 * two /mlb truth repairs that shipped alongside it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/mlb/homer-nukes");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const boards = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : []);

test("every published board carries probabilities that are real probabilities", () => {
  for (const f of boards()) {
    const b = read(path.join(DIR, f));
    assert.ok(b.picks.length > 0, `${f} publishes at least one pick`);
    for (const p of b.picks) {
      assert.ok(p.probability > 0 && p.probability < 1, `${p.player}: ${p.probability} is a probability`);
      // A home run is a rare event. Anything at or above half would mean the model has decided a
      // batter is more likely than not to go deep, which no plate-appearance rate can support —
      // the ceiling is 1-(1-λ)^~4.2 and λ tops out in the single digits.
      assert.ok(p.probability < 0.5, `${p.player}: ${(p.probability * 100).toFixed(1)}% is not a credible single-game home-run chance`);
    }
  }
});

test("picks are ranked, and the reasoning names the numbers behind each one", () => {
  for (const f of boards()) {
    const b = read(path.join(DIR, f));
    const probs = b.picks.map((p) => p.probability);
    assert.deepEqual(probs, [...probs].sort((a, z) => z - a), `${f} is ordered by probability`);
    for (const p of b.picks) {
      // The reason must be checkable, not an adjective: it cites the season line and the league rate.
      assert.match(p.reason, /\d+ HR in \d+ plate appearances/, `${p.player}: reason cites the season line`);
      assert.match(p.reason, /league \d/, `${p.player}: reason cites the league baseline`);
      assert.ok(p.seasonPa >= b.model.minimumPa, `${p.player}: cleared the minimum sample to be ranked`);
    }
  }
});

test("rates are regressed, so a small hot sample cannot top the board", () => {
  for (const f of boards()) {
    const b = read(path.join(DIR, f));
    for (const p of b.picks) {
      // Shrinkage pulls every observed rate toward the league mean. A batter above league rate must
      // therefore come out BELOW his raw rate; the reverse for one below it. Without this the board
      // would be a list of whoever got hot for a fortnight.
      const raw = p.seasonRate;
      const league = b.model.leagueHrPerPa;
      // adjustedRate also carries the pitcher multiplier, so compare the batter half only.
      const batterOnly = p.adjustedRate / (p.pitcherMultiplier || 1);
      if (raw > league) assert.ok(batterOnly < raw + 1e-9, `${p.player}: ${batterOnly} regressed down from ${raw}`);
      if (raw < league) assert.ok(batterOnly > raw - 1e-9, `${p.player}: ${batterOnly} regressed up from ${raw}`);
    }
  }
});

test("the board claims no edge — it fetches no market price and compares to none", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/mlb/build-homer-nukes.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /odds|americanOdds|impliedProb|the-odds-api/i, "no market price is fetched or attached");
  for (const f of boards()) {
    const b = read(path.join(DIR, f));
    const blob = JSON.stringify(b);
    for (const banned of ["edgePct", "americanOdds", "impliedProbability"]) {
      assert.doesNotMatch(blob, new RegExp(`"${banned}"`), `a prediction board carries no "${banned}"`);
    }
    assert.match(b.model.honestLimit, /no claim to beat|makes no claim/i, "the artifact states it claims no edge");
    assert.ok(b.model.notModelled.length >= 3, "the artifact lists what it does not model");
  }
});

test("a board built for another slate is never served as today's", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/mlb/homer-nukes-board.ts"), "utf8");
  assert.match(src, /raw\.date !== date/, "the reader fails closed on the date");
});

// ── The two /mlb truth repairs that shipped with this board ──────────────────────────────────────

test("the market outlook cannot render prices from another day", () => {
  // It had no date gate at all, so a 2026-06-10 artifact rendered under "Implied by CURRENT
  // sportsbook prices" for two months — thirteen June games above an eleven-game August slate.
  const src = fs.readFileSync(path.join(APP, "src/components/game-outlook-card.tsx"), "utf8");
  assert.match(src, /outlook\.date !== slateDate/, "the section compares its artifact date to the slate");
  const page = fs.readFileSync(path.join(APP, "src/app/mlb/page.tsx"), "utf8");
  assert.match(page, /<GameOutlookSection[^>]*slateDate=/, "/mlb passes the slate date so the gate can fire");
});

test("the upcoming strip reads the schedule source that actually names its teams", () => {
  // It read `homeTeamAbbr` from the odds-events artifact, whose games carry `home`/`away` full
  // names — so every tile said "? @ ?" — and that feed only lists games with odds posted, so it
  // showed 9 where the board showed 11.
  const page = fs.readFileSync(path.join(APP, "src/app/mlb/page.tsx"), "utf8");
  const fn = page.slice(page.indexOf("function buildMlbUpcomingDays"));
  assert.match(fn, /getMlbPowerForDate/, "the strip reads the StatsAPI-derived slate");
  assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\//g, ""), /getMlbScheduleForDate/, "and not the odds-events feed");
  assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\//g, ""), /\?\s*\}\s*@|"\?"/, "no '?' placeholder is ever rendered as a matchup");
});
