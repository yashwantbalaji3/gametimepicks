/**
 * SLATE SIMULATION STORY GUARDS (Sprint 015 · Phase 2).
 *
 * The /today headlines are SUPERLATIVES over the canonical prediction objects. These tests pin that they
 * only ever rank — they never compute a probability, never invent a game, and never fill a gap:
 *   1. each category picks the genuinely extreme game, by the canonical field it claims to read,
 *   2. a game missing that field is excluded from THAT category rather than given a stand-in,
 *   3. a comparative superlative needs something to compare against (single-game slates omit the pair),
 *   4. the headline's number equals the number on the game it points at — checked against the REAL slate,
 *      so /today can never disagree with the report it links to.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/slate-stories.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSlateStories, MIN_GAMES_FOR_COMPARISON } from "./slate.ts";

const BANNED = ["edge", "value", "lock", "profitable", "guaranteed", "best bet"];

const game = (slug, { winner, prob, median, players = [], status = "ready", runs = 10000 } = {}) => ({
  gamePk: slug.length,
  slug,
  href: `/games/mlb/${slug}/`,
  awayTeam: slug.slice(0, 3).toUpperCase(),
  homeTeam: slug.slice(-3).toUpperCase(),
  awayTeamName: slug,
  homeTeamName: slug,
  awayLogo: null,
  homeLogo: null,
  firstPitchIso: "2026-07-24T20:00:00Z",
  simulationCount: runs,
  playerPredictions: players,
  prediction: {
    status,
    moneyline: prob == null ? null : { team: winner, simulationProbability: prob },
    total: median == null ? null : { simulationMedian: median },
    topPlayerPredictions: players,
  },
});

const player = (name, p, extra = {}) => ({
  player: name,
  team: "SF",
  opponent: "LAA",
  marketLabel: "Strikeouts",
  pick: "UNDER",
  line: 5.5,
  simulationProbability: p,
  playerId: 657277,
  ...extra,
});

const SLATE = [
  game("laa-vs-sf", { winner: "SF", prob: 0.58, median: 8, players: [player("Logan Webb", 0.84)] }),
  game("sea-vs-tex", { winner: "TEX", prob: 0.69, median: 7, players: [player("Bryan Woo", 0.71)] }),
  game("chc-vs-pit", { winner: "PIT", prob: 0.53, median: 9, players: [player("Michael Busch", 0.66)] }),
];

test("each category picks the genuinely extreme game by its stated field", () => {
  const by = Object.fromEntries(buildSlateStories(SLATE).map((s) => [s.kind, s]));
  assert.equal(by["most-decisive"].slug, "sea-vs-tex", "0.69 is the highest winner probability");
  assert.equal(by["most-decisive"].headline, "TEX wins 69% of simulations");
  assert.equal(by["closest"].slug, "chc-vs-pit", "0.53 is the lowest");
  assert.equal(by["closest"].headline, "PIT wins 53% of simulations");
  assert.equal(by["highest-scoring"].slug, "chc-vs-pit", "9 is the highest median total");
  assert.equal(by["highest-scoring"].headline, "9 total runs in the median simulation");
  assert.equal(by["biggest-player-impact"].headline, "Logan Webb UNDER 5.5 Strikeouts", "0.84 is the slate max");
});

test("frequency is the probability × that game's OWN run count", () => {
  const by = Object.fromEntries(buildSlateStories(SLATE).map((s) => [s.kind, s]));
  assert.equal(by["most-decisive"].detail, "6,900 / 10,000 simulations");
  assert.equal(by["biggest-player-impact"].detail, "8,400 / 10,000 simulations");
  // A game with an unknown run count states the answer WITHOUT a fabricated denominator.
  const noCount = SLATE.map((g) => ({ ...g, simulationCount: null }));
  for (const s of buildSlateStories(noCount)) assert.equal(s.detail, null, `${s.kind} must not invent a count`);
});

test("a game missing the needed field is excluded from THAT category only", () => {
  const withBare = [...SLATE, game("bare-vs-bare", {})];
  const kinds = buildSlateStories(withBare).map((s) => s.kind);
  assert.deepEqual(new Set(kinds).size, kinds.length, "no duplicate categories");
  for (const s of buildSlateStories(withBare)) {
    assert.notEqual(s.slug, "bare-vs-bare", `${s.kind} must not select the game with no values`);
  }
  // No game carries a total → the scoring story is absent, not zero-filled.
  const noTotals = SLATE.map((g) => ({ ...g, prediction: { ...g.prediction, total: null } }));
  assert.ok(!buildSlateStories(noTotals).some((s) => s.kind === "highest-scoring"));
});

test("unavailable games never become a headline", () => {
  const out = buildSlateStories([
    game("aaa-vs-bbb", { winner: "BBB", prob: 0.99, median: 20, status: "unavailable" }),
    ...SLATE,
  ]);
  for (const s of out) assert.notEqual(s.slug, "aaa-vs-bbb", `${s.kind} picked an unavailable game`);
});

test("a comparative superlative needs something to compare against", () => {
  const single = buildSlateStories([SLATE[0]]);
  assert.ok(MIN_GAMES_FOR_COMPARISON === 2);
  assert.ok(!single.some((s) => s.kind === "most-decisive"), "one game is not the 'most decisive' of anything");
  assert.ok(!single.some((s) => s.kind === "closest"));
  assert.ok(!single.some((s) => s.kind === "highest-scoring"));
  // The player story is NOT comparative — it is the slate maximum, valid at n=1.
  assert.ok(single.some((s) => s.kind === "biggest-player-impact"));
  assert.deepEqual(buildSlateStories([]), []);
});

test("the player story carries portrait + team + opponent context", () => {
  const s = buildSlateStories(SLATE).find((x) => x.kind === "biggest-player-impact");
  assert.deepEqual(s.player, { name: "Logan Webb", playerId: 657277, team: "SF", opponent: "LAA" });
  // A player with no joined id still tells the story — it just falls back to initials downstream.
  const noId = [game("a-vs-b", { winner: "B", prob: 0.6, players: [player("No Id", 0.9, { playerId: undefined, opponent: undefined })] })];
  const bare = buildSlateStories(noId).find((x) => x.kind === "biggest-player-impact");
  assert.equal(bare.player.playerId, null);
  assert.equal(bare.player.opponent, null);
});

test("deterministic — same slate, same stories; ties break on slug", () => {
  assert.deepEqual(buildSlateStories(SLATE), buildSlateStories(SLATE));
  const tied = [game("z-vs-z", { winner: "Z", prob: 0.6, median: 8 }), game("a-vs-a", { winner: "A", prob: 0.6, median: 8 })];
  const out = buildSlateStories(tied);
  assert.equal(out.find((s) => s.kind === "most-decisive").slug, "a-vs-a", "tie → lowest slug");
});

test("real slate: every headline number matches the game it points at, and no banned copy", () => {
  const dir = path.join(process.cwd(), "public", "data", "mlb", "predictions");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  assert.ok(files.length > 0, "there is a shipped predictions artifact to check");
  let checked = 0;

  for (const f of files) {
    const artifact = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const games = (artifact.predictions ?? []).map((p) => ({
      gamePk: p.gamePk,
      slug: p.slug,
      href: `/games/mlb/${p.slug}/`,
      awayTeam: p.awayTeam,
      homeTeam: p.homeTeam,
      awayTeamName: p.awayTeamName,
      homeTeamName: p.homeTeamName,
      awayLogo: null,
      homeLogo: null,
      firstPitchIso: null,
      simulationCount: 10000,
      playerPredictions: p.topPlayerPredictions ?? [],
      prediction: p,
    }));
    if (games.length === 0) continue;

    for (const s of buildSlateStories(games)) {
      /*
       * P224: JOIN ON gamePk, NOT SLUG. A doubleheader shares a team-pair + date, and the full-game
       * board adapter used to publish that colliding base as the slug (fixed in
       * lib/mlb/public-game-slug.ts — the same rule the public route uses). Historical artifacts
       * still carry the collision: 2026-08-29 has seventeen rows over fifteen slugs. Looking a story
       * up by slug therefore returned WHICHEVER TWIN CAME FIRST — here, one with `moneyline: null`,
       * which is why this read as a crash rather than a mismatch. The story carries the gamePk; it
       * is the identity, so use it.
       */
      const src = games.find((g) => g.gamePk === s.gamePk);
      assert.ok(src, `${f}: story points at a game that is not on the slate`);

      if (s.kind === "most-decisive" || s.kind === "closest") {
        const pct = Math.round(src.prediction.moneyline.simulationProbability * 100);
        assert.ok(s.headline.includes(`${pct}%`), `${f} ${s.kind}: headline must quote the game's own probability`);
        assert.ok(s.headline.startsWith(src.prediction.moneyline.team), `${f} ${s.kind}: wrong team named`);
      }
      if (s.kind === "highest-scoring") {
        assert.ok(s.headline.startsWith(String(src.prediction.total.simulationMedian)));
      }
      for (const w of BANNED) {
        assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(`${s.label} ${s.headline} ${s.detail ?? ""}`),
          `${f} ${s.kind}: banned word "${w}"`);
      }
      checked += 1;
    }

    // The superlatives must actually be extreme across the whole slate.
    const stories = buildSlateStories(games);
    const decisive = stories.find((s) => s.kind === "most-decisive");
    if (decisive) {
      const max = Math.max(...games.filter((g) => g.prediction.moneyline).map((g) => g.prediction.moneyline.simulationProbability));
      const picked = games.find((g) => g.slug === decisive.slug).prediction.moneyline.simulationProbability;
      assert.equal(picked, max, `${f}: 'most decisive' is not the slate maximum`);
    }
  }
  assert.ok(checked > 0, "exercised at least one real story");
});
