/**
 * THE 4x4 TIER GRID, FOR ANY SPORT — four bankroll tiers by four risk bands, precomputed.
 *
 * One generator, not one per sport. The per-sport part is a single entry in lab-eligibility's
 * SOURCES table saying where that sport's prices and settlement live; everything downstream is
 * identical, because the claim is identical in every sport: real posted prices, quoted and graded.
 *
 * A sport that cannot clear the eligibility gate does NOT get a thin grid or a placeholder card.
 * It gets an artifact recording the refusal and the reason, so the surface can say why. Today only
 * MLB clears it — NFL has 2 priced games against a 4-game floor, UFC's last price capture is 38
 * days old and no paid UFC call is authorised, and no EPL odds feed is ingested at all.
 *
 * See lib/parlays/tier-grid.mjs for why the sixteen cells are not sixteen different cards, why the
 * cards one reader sees must be leg-disjoint, and why `low` is structurally unreachable.
 *
 * Writes public/data/parlays/tier-grid/<sport>-<date>.json and <sport>-latest.json.
 * Money-neutral: this reads published cards and publishes a policy view of them. It stakes nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labEligibility } from "./lab-eligibility.mjs";
import { resolveTierGrid, crossCardLegCollisions } from "../../src/lib/parlays/tier-grid.mjs";
import { buildMultiLadder } from "../../src/lib/parlays/multi-sport.mjs";
import { BETTOR_TIERS, RISK_ORDER } from "../../src/lib/prefs/bettor-tiers.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "public", "data");
const OUT = path.join(ROOT, "parlays", "tier-grid");

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now", new Date().toISOString());
/* ET, never a UTC slice. Building a ladder for tomorrow at 22:07 ET published zero cards and
   overwrote latest.json — the same trap, now six times. */
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
const DATE = arg("--date", etDay(NOW));
const SPORT = arg("--sport", "mlb");

/** Where each sport's published band cards live. A sport absent here cannot have a grid at all. */
const LADDERS = {
  mlb: (date) => readJson(path.join(ROOT, "parlays", "risk-ladder", `${date}.json`))
              ?? readJson(path.join(ROOT, "parlays", "risk-ladder", "latest.json")),
};

const write = (payload) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${SPORT}-${DATE}.json`), JSON.stringify(payload, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, `${SPORT}-latest.json`), JSON.stringify(payload, null, 1) + "\n");
};

const base = {
  schemaVersion: 1,
  artifact: "parlay-tier-grid",
  dataClass: "DERIVED_POLICY_VIEW",
  moneyClass: "NON_MONEY",       // stakes nothing, moves no bankroll
  sport: SPORT,
  date: DATE,
  generatedAt: NOW,
};

// ── 1 · ELIGIBILITY ─────────────────────────────────────────────────────────────────────────────
const eligibility = labEligibility(ROOT, DATE, NOW);
const mine = eligibility.find((e) => e.id === SPORT) ?? null;

if (!mine) {
  write({ ...base, state: "UNKNOWN_SPORT", reason: `"${SPORT}" is not a sport the parlay lab knows about.`, tiers: [], cells: [] });
  console.log(`tier grid ${SPORT}: unknown sport`);
  process.exit(0);
}

if (!mine.live) {
  write({ ...base, state: "NOT_ELIGIBLE", reason: mine.blocked, evidence: mine.evidence ?? null, tiers: [], cells: [] });
  console.log(`tier grid ${SPORT}: closed — ${mine.blocked}`);
  process.exit(0);
}

// ── 2 · THE PUBLISHED BAND CARDS ────────────────────────────────────────────────────────────────
const ladder = SPORT === "multi"
  ? buildMultiLadder({
      liveSports: mine.evidence?.liveSports ?? [],
      riskOrder: RISK_ORDER,
      date: DATE,
      ladderFor: (sport, date) => LADDERS[sport]?.(date) ?? null,
    })
  : (LADDERS[SPORT]?.(DATE) ?? null);
if (!ladder) {
  write({ ...base, state: "NO_LADDER", reason: `${SPORT} clears the eligibility gate but has published no risk ladder for ${DATE}.`, tiers: [], cells: [] });
  console.log(`tier grid ${SPORT}: eligible but no ladder for ${DATE}`);
  process.exit(1);
}

const cards = ladder.cards ?? [];
const skipped = ladder.skipped ?? [];

/*
 * REFUSE ON A COLLISION RATHER THAN PUBLISH ONE.
 *
 * If any reader's tier would show the same leg on two cards, the ladder's disjointness has broken
 * and the grid would be handing someone one bet wearing several hats — the 65.9%-wipeout case. That
 * is a defect upstream, so this stops rather than papering over it.
 */
const collisions = crossCardLegCollisions({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards });
if (collisions.length) {
  console.error(`tier grid ${SPORT}: ${collisions.length} cross-card leg collision(s) — the ladder's disjointness has broken.`);
  for (const c of collisions.slice(0, 5)) console.error(`  ${c.tier}: "${c.leg}" on both ${c.bands.join(" and ")}`);
  process.exit(1);
}

// ── 3 · THE GRID ────────────────────────────────────────────────────────────────────────────────
const grid = resolveTierGrid({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards, skipped });

/* Each band's own settled record travels with it, so no cell is ever shown without one. */
const recordByBand = Object.fromEntries(cards.map((c) => [c.tier, c.tierRecord ?? null]));

write({
  ...base,
  state: "PUBLISHED",
  /* The reachability finding, on the artifact rather than buried in a comment: a band that has
     never produced a card is a fact a reader is entitled to. */
  bandsUnreachable: RISK_ORDER.filter((b) => !cards.some((c) => c.tier === b) && skipped.some((s) => s.tier === b)),
  calmestAvailable: grid.calmestAvailable,
  tiers: grid.tiers,
  cells: grid.cells,
  cards: cards.map((c) => ({
    band: c.tier, slipId: c.slipId, combinedAmerican: c.combinedAmerican, combinedDecimal: c.combinedDecimal,
    legs: c.legs, status: c.status, record: recordByBand[c.tier] ?? null,
  })),
  note: "A policy view of cards published by the risk ladder. No stake is baked in: bankroll is entered in the reader's own browser and never leaves it. Paper-only, educational; not advice.",
});

const offered = grid.tiers.map((t) => `${t.id} ${t.offered}${t.substitute ? `+sub(${t.substitute.band})` : ""}`).join(" · ");
console.log(`tier grid ${SPORT} ${DATE}: ${cards.length} band card(s) → ${offered}`);
