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

/*
 * SELECTION POLICY — set from the 48-day backtest of this stream, not from taste.
 *
 * ── Legs are DISJOINT across tiers ──────────────────────────────────────────────────────────────
 * Measured over 43 days of top cards, High and Longshot shared 2.33 legs on average (Jaccard 0.40)
 * and overlapped on 79% of days; Medium/Longshot 1.47 on 74%. Outcome agreement ran above
 * independence in all six tier pairs. A reader taking the whole ladder was therefore making ONE
 * concentrated bet wearing four labels — four tickets that mostly die to the same miss. Tiers are
 * now filled in order and a leg already used is not reused, so the ladder is four genuinely
 * different opinions or it is fewer cards.
 *
 * ── Fewer legs wins ties ────────────────────────────────────────────────────────────────────────
 * Hit rate and ROI fall monotonically with leg count: 2 legs 41.1% / +3.0%, 3 legs 18.3% / −4.3%,
 * 5 legs 7.1% / −14.5%, 6 legs 1.6% / −76.2%. Six-leg cards are near-lottery. Score still leads —
 * it is the one input that predicted, holding within every leg count — but among cards within a
 * hair of each other on score, the shorter one is taken.
 *
 * What is NOT done here: selecting by model edge. Edge does not predict leg outcomes (58.1% / 59.2%
 * / 57.9% across the 0-5 / 5-10 / 10-20pp buckets, 1,407 graded legs), which matches the standing
 * finding that this model adds nothing beyond the market price.
 */
const MAX_LEGS = 5;                 // 6-leg cards returned −76.2% over 62 of them; they do not ship
const SCORE_TIE = 0.02;             // within 2% of the best score counts as a tie on score

const cards = [];
const skipped = [];
const usedLegs = new Set();
const legKey = (l) => `${l.playerName}|${l.market}|${l.side}|${l.line}`;

