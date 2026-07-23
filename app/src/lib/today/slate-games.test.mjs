import { test } from "node:test";
import assert from "node:assert/strict";

import { slateGames, deriveAvailability } from "./slate-games.ts";

const TODAY = "2026-07-23";

/** A minimal MLB game detail on today's slate. Overrides tune the available artifacts. */
function game(over = {}) {
  return {
    sport: "mlb",
    sportLabel: "MLB",
    slug: "away-vs-home-2026-07-23",
    date: TODAY,
    homeTeam: "Home Nine",
    awayTeam: "Away Nine",
    homeLogo: "https://img/home.png",
    awayLogo: "https://img/away.png",
    gameLabSimulation: null,
    gameLabMlb: null,
    gameCenter: null,
    ...over,
  };
}

test("every game on the slate gets a working per-game action (the headline invariant)", () => {
  const details = [
    game({ slug: "a-vs-b-2026-07-23", gameLabSimulation: { status: "ready" } }),
    game({ slug: "c-vs-d-2026-07-23", gameLabMlb: { leanCount: 4 } }),
    game({ slug: "e-vs-f-2026-07-23", gameCenter: { firstPitch: "2026-07-23T23:05:00Z" } }),
    game({ slug: "g-vs-h-2026-07-23" }), // nothing yet — still must get an action
  ];
  const { games, total } = slateGames(details, TODAY);
  assert.equal(total, 4);
  // NO game is stranded: each row has a canonical report href AND a non-empty action label.
  for (const r of games) {
    assert.ok(r.href.startsWith("/games/mlb/"), `href canonical: ${r.href}`);
    assert.ok(r.actionLabel.length > 0, `action present: ${r.slug}`);
    assert.ok(r.statusLabel.length > 0, `status present: ${r.slug}`);
  }
});

test("availability tiers derive in strict honest order: simulation > model > market > report", () => {
  // A ready sim wins even when model + market also present.
  assert.equal(
    deriveAvailability(game({ gameLabSimulation: { status: "ready" }, gameLabMlb: { leanCount: 9 }, gameCenter: { firstPitch: "x" } })).availability,
    "simulation",
  );
  // Model read wins over a bare market read.
  assert.equal(deriveAvailability(game({ gameLabMlb: { leanCount: 3 }, gameCenter: { firstPitch: "x" } })).availability, "model-read");
  // Market read when only the de-vigged center exists.
  assert.equal(deriveAvailability(game({ gameCenter: { firstPitch: "x" } })).availability, "market-read");
  // Bare report when nothing is ready.
  assert.equal(deriveAvailability(game()).availability, "report");
});

test("a non-ready simulation is NOT surfaced as a simulation (fail-closed)", () => {
  for (const status of ["unavailable", "stale", "error"]) {
    const r = deriveAvailability(game({ gameLabSimulation: { status } }));
    assert.notEqual(r.availability, "simulation", `status ${status} must not read as ready`);
  }
});

test("model-read subline is a NON-PREDICTIVE count, never a specific pick", () => {
  const one = deriveAvailability(game({ gameLabMlb: { leanCount: 1 } }));
  assert.equal(one.subline, "1 model read vs market");
  const many = deriveAvailability(game({ gameLabMlb: { leanCount: 5 } }));
  assert.equal(many.subline, "5 model reads vs market");
  // no forbidden certainty/edge vocabulary leaks into the copy
  for (const r of [one, many]) {
    assert.doesNotMatch(r.subline ?? "", /\b(edge|lock|guaranteed|beat the market|profit)\b/i);
  }
});

test("only the presented slate is returned — stale days are dropped", () => {
  const details = [
    game({ slug: "today-2026-07-23", date: TODAY }),
    game({ slug: "stale-2026-07-11", date: "2026-07-11" }),
  ];
  const { games, total } = slateGames(details, TODAY);
  assert.equal(total, 1);
  assert.equal(games[0].slug, "today-2026-07-23");
});

test("both ends of a doubleheader appear, each with a distinct action", () => {
  // Same base team-pair+date, disambiguated by gamePk suffix (the game-identity fix).
  const details = [
    game({ slug: "sox-vs-jays-2026-07-23-777001", gameCenter: { firstPitch: "2026-07-23T21:07:00Z" } }),
    game({ slug: "sox-vs-jays-2026-07-23-777002", gameCenter: { firstPitch: "2026-07-24T00:37:00Z" } }),
  ];
  const { games, total } = slateGames(details, TODAY);
  assert.equal(total, 2);
  const hrefs = new Set(games.map((g) => g.href));
  assert.equal(hrefs.size, 2, "each DH game has its own distinct href");
  // Earlier first pitch sorts first.
  assert.equal(games[0].slug, "sox-vs-jays-2026-07-23-777001");
});

test("games are ordered by soonest first pitch; unknown times sort last", () => {
  const details = [
    game({ slug: "late-2026-07-23", gameCenter: { firstPitch: "2026-07-24T00:40:00Z" } }),
    game({ slug: "notime-2026-07-23" }), // no firstPitch
    game({ slug: "early-2026-07-23", gameCenter: { firstPitch: "2026-07-23T17:05:00Z" } }),
  ];
  const { games } = slateGames(details, TODAY);
  assert.deepEqual(games.map((g) => g.slug), ["early-2026-07-23", "late-2026-07-23", "notime-2026-07-23"]);
});

test("simReadyCount counts only genuine ready simulations", () => {
  const details = [
    game({ slug: "r1-2026-07-23", gameLabSimulation: { status: "ready" } }),
    game({ slug: "r2-2026-07-23", gameLabSimulation: { status: "ready" } }),
    game({ slug: "s1-2026-07-23", gameLabSimulation: { status: "stale" } }),
    game({ slug: "m1-2026-07-23", gameLabMlb: { leanCount: 2 } }),
  ];
  const { simReadyCount, total } = slateGames(details, TODAY);
  assert.equal(total, 4);
  assert.equal(simReadyCount, 2);
});

test("a game missing either team is skipped (cannot render a matchup honestly)", () => {
  const details = [
    game({ slug: "ok-2026-07-23" }),
    game({ slug: "noaway-2026-07-23", awayTeam: null }),
    game({ slug: "nohome-2026-07-23", homeTeam: "" }),
  ];
  const { games, total } = slateGames(details, TODAY);
  assert.equal(total, 1);
  assert.equal(games[0].slug, "ok-2026-07-23");
});

test("real first pitch is passed through; null when absent or non-string", () => {
  assert.equal(slateGames([game({ gameCenter: { firstPitch: "2026-07-23T23:05:00Z" } })], TODAY).games[0].firstPitchIso, "2026-07-23T23:05:00Z");
  assert.equal(slateGames([game({ gameCenter: { firstPitch: null } })], TODAY).games[0].firstPitchIso, null);
  assert.equal(slateGames([game()], TODAY).games[0].firstPitchIso, null);
});
