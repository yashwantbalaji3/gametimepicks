import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMlbTeamLegs, SETTLEABLE_TEAM_MARKETS } from "./mlb-team-legs.ts";
import { buildDailyLaneCandidates, MOONSHOT_MAX_LEGS, MOONSHOT_MIN_COMBINED_ODDS } from "../world-cup/model-qualified-picks.ts";

const NOW = "2026-09-05T15:30:00Z";
function root(games) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-mlbteam-"));
  const dir = path.join(r, "mlb", "team-markets");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "2026-09-05.json"), JSON.stringify({ bookmaker: "draftkings", games }));
  return r;
}
const game = (id, over = {}) => ({
  gameId: id, homeTeam: `Home ${id}`, awayTeam: `Away ${id}`, commenceTime: "2026-09-05T23:00:00Z",
  moneyline: { home: { odds: -150, noVigProb: 0.58 }, away: { odds: 130, noVigProb: 0.42 }, draw: null },
  total: { line: 8.5, over: { odds: 100, noVigProb: 0.47 }, under: { odds: -120, noVigProb: 0.53 } },
  runLine: { line: 1.5, home: { line: -1.5, odds: 140, coverNoVigProb: 0.41 }, away: { line: 1.5, odds: -165, coverNoVigProb: 0.59 } },
  ...over,
});

test("emits only markets the MLB product settlement can grade", () => {
  const legs = loadMlbTeamLegs(root([game("g1")]), NOW, "2026-09-05");
  assert.ok(legs.length > 0);
  for (const l of legs) assert.ok(SETTLEABLE_TEAM_MARKETS.includes(l.marketKey), `${l.marketKey} has no settlement rule`);
});

test("every leg is a TEAM leg — Bank Builder's filter depends on player being null", () => {
  const legs = loadMlbTeamLegs(root([game("g1")]), NOW, "2026-09-05");
  for (const l of legs) assert.equal(l.player, null);
});

test("the de-vigged favourite is chosen, and only one side per market", () => {
  const legs = loadMlbTeamLegs(root([game("g1")]), NOW, "2026-09-05");
  const ml = legs.filter((l) => l.marketKey === "mlb_moneyline");
  assert.equal(ml.length, 1, "offering both sides would let a card be built against itself");
  assert.match(ml[0].selection, /^Home g1 to win$/);          // 0.58 > 0.42
  assert.equal(ml[0].modelProbability, 0.58);
  const tot = legs.filter((l) => l.marketKey === "mlb_total_runs");
  assert.equal(tot[0].selection, "Under 8.5");                 // 0.53 > 0.47

  // AND the other way round. The fixture above has the home side favoured, so a loader hardcoded to
  // `ml.home` passes it — the assertion only means something when the away side is the favourite.
  const awayFav = game("g9", { moneyline: { home: { odds: 145, noVigProb: 0.40 }, away: { odds: -170, noVigProb: 0.60 }, draw: null } });
  const away = loadMlbTeamLegs(root([awayFav]), NOW, "2026-09-05").find((l) => l.marketKey === "mlb_moneyline");
  assert.equal(away.selection, "Away g9 to win");
  assert.equal(away.modelProbability, 0.6);
  assert.equal(away.team, "Away g9");
});

test("the run line reads coverNoVigProb, not noVigProb", () => {
  // This artifact names the run-line probability differently from the other two markets. Reading the
  // wrong key yields undefined → probability 0, which ranks every run line last for ever and is
  // invisible in output. The away side covers at 0.59 here.
  const rl = loadMlbTeamLegs(root([game("g1")]), NOW, "2026-09-05").find((l) => l.marketKey === "mlb_run_line");
  assert.equal(rl.modelProbability, 0.59);
  assert.ok(rl.modelProbability > 0, "a zero here means the wrong key was read");
  assert.match(rl.selection, /Away g1 \+1.5/);
});

test("no edge is claimed — the number is the market's own", () => {
  for (const l of loadMlbTeamLegs(root([game("g1")]), NOW, "2026-09-05")) assert.equal(l.edge, 0);
});

