#!/usr/bin/env node
/**
 * THE RISK LADDER — one card per risk tier for the day, plus the tier-by-tier record that says how
 * that tier has actually done.
 *
 * ── Why both in one script ──────────────────────────────────────────────────────────────────────
 * The cards and the record read the same source and must never disagree. Publishing "today's
 * Longshot card" without "Longshot is 14-224, −25% ROI over 48 days" beside it would be the most
 * flattering possible framing of the worst-performing thing on the site. They ship together or not
 * at all, so the two cannot drift apart across two jobs.
 *
 * ── Selection is BY RULE ────────────────────────────────────────────────────────────────────────
 * The optimizer already publishes six candidates per tier with a `score`. The ladder takes the
 * highest-scoring card in each tier — no hand-picking, no re-ranking, and no reaching into another
 * tier when one is thin. A tier with no qualifying card publishes NOTHING for that tier and says so.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────────────────────────
 * Not money. These never touch portfolio.json, banked-ladders.json, Bank Builder or Moonshot, and
 * the 19-14 record does not move because of them. This is a tracked PAPER stream with its own
 * ledger, kept separate precisely because its measured result is negative in every tier.
 *
 *   node app/scripts/parlays/build-risk-ladder.mjs --now <ISO>
 *   node app/scripts/parlays/build-risk-ladder.mjs --now <ISO> --date 2026-08-17
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRADED = path.join(APP, "public", "data", "parlays", "optimizer-graded");
const SNAPSHOTS = path.join(APP, "public", "data", "parlays", "snapshots");
const OUT = path.join(APP, "public", "data", "parlays", "risk-ladder");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));

const TIERS = ["low", "medium", "high", "longshot"];
const TIER_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk", longshot: "Longshot" };

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const toAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

/** Every slip in a day's artifact, tagged with its tier. Shape is `publicRiskSections.<tier>.all[]`. */
function slipsFor(doc) {
  const out = [];
  const prs = doc?.publicRiskSections ?? {};
  for (const tier of TIERS) for (const s of prs[tier]?.all ?? []) out.push({ tier, slip: s });
  return out;
}

/** Combined decimal price of a slip, or null when any leg is missing its price. */
function combinedDecimal(slip) {
  const legs = slip.legs ?? [];
  if (!legs.length) return null;
  let d = 1;
  for (const l of legs) {
    const o = l.oddsForSide;
    if (o == null || !Number.isFinite(Number(o))) return null;
    d *= dec(Number(o));
  }
  return d;
}

// ── 1 · THE LIFETIME RECORD, per tier ────────────────────────────────────────────────────────────
/*
 * Derived from every graded day on disk each run, never incremented from the previous record.
 * A cumulative file rebuilt from one day's view is how the NFL experimental record got wiped
 * earlier today; re-deriving from the receipts makes that class of bug unrepresentable here.
 */
const record = Object.fromEntries(TIERS.map((t) => [t, { wins: 0, losses: 0, pushes: 0, pending: 0, staked: 0, returned: 0 }]));
const gradedDays = new Set();
for (const f of fs.readdirSync(GRADED).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  const doc = readJson(path.join(GRADED, f));
  if (!doc) continue;
  gradedDays.add(doc.date ?? f.slice(0, 10));
  for (const { tier, slip } of slipsFor(doc)) {
    const st = String(slip.status ?? "pending").toLowerCase();
    const r = record[tier];
    if (st === "win") r.wins++; else if (st === "loss") r.losses++;
    else if (st === "push") { r.pushes++; continue; } else { r.pending++; continue; }
    const d = combinedDecimal(slip);
    if (d == null) continue;              // unpriced slips count W/L but never distort ROI
    r.staked += 1;
    if (st === "win") r.returned += d;
  }
}
for (const t of TIERS) {
  const r = record[t];
  r.decisive = r.wins + r.losses;
  r.hitRate = r.decisive ? round(r.wins / r.decisive) : null;
  r.roi = r.staked ? round((r.returned - r.staked) / r.staked) : null;
  r.returned = round(r.returned, 2);
}

// ── 2 · TODAY'S CARD PER TIER ────────────────────────────────────────────────────────────────────
/*
 * TWO SOURCES, ONE RULE.
 *
 * The graded artifact already carries `publicRiskSections` bucketed by COMBINED ODDS. Today's slate
 * is not graded yet, and its snapshot is bucketed by GENERATION PROFILE instead
 * (conservative/balanced/aggressive) — a different axis entirely: a "conservative" build can still
 * combine to +450, which is High risk by price.
 *
 * So an ungraded day is bucketed here with the SAME canonical bands the grader uses
 * (risk-odds-bands.ts: low ≤ +100 < medium ≤ +300 < high ≤ +600 < longshot). Re-implementing the
 * thresholds would let today's ladder and tomorrow's record disagree about what "High risk" means.
 */
