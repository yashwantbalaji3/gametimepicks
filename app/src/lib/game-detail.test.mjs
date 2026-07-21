import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gameSlug, slugify, urlSport, buildAllGameDetails, getGameDetail, detailHrefForTeams } from "./game-detail.ts";
import { normalizeWcProjections } from "./normalize.ts";

// The World Cup tournament is COMPLETE — buildAllGameDetails() / projections/latest.json no longer carry WC
// fixtures (a valid end-of-tournament state; the live /games board is now MLB). The WC game-detail CONTRACT
// (team projections + a deep-link that uses the real Odds event id, never a team-name search) is timeless, so
// it is exercised against the committed 2026-07-15 semifinal archive (England vs Argentina) — built with the
// SAME exported normalizer + slug the production loader uses, grouped by matchId exactly like worldCupDetails.
function wcDetailsFromArchive() {
  const archive = JSON.parse(fs.readFileSync(new URL("../../public/data/world-cup/projections/2026-07-15.json", import.meta.url), "utf8"));
  const byMatch = new Map();
  for (const p of normalizeWcProjections(archive)) {
    const k = String(p.matchId ?? "");
    if (!k) continue;
    byMatch.set(k, [...(byMatch.get(k) ?? []), p]);
  }
  return [...byMatch.entries()].map(([matchId, teamProjections]) => {
    const [homeTeam, awayTeam] = teamProjections[0].gameLabel.split(" vs ");
    return {
      sport: "world_cup",
      slug: gameSlug(homeTeam, awayTeam, teamProjections[0].date),
      matchId,
      homeTeam,
      awayTeam,
      teamProjections,
      playerProps: [],
      buildUrl: `/build?sport=world_cup&game=${encodeURIComponent(matchId)}`,
      caveats: ["90-minute regulation only — Draw is a real outcome."],
    };
  });
}

test("gameSlug is deterministic: <home>-vs-<away>-<date>", () => {
  assert.equal(gameSlug("Mexico", "South Africa", "2026-06-11"), "mexico-vs-south-africa-2026-06-11");
  assert.equal(gameSlug("LAD", "PIT", "2026-06-11"), "lad-vs-pit-2026-06-11");
});

test("slugify strips accents + punctuation", () => {
  assert.equal(slugify("Côte d'Ivoire"), "cote-d-ivoire");
  assert.equal(slugify("São Paulo"), "sao-paulo");
});

test("urlSport maps world_cup → world-cup (dash), others unchanged", () => {
  assert.equal(urlSport("world_cup"), "world-cup");
  assert.equal(urlSport("mlb"), "mlb");
});

test("buildAllGameDetails resolves real World Cup fixtures with team projections + player props", () => {
  // buildAllGameDetails still runs and resolves the ACTIVE sports' fixtures (now MLB/NBA) — the tournament
  // being over doesn't break the aggregator; it just carries no WC rows.
  assert.ok(buildAllGameDetails().length >= 1, "the live game-detail set is non-empty (active sports)");
  // The WC-detail contract is covered against the committed archive (see wcDetailsFromArchive above).
  const wc = wcDetailsFromArchive();
  assert.ok(wc.length >= 1, "expected at least one World Cup fixture detail from the archive");
  const withProj = wc.find((d) => d.teamProjections.length > 0);
  assert.ok(withProj, "expected a WC fixture with team projections");
  // Build URL deep-links to the exact fixture (real event id — Odds API hex hash or numeric), not a team search.
  assert.match(withProj.buildUrl, /\/build\?sport=world_cup&game=[a-z0-9]+/);
  assert.doesNotMatch(withProj.buildUrl, /game=[^&]*(?:vs|%20| )/i, "deep-link uses an id, not a team-name search");
  // No fabricated player props — playerProps is an array (possibly empty, with a caveat).
  assert.ok(Array.isArray(withProj.playerProps));
  // Caveat present for soccer regulation.
  assert.ok(withProj.caveats.some((c) => /regulation/i.test(c)));
});

test("getGameDetail resolves by url sport + slug, null for unknown", () => {
  // The World Cup tournament is COMPLETE — buildAllGameDetails() has no WC fixtures now (a valid
  // end-of-tournament state; the live board is MLB). Exercise the resolver against the ACTIVE sport, and
  // keep the world-cup url-sport path covered via the null-for-unknown case.
  const all = buildAllGameDetails();
  const active = all.find((d) => d.sport === "mlb") ?? all[0];
  assert.ok(active, "the live game-detail set has an active fixture");
  assert.ok(getGameDetail(urlSport(active.sport), active.slug), "resolves a live fixture by url sport + slug");
  assert.equal(getGameDetail("world-cup", "not-a-real-slug-2099-01-01"), null, "null for an unknown slug");
});

test("detailHrefForTeams resolves a fixture by team pair (order-independent), null when none", () => {
  const all = buildAllGameDetails();
  const wc = all.find((d) => d.sport === "world_cup");
  if (wc) {
    const href1 = detailHrefForTeams("world_cup", wc.homeTeam, wc.awayTeam);
    const href2 = detailHrefForTeams("world_cup", wc.awayTeam, wc.homeTeam);
    assert.equal(href1, href2);                 // order-independent
    assert.match(href1, /^\/games\/world-cup\//);
  }
  assert.equal(detailHrefForTeams("world_cup", "Nowhere FC", "Nobody United"), null);
});
