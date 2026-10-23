#!/usr/bin/env node
/**
 * NBA GAME-WINNER TIERS · §7 EVIDENCE (docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md). READ-ONLY, OFFLINE: prints, for
 * one lane day and one planned build instant, what the NBA game winners block WILL show, so the release owner's
 * browser check compares against a prediction made before the build:
 *   1. every NBA leg: the receipt's exact pHome vs the display accessor's (Object.is), receipt sha and frozenAt equal;
 *   2. the expected card per tier: legs (side, shown %), exact joint, shown joint text, tier; or the empty-state reason;
 *   3. the band-edge sweep of the joint text (every shown joint bands with its card);
 *   4. the switch-OFF model is byte-identical to the model without this rule.
 * The display is read through its own committed switch. Before that switch is on, `--simulate-display` builds the
 * lane field with the display's OWN publisher from the real receipts, and the output says SIMULATED.
 *
 *   npx tsx scripts/products/nba-game-winner-evidence.mjs --day YYYY-MM-DD --now <planned build ISO> [--simulate-display]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eloWinProbabilityOf, laneEloWinProbability } from "../../src/lib/sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "../../src/lib/sports/nba/elo-win-probability-context.mjs";
import { nbaGameWinnerDisplay } from "../../src/lib/products/level-a/nba-game-winner-source.mjs";
import { buildLevelAModel } from "../../src/lib/products/level-a/model.mjs";
import { jointShownFor, tierForJoint } from "../../src/lib/products/level-a/suggestions.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

export function bandSweep() {
  let checked = 0;
  const bad = [];
  for (const [lo, hi] of [[0.66, 0.672], [0.495, 0.505], [0.247, 0.253], [0.1415, 0.1445]]) {
    for (let j = lo; j <= hi; j += 0.00001) {
      const tier = tierForJoint(j);
      if (!tier) continue;
      checked += 1;
      const shown = jointShownFor(j, tier);
      if (tierForJoint(Number(shown.slice(0, -1)) / 100) !== tier) bad.push(`${j.toFixed(5)} ${tier} ${shown}`);
    }
  }
  return { checked, misbanded: bad };
}

export function evidence({ day, now, simulateDisplay = false, repoRoot = REPO }) {
  const lane = readJson(path.join(repoRoot, "app", "public", "data", "nba", "experimental-public", `${day}.json`));
  if (!lane || lane.date !== day) return { ok: false, problem: `no published lane file for ${day}` };
  const receipts = new Map((readJson(path.join(repoRoot, "data", "internal", "research", "nba", "experimental-v0.1", "forecasts", `${day}.json`))?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const realCtx = loadEloWinProbabilityContext({ appDir: path.join(repoRoot, "app") });
  const laneUsed = simulateDisplay
    ? { ...lane, games: lane.games.map((g) => { const s = receipts.get(String(g.providerEventId)); const wp = s ? laneEloWinProbability(s.forecast, s.receipt) : null; return wp && !g.elo?.winProbability ? { ...g, elo: { ...g.elo, winProbability: wp } } : g; }) }
    : lane;
  const ctx = simulateDisplay ? { ...realCtx, enabled: true } : realCtx;
  const display = nbaGameWinnerDisplay({ repoRoot, date: day, ctx, lane: laneUsed });
  const legs = laneUsed.games.map((g) => {
    const v = eloWinProbabilityOf(g, { enabled: ctx.enabled });
    const s = receipts.get(String(g.providerEventId));
    return {
      eventId: String(g.providerEventId), matchup: `${g.away?.abbr} @ ${g.home?.abbr}`, tipUtc: g.tipUtc, side: g.elo?.favoured ?? null, state: g.elo?.state ?? null,
      displayPHome: v?.home ?? null, receiptPHome: s?.forecast?.elo?.pHome ?? null, pEqual: v ? Object.is(v.home, s?.forecast?.elo?.pHome) : null,
      shown: v ? `${v.awayAbbr} ${v.awayPct}% · ${v.homeAbbr} ${v.homePct}%` : null,
      shaEqual: v ? v.provenance.receiptPayloadSha256 === g.receipt?.payloadSha256 && g.receipt?.payloadSha256 === s?.receipt?.payloadSha256 : null,
      frozenAtEqual: v ? v.provenance.frozenAt === g.frozenAt && g.frozenAt === s?.receipt?.generatedAt : null,
    };
  });
  const model = buildLevelAModel({ repoRoot, now, productDay: day, nbaGameWinners: { enabled: true, display } });
  const block = model.nbaGameWinners;
  const cards = (block?.tiers ?? []).map((t) => (t.card
    ? { tier: t.tier, label: t.tierLabel, legs: t.card.legs.map((l) => `${l.selection.label.replace(" (official side)", "")} ${l.shownPct} (${l.eventLabel})`), jointExact: t.card.jointProbability, jointShown: jointShownFor(t.card.jointProbability, t.card.tier) }
    : { tier: t.tier, label: t.tierLabel, empty: t.reason }));
  const off = JSON.stringify(buildLevelAModel({ repoRoot, now, productDay: day, nbaGameWinners: { enabled: false } })) === JSON.stringify(buildLevelAModel({ repoRoot, now, productDay: day }));
  return {
    ok: true, day, now, display: simulateDisplay ? "SIMULATED (the display's own publisher over the real receipts; its switch is not on yet)" : realCtx.enabled ? "LIVE (the display's committed switch is on)" : "OFF (the display's switch is off: no tiers)",
    legs, block: block ? { public: block.public, untiered: block.untiered.map((u) => `${u.leg.eventId} ${u.code}`), disclosure: block.disclosure } : null,
    cards, bandSweep: bandSweep(), switchOffModelIdentical: off,
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  console.log(JSON.stringify(evidence({ day: arg("--day"), now: arg("--now"), simulateDisplay: process.argv.includes("--simulate-display") }), null, 2));
}