test("odds outside the lower-volatility window are dropped", () => {
  const wild = game("g2", { moneyline: { home: { odds: -900, noVigProb: 0.9 }, away: { odds: 700, noVigProb: 0.1 }, draw: null } });
  const legs = loadMlbTeamLegs(root([wild]), NOW, "2026-09-05");
  assert.equal(legs.filter((l) => l.marketKey === "mlb_moneyline").length, 0, "-900 is outside the window");
  assert.ok(legs.length > 0, "the other markets on the game still qualify");
});

test("a missing or unpriced slate is empty, not an error", () => {
  assert.deepEqual(loadMlbTeamLegs(root([]), NOW, "2026-09-05"), []);
  assert.deepEqual(loadMlbTeamLegs(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-empty-")), NOW, "2026-09-05"), []);
});

test("REGRESSION: a full slate cannot produce a lane longer than the cap", () => {
  // The loop took every game with no bound. On fifteen MLB games that yielded a 28-leg Lane A at
  // +1,420,977,392 — a $25 stake advertising $355 million. Invisible on a World Cup slate of four.
  const legs = loadMlbTeamLegs(root(Array.from({ length: 15 }, (_, i) => game(`g${i}`))), NOW, "2026-09-05");
  assert.equal(legs.length, 45, "15 games x 3 markets");
  const { moonshotA, moonshotB } = buildDailyLaneCandidates(legs, "2026-09-05");
  for (const lane of [moonshotA, moonshotB]) {
    assert.ok(lane.legCount <= MOONSHOT_MAX_LEGS, `lane ran to ${lane.legCount} legs`);
    // The unbounded builder quoted +1,420,977,392 and +780,461,779,727 on this very slate.
    assert.ok(lane.combinedOdds < 100000, `combined price +${lane.combinedOdds} is not a real quote`);
    assert.ok(lane.potentialReturn < 100000, `$25 returning $${lane.potentialReturn} is not a real card`);
  }
  // And the lanes remain TIERS: B draws from the same games as A, never a different ranking.
  const gamesA = new Set(moonshotA.legs.map((l) => l.gameId));
  for (const l of moonshotB.legs) assert.ok(gamesA.has(l.gameId), `Lane B used game ${l.gameId}, which Lane A did not`);
});

test("structured pairs are added whole — never half a result-and-total structure", () => {
  const legs = loadMlbTeamLegs(root(Array.from({ length: 15 }, (_, i) => game(`g${i}`))), NOW, "2026-09-05");
  const { moonshotA } = buildDailyLaneCandidates(legs, "2026-09-05");
  const byGame = new Map();
  for (const l of moonshotA.legs) byGame.set(l.gameId, (byGame.get(l.gameId) ?? 0) + 1);
  for (const [g, n] of byGame) assert.equal(n, 2, `game ${g} contributed ${n} legs, not a whole pair`);
});

test("the +700 floor still decides — the cap does not smuggle a short card through", () => {
  const legs = loadMlbTeamLegs(root(Array.from({ length: 15 }, (_, i) => game(`g${i}`))), NOW, "2026-09-05");
  const { moonshotA } = buildDailyLaneCandidates(legs, "2026-09-05");
  assert.ok(moonshotA.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS,
    `a qualifying Moonshot lane must clear +${MOONSHOT_MIN_COMBINED_ODDS}, got +${moonshotA.combinedOdds}`);
});

test("a close MLB game still contributes its moneyline", () => {
  // The draw-lean branch prefers a draw-protected result under 55%. MLB has no such market, and the
  // existing `?? ml` fallback covers it — asserted here so a future edit to that chain is caught.
  const close = game("g3", { moneyline: { home: { odds: 105, noVigProb: 0.49 }, away: { odds: -115, noVigProb: 0.51 }, draw: null } });
  const { moonshotA } = buildDailyLaneCandidates(loadMlbTeamLegs(root([close]), NOW, "2026-09-05"), "2026-09-05");
  assert.ok(moonshotA.legs.some((l) => l.marketKey === "mlb_moneyline"), "a close MLB game must still contribute its moneyline");
});