const BANDS = [
  ["low", (a) => a >= -200 && a <= 100],
  ["medium", (a) => a > 100 && a <= 300],
  ["high", (a) => a > 300 && a <= 600],
  ["longshot", (a) => a > 600],
];
const bucketFor = (american) => BANDS.find(([, fits]) => fits(american))?.[0] ?? null;

const gradedToday = readJson(path.join(GRADED, `${DATE}.json`));
const snapshotToday = readJson(path.join(SNAPSHOTS, `${DATE}.json`));

/** tier → candidate slips, from whichever source exists for this date. */
const poolByTier = Object.fromEntries(TIERS.map((t) => [t, []]));
if (gradedToday?.publicRiskSections) {
  for (const { tier, slip } of slipsFor(gradedToday)) poolByTier[tier].push(slip);
} else {
  for (const slip of snapshotToday?.slips ?? []) {
    const d = combinedDecimal(slip);
    if (d == null) continue;
    const tier = bucketFor(toAmerican(d));
    if (tier) poolByTier[tier].push(slip);
  }
}

const cards = [];
const skipped = [];
for (const tier of TIERS) {
  const pool = poolByTier[tier].filter((s) => combinedDecimal(s) != null);
  if (!pool.length) { skipped.push({ tier, reason: "no priced card in this tier on today's slate" }); continue; }
  const best = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const d = combinedDecimal(best);
  cards.push({
    tier,
    tierLabel: TIER_LABEL[tier],
    slipId: best.slipId,
    combinedAmerican: toAmerican(d),
    combinedDecimal: round(d, 3),
    legs: (best.legs ?? []).map((l) => ({
      player: l.playerName, team: l.team ?? null, opponent: l.opponent ?? null,
      playerId: l.playerId ?? null, gameId: l.gameId ?? null,
      market: l.market, marketLabel: l.marketLabel, side: l.side, line: l.line,
      odds: l.oddsForSide, result: l.result ?? null,
    })),
    status: String(best.status ?? "pending").toLowerCase(),
    // The tier's own history travels WITH the card, so a reader never sees the pick without it.
    tierRecord: {
      wins: record[tier].wins, losses: record[tier].losses,
      hitRate: record[tier].hitRate, roi: record[tier].roi,
    },
  });
}

const totalStaked = TIERS.reduce((n, t) => n + record[t].staked, 0);
const totalReturned = TIERS.reduce((n, t) => n + (record[t].returned ?? 0), 0);

const payload = {
  schemaVersion: 1,
  artifact: "parlay-risk-ladder",
  dataClass: "PUBLIC_DERIVED",
  date: DATE,
  generatedAt: NOW,
  /** Loud, because this stream's measured result is negative in every tier. */
  moneyClass: "PAPER_TRACKED_NOT_BANKROLL",
  note: "Tracked paper cards with their own ledger. These never touch the Bank Builder / Moonshot bankroll or the settled product record.",
  cards,
  skipped,
  record: {
    gradedDays: gradedDays.size,
    firstDay: [...gradedDays].sort()[0] ?? null,
    lastDay: [...gradedDays].sort().at(-1) ?? null,
    byTier: record,
    overall: {
      wins: TIERS.reduce((n, t) => n + record[t].wins, 0),
      losses: TIERS.reduce((n, t) => n + record[t].losses, 0),
      staked: totalStaked,
      returned: round(totalReturned, 2),
      roi: totalStaked ? round((totalReturned - totalStaked) / totalStaked) : null,
    },
  },
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${DATE}.json`), JSON.stringify(payload, null, 1) + "\n");
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(payload, null, 1) + "\n");

console.log(`risk ladder ${DATE}: ${cards.length}/4 tiers carded${skipped.length ? ` · skipped ${skipped.map((s) => s.tier).join(", ")}` : ""}`);
for (const c of cards) {
  console.log(`  ${c.tierLabel.padEnd(12)} ${String(c.combinedAmerican > 0 ? "+" : "") + c.combinedAmerican} · ${c.legs.length} legs · tier record ${c.tierRecord.wins}-${c.tierRecord.losses} (roi ${c.tierRecord.roi == null ? "—" : (c.tierRecord.roi * 100).toFixed(1) + "%"})`);
}
console.log(`  lifetime ${payload.record.overall.wins}-${payload.record.overall.losses} across ${payload.record.gradedDays} graded days · roi ${(payload.record.overall.roi * 100).toFixed(1)}%`);
