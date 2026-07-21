/**
 * SIMULATE AVAILABILITY BADGES (2026-07-09) — artifact-backed, no leaks, gate-safe.
 *
 * Pins: every lobby availability chip is backed by a real joined artifact (a chip appears only when
 * its module genuinely exists), soccer NEVER carries a run-count/simulation chip, unsupported markets
 * are never advertised, no chip leaks a probability/price/lean, the ONE coming-soon chip is a
 * documented roadmap item, the loader is wired into the lobby + rendered with a mobile-safe cap, and
 * money md5 is unchanged (the layer is money-independent). No banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { mlbAvailabilityBadges, worldCupAvailabilityBadges } from "./simulate-availability.ts";
import { getMlbGameCenter } from "./mlb-team-markets.ts";
import { getWcGameCenter, buildWcGameCenter } from "./wc-game-center.ts";
import { getWcExpandedMarkets } from "./wc-expanded-markets.ts";
import { loadWorldCupProjections } from "./world-cup/projections.ts";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");
// A prediction leak = a probability/price/lean. The ALLOWED "N,NNN-run" label carries a run count
// (comma-grouped integer, no decimal point / % / over-under wording), so it must not trip this.
const LEAK = /%|\d+\.\d|\bunder\b|\bover\b|\bcover\b|[+-]\d{2,}/i;

const loaderSrc = read("src/lib/simulate-availability.ts");
const cardSrc = read("src/components/games-experience.tsx");
const lobbySrc = read("src/components/games/simulate-lobby.tsx");

/** Newest MLB game-simulation artifact (YYYY-MM-DD.json) — date + parsed payload. */
function latestMlbSim() {
  const dir = path.join(app, "public/data/mlb/game-simulations");
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const file = files[files.length - 1];
  return { date: file.replace(".json", ""), payload: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) };
}

/** A real MLB detail SUBSET built from the live artifacts (sim view fields + de-vigged Game Center). */
function realMlbDetail() {
  const { date, payload } = latestMlbSim();
  const games = payload.games ? Object.values(payload.games) : [];
  const g = games.find((x) => (x.generatedPicks || []).length > 0) ?? games[0];
  const runCount = payload.runCount ?? null;
  return {
    date,
    runCount,
    gameLabSimulation: {
      status: "ready",
      runCount,
      // Mirrors the view's rule: a run-count claim is allowed iff runCount is a positive integer.
      allowsRunCountClaim: Number.isInteger(runCount) && runCount > 0,
      generatedPicks: g.generatedPicks || [],
    },
    gameCenter: getMlbGameCenter(date, g.gameId),
  };
}

/** A real WC detail SUBSET built from the committed Game Center + expanded-markets artifacts.
 *  The World Cup tournament is COMPLETE — loadWorldCupProjections() now returns an empty slate (a valid
 *  end-of-tournament state), so this pins to the committed 2026-07-15 semifinal archive (England vs
 *  Argentina) to keep the badge logic covered. buildWcGameCenter is the pure builder behind
 *  getWcGameCenter; the expanded-markets artifact for that date is committed with real Asian-handicap +
 *  team-totals modules. */
function realWcDetail() {
  const proj = JSON.parse(read("public/data/world-cup/projections/2026-07-15.json"));
  const mid = String(proj.matches[0].matchId);
  const rows = proj.matches.filter((m) => String(m.matchId) === mid);
  return {
    wcGameCenter: buildWcGameCenter(mid, rows),
    wcExpanded: getWcExpandedMarkets("2026-07-15", mid),
  };
}

test("1 · MLB badges are artifact-backed (real sim + de-vigged Game Center)", () => {
  const d = realMlbDetail();
  const badges = mlbAvailabilityBadges(d);
  const labels = badges.map((b) => b.label);
  // The run-count chip reflects the REAL artifact runCount (e.g. 10,000-run) — never hard-coded.
  assert.ok(labels.includes(`${d.runCount.toLocaleString()}-run`), "run-count chip matches the artifact runCount");
  for (const l of ["Moneyline", "Run Line", "Total", "Player Props"]) {
    assert.ok(labels.includes(l), `MLB has ${l}`);
  }
  // Every non-coming-soon chip cites a real artifact provenance.
  for (const b of badges.filter((x) => x.kind !== "comingSoon")) {
    assert.match(b.source, /^mlb_(simulation|team_markets)$/, `${b.label} cites a real artifact`);
  }
});

test("2 · Soccer badges are artifact-backed (real Game Center + expanded markets)", () => {
  const badges = worldCupAvailabilityBadges(realWcDetail());
  const labels = badges.map((b) => b.label);
  for (const l of ["Market-implied", "Match Result", "Total", "BTTS", "Asian Handicap", "Team Totals"]) {
    assert.ok(labels.includes(l), `WC has ${l}`);
  }
  for (const b of badges) assert.match(b.source, /^wc_(projection|expanded)$/, `${b.label} cites a real artifact`);
});

