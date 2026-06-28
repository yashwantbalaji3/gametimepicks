import { test } from "node:test";
import assert from "node:assert/strict";
import { gameSlug, slugify, urlSport, buildAllGameDetails, getGameDetail, detailHrefForTeams } from "./game-detail.ts";

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
  const all = buildAllGameDetails();
  const wc = all.filter((d) => d.sport === "world_cup");
  assert.ok(wc.length >= 1, "expected at least one World Cup fixture detail");
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
  const all = buildAllGameDetails();
  const wc = all.find((d) => d.sport === "world_cup");
  assert.ok(getGameDetail("world-cup", wc.slug));
  assert.equal(getGameDetail("world-cup", "not-a-real-slug-2099-01-01"), null);
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