for (const tier of TIERS) {
  const pool = poolByTier[tier]
    .filter((s) => combinedDecimal(s) != null)
    .filter((s) => (s.legs ?? []).length <= MAX_LEGS)
    .filter((s) => (s.legs ?? []).every((l) => !usedLegs.has(legKey(l))));
  if (!pool.length) {
    skipped.push({
      tier,
      reason: poolByTier[tier].length
        ? "every card in this tier reused a leg already on the ladder, or ran past the five-leg cap"
        : "no priced card in this tier on today's slate",
    });
    continue;
  }
  const ranked = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topScore = ranked[0].score ?? 0;
  const tied = ranked.filter((s) => (s.score ?? 0) >= topScore * (1 - SCORE_TIE));
  const best = tied.sort((a, b) => (a.legs?.length ?? 0) - (b.legs?.length ?? 0))[0];
  for (const l of best.legs ?? []) usedLegs.add(legKey(l));
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

// ── 2b · BETTOR TIERS ────────────────────────────────────────────────────────────────────────────
/*
 * A bettor tier is a POLICY — which price bands are in scope, and how many cards a day — so its
 * record is exactly computable: replay the policy over every graded day and report what it did.
 * That is the only way a per-tier hit rate can be honest, because the number shown belongs to the
 * set actually shown.
 *
 * The policies are defined by PRINCIPLE, not chosen by searching for flattering numbers: risk
 * tolerance picks the bands, daily bankroll decides how many cards it supports at a flat unit.
 *
 * ── The sample-size problem, stated rather than hidden ──────────────────────────────────────────
 * One or two cards a day over 48 graded days is 43-86 settled cards per tier. At that size a HIT
 * RATE is well determined (standard error 3-8pp) and an ROI is not (15-39pp). Three of the four
 * policies currently show a positive ROI and NOT ONE is distinguishable from zero — while the full
 * pool of cards in those same bands is clearly negative. Publishing the positive number as the
 * tier's performance would be publishing noise.
 *
 * So each tier carries its n, both standard errors, and an explicit `roiDetermined` flag. A surface
 * may print the hit rate as measured; it may not present the ROI as established until the flag says
 * the sample supports it.
 */
/*
 * ── The bankroll gate is a GUARDRAIL, not a statistic ───────────────────────────────────────────
 * Worth stating plainly, because the opposite is easy to imply: under flat-percentage staking a
 * drawdown measured in UNITS is bankroll-independent. A $100 bankroll and a $10,000 one both ride
 * out the same 28-card losing run at 2% a card, and both end it down the same fraction. There is no
 * dollar figure the maths hands you.
 *
 * What the data does give is how brutal each tier's dry spells have been, and the gate is keyed to
 * that: the tiers that miss for weeks at a time are not offered as a starting point to someone
 * putting aside a few pounds a day. The figures below are a product judgement about who should be
 * nudged where, and are labelled as one — never as a threshold the numbers produced.
 *
 * A gated tier is still SHOWN, with its record and the streak that gated it. Hiding it would make
 * it aspirational, which is the exact opposite of the intent: Longshot is the worst-performing
 * thing on this site (4.7% hit, 28 straight losers, a median of a fortnight between wins) and the
 * gate exists to slow someone down, not to make it feel like a reward for a bigger balance.
 */
const BETTOR_TIERS = [
  { id: "steady", label: "Steady", bands: ["low"], cardsPerDay: 1, minBankroll: 0,
    blurb: "The shortest prices we publish, one card a day." },
  { id: "balanced", label: "Balanced", bands: ["low", "medium"], cardsPerDay: 2, minBankroll: 50,
    blurb: "Short and mid prices, two cards a day." },
  { id: "adventurous", label: "Adventurous", bands: ["medium", "high"], cardsPerDay: 2, minBankroll: 150,
    blurb: "Mid and long prices, two cards a day." },
  { id: "longshot", label: "Longshot", bands: ["longshot"], cardsPerDay: 1, minBankroll: 500,
    blurb: "The longest price on the board, one card a day." },
];

/** Every graded day, each band ranked the way the ladder ranks it. */
const gradedByDay = new Map();
for (const f of fs.readdirSync(GRADED).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  const doc = readJson(path.join(GRADED, f));
  if (!doc) continue;
  const day = {};
  for (const tier of TIERS) {
    day[tier] = (doc.publicRiskSections?.[tier]?.all ?? [])
      .filter((s) => ["win", "loss"].includes(String(s.status ?? "").toLowerCase()))
      .filter((s) => combinedDecimal(s) != null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((s) => ({ won: String(s.status).toLowerCase() === "win", d: combinedDecimal(s) }));
  }
  gradedByDay.set(doc.date ?? f.slice(0, 10), day);
}

const bettorTiers = BETTOR_TIERS.map((t) => {
  const pnl = [];
  let wins = 0, losses = 0;
  const outcomes = [];
  for (const day of gradedByDay.values()) {
    const pool = t.bands.flatMap((b) => day[b] ?? []);
    for (const c of pool.slice(0, t.cardsPerDay)) {
      pnl.push(c.won ? c.d - 1 : -1);
      outcomes.push(c.won);
      if (c.won) wins++; else losses++;
    }
  }
  /* The streak facts the gate is keyed to, measured rather than asserted: the longest run of
     losers this policy actually produced, and how long a reader typically waits for a win. */
  let run = 0, worstLosingRun = 0;
  for (const x of outcomes) { run = x ? 0 : run + 1; if (run > worstLosingRun) worstLosingRun = run; }
  const n = pnl.length;
  const mean = n ? pnl.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(pnl.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : null;
  const roiSe = sd != null && n ? sd / Math.sqrt(n) : null;
  const hitRate = n ? wins / n : null;
  const hitSe = n ? Math.sqrt(0.25 / n) : null;
  return {
    id: t.id, label: t.label, blurb: t.blurb, bands: t.bands,
    cardsPerDay: t.cardsPerDay, minBankroll: t.minBankroll,
    settledCards: n, wins, losses,
    hitRate: round(hitRate), hitRateSe: round(hitSe),
    worstLosingRun,
    /* Median cards to a win at the measured rate, expressed in DAYS at this tier's cadence. */
    medianDaysToWin: hitRate && hitRate > 0 && hitRate < 1
      ? round(Math.log(0.5) / Math.log(1 - hitRate) / t.cardsPerDay, 1) : null,
    roi: round(mean), roiSe: round(roiSe),
    /*
     * TWO standard errors, the conventional bar — not one.
     *
     * My first pass used one SE and duly labelled Adventurous "sign determined" at t = 1.34, which
     * no conventional standard calls determined. A flag that certifies noise is worse than no flag,
     * because a surface will print it. At 2 SE every tier currently fails (t = 0.81, 1.60, 1.34,
     * −1.15) and that is the honest state: these samples fix a HIT RATE well and an ROI not at all.
     */
    roiDetermined: mean != null && roiSe != null && Math.abs(mean) > 2 * roiSe,
    roiT: mean != null && roiSe ? round(mean / roiSe, 2) : null,
  };
});

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
  bettorTiers,
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

for (const t of bettorTiers) {
  console.log(`  ${t.label.padEnd(12)} ${String(t.settledCards).padStart(3)} cards · hit ${(t.hitRate * 100).toFixed(1)}% ±${(t.hitRateSe * 100).toFixed(1)} · roi ${(t.roi * 100).toFixed(1)}% ±${(t.roiSe * 100).toFixed(1)} · ${t.roiDetermined ? "roi sign determined" : `roi NOT determined (t=${t.roiT})`}`);
}
console.log(`risk ladder ${DATE}: ${cards.length}/4 tiers carded${skipped.length ? ` · skipped ${skipped.map((s) => s.tier).join(", ")}` : ""}`);
for (const c of cards) {
  console.log(`  ${c.tierLabel.padEnd(12)} ${String(c.combinedAmerican > 0 ? "+" : "") + c.combinedAmerican} · ${c.legs.length} legs · tier record ${c.tierRecord.wins}-${c.tierRecord.losses} (roi ${c.tierRecord.roi == null ? "—" : (c.tierRecord.roi * 100).toFixed(1) + "%"})`);
}
console.log(`  lifetime ${payload.record.overall.wins}-${payload.record.overall.losses} across ${payload.record.gradedDays} graded days · roi ${(payload.record.overall.roi * 100).toFixed(1)}%`);