test("3 · Soccer NEVER shows a run-count / simulation chip", () => {
  const badges = worldCupAvailabilityBadges(realWcDetail());
  assert.ok(!badges.some((b) => b.kind === "simulation"), "no simulation-kind chip for soccer");
  for (const b of badges) assert.doesNotMatch(b.label, /run\b|10,?000|monte carlo/i, `${b.label} is not a run-count claim`);
  // The soccer code path literally has no runCount concept.
  assert.doesNotMatch(loaderSrc.split("worldCupAvailabilityBadges")[1] ?? "", /runCount|allowsRunCountClaim/);
});

test("4 · unsupported markets are never advertised; empty detail invents nothing", () => {
  assert.deepEqual(mlbAvailabilityBadges({}), [], "no MLB detail ⇒ no chips");
  assert.deepEqual(worldCupAvailabilityBadges({}), [], "no WC detail ⇒ no chips");
  // A partial MLB detail (sim only, no Game Center) must NOT invent market chips.
  const simOnly = mlbAvailabilityBadges({ gameLabSimulation: { status: "ready", runCount: 10000, allowsRunCountClaim: true, generatedPicks: [1] } });
  const simLabels = simOnly.map((b) => b.label);
  for (const l of ["Moneyline", "Run Line", "Total"]) assert.ok(!simLabels.includes(l), `no fabricated ${l} without a Game Center`);
  // Neither loader ever emits an un-ingested/other-provider market as an available chip.
  const allReal = [...mlbAvailabilityBadges(realMlbDetail()), ...worldCupAvailabilityBadges(realWcDetail())].map((b) => b.label.toLowerCase());
  for (const forbidden of ["margin distribution", "total runs distribution", "corners", "cards", "exact score", "xg", "first scorer", "anytime scorer", "shots"]) {
    assert.ok(!allReal.includes(forbidden), `${forbidden} is not an available chip`);
  }
});

test("5 · the ONLY coming-soon chip is a documented roadmap item", () => {
  const mlb = mlbAvailabilityBadges(realMlbDetail());
  const soon = mlb.filter((b) => b.kind === "comingSoon");
  assert.equal(soon.length, 1, "exactly one coming-soon chip on a real MLB game");
  assert.equal(soon[0].key, "mlb_distributions_soon");
  // Its provenance names a doc that actually exists on disk.
  assert.match(soon[0].source, /^roadmap:/);
  const doc = soon[0].source.replace(/^roadmap:/, "");
  // Docs live at the repo root (tests run from app/), so resolve one level up.
  assert.ok(fs.existsSync(path.join(app, "..", "docs", `${doc}.md`)), `${doc}.md exists`);
  // Soccer carries no coming-soon lobby chip.
  assert.ok(!worldCupAvailabilityBadges(realWcDetail()).some((b) => b.kind === "comingSoon"), "no WC coming-soon chip");
});

test("6 · chips never leak exact probabilities / prices / leans", () => {
  const all = [...mlbAvailabilityBadges(realMlbDetail()), ...worldCupAvailabilityBadges(realWcDetail())];
  for (const b of all) assert.doesNotMatch(b.label, LEAK, `${b.label} leaks a prediction value`);
  // The loader never formats a probability/price (no % / toFixed / odds math in labels).
  assert.doesNotMatch(loaderSrc, /toFixed|Math\.round\([^)]*prob|marketProbability.*label/);
});

test("7 · wired into the lobby + rendered with a mobile-safe cap (gate-safe)", () => {
  assert.match(lobbySrc, /import \{ mlbAvailabilityBadges, worldCupAvailabilityBadges \} from "@\/lib\/simulate-availability"/);
  assert.match(lobbySrc, /availabilityBadges: worldCupAvailabilityBadges\(d\)/, "WC rows compute badges");
  assert.match(lobbySrc, /availabilityBadges: mlbDetail \? mlbAvailabilityBadges\(mlbDetail\)/, "MLB rows compute badges");
  // The card renders the row with a wrapped, capped display (+N more) — no horizontal scroll.
  assert.match(cardSrc, /availabilityBadges/);
  assert.match(cardSrc, /flex flex-wrap/);
  assert.match(cardSrc, /\+\{overflow\} more/);
  assert.match(cardSrc, /data-testid="availability-badges"/);
});

test("8 · no banned copy in the availability surfaces", () => {
  for (const src of [loaderSrc]) assert.doesNotMatch(stripSafeArea(src), BANNED);
  // Chip labels themselves carry no banned words.
  const labels = [...mlbAvailabilityBadges(realMlbDetail()), ...worldCupAvailabilityBadges(realWcDetail())].map((b) => b.label).join(" | ");
  assert.doesNotMatch(stripSafeArea(labels), BANNED);
});

test("9 · money md5 unchanged; the availability layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  assert.doesNotMatch(loaderSrc, /portfolio\.json|mr-dub|bankroll/);
});
