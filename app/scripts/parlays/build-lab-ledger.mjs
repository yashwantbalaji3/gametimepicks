#!/usr/bin/env node
/**
 * PARLAY LAB LEDGER — the live record, from the policy restart forward.
 *
 * ── Why this starts at 0-0 ──────────────────────────────────────────────────────────────────────
 * On 2026-08-17 the ladder's selection policy changed materially: legs became disjoint across
 * tiers, cards were capped at five legs, and ties on score resolve to the shorter card. Before
 * that, tiers routinely shared legs (High and Longshot overlapped on 79% of days, 2.33 legs on
 * average) and six-leg cards shipped.
 *
 * The 48 graded days behind that change measure a DIFFERENT product. Carrying 172-765 / −9.4%
 * forward as this policy's record would be as wrong as carrying nothing at all — it is a real
 * measurement of a thing we no longer do.
 *
 * ── What is NOT done here ───────────────────────────────────────────────────────────────────────
 * The prior record is not deleted, hidden, or quietly rounded away. It ships in this artifact as
 * `priorPolicy`, labelled, with its dates and its −9.4%. Resetting a losing number to zero and
 * showing nothing else is how a product launders its history; the reset is about ATTRIBUTION, not
 * about making the past disappear. A reader meeting the Lab today sees an empty live record and
 * the previous policy's result side by side, and can tell which is which.
 *
 * ── Structured for more than MLB ────────────────────────────────────────────────────────────────
 * Every record is keyed by SPORT from the first line, and cross-sport cards are their own stream
 * (`multi`) rather than being folded into a sport. MLB is the only one live today; the others exist
 * as declared-but-empty streams so adding a sport is data, not a schema change — and so a sport
 * that has not earned live eligibility cannot silently borrow MLB's numbers.
 *
 *   node app/scripts/parlays/build-lab-ledger.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labEligibility } from "./lab-eligibility.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRADED = path.join(APP, "public", "data", "parlays", "optimizer-graded");
const RECEIPTS = path.join(APP, "public", "data", "parlays", "lab-settled");
const OUT = path.join(APP, "public", "data", "parlays", "lab-ledger.json");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

/**
 * The policy this ledger measures. Bump BOTH when selection changes materially, and the live record
 * restarts from that date — an unversioned reset is indistinguishable from hiding a bad run.
 */
const POLICY = {
  version: 2,
  since: "2026-08-17",
  summary: "Legs disjoint across tiers · five-leg cap · ties on score resolve to the shorter card",
};

/*
 * Streams are MEASURED, not declared. The previous version of this file hard-coded which sports were
 * live and why — which meant the reasons were a human's summary, drifted the moment a feed changed,
 * and could not notice a sport becoming eligible. `labEligibility` derives all of it from the
 * artifacts on disk each run, so a stale capture closes a sport instead of publishing yesterday's
 * prices under today's heading.
 */
const STREAMS = labEligibility(path.join(APP, "public", "data"), NOW.slice(0, 10), NOW);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));
const TIERS = ["low", "medium", "high", "longshot"];

const emptyRecord = () => ({ wins: 0, losses: 0, pushes: 0, staked: 0, returned: 0, hitRate: null, roi: null });

// ── 1 · THE LIVE RECORD — only receipts stamped at or after the policy restart ───────────────────
/*
 * Re-derived from the receipts on disk every run, never incremented. A cumulative file rebuilt from
 * one day's view is how the NFL experimental record got wiped; deriving from receipts makes that
 * class of bug unrepresentable here.
 */
const live = Object.fromEntries(STREAMS.map((s) => [s.id, {
  byTier: Object.fromEntries(TIERS.map((t) => [t, emptyRecord()])),
  overall: emptyRecord(),
  settledDays: [],
}]));

let receiptFiles = [];
try {
  receiptFiles = fs.readdirSync(RECEIPTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
} catch { /* no receipts yet — the honest state on day one */ }

for (const f of receiptFiles) {
  const date = f.slice(0, 10);
  if (date < POLICY.since) continue;                 // a pre-restart day is not this policy's
  const doc = readJson(path.join(RECEIPTS, f));
  if (!doc) continue;
  for (const c of doc.cards ?? []) {
    const stream = live[c.sport ?? "mlb"];
    if (!stream) continue;
    const st = String(c.result ?? "pending").toLowerCase();
    if (!["win", "loss", "push"].includes(st)) continue;
    /*
     * A card whose tier has no bucket used to be skipped for the tier and still counted in
     * `overall`, so the tier rows silently stopped summing to the headline — the parts and the whole
     * disagreeing with nothing to say so. An unrecognised tier is a defect in the producer, not a
     * row to quietly drop.
     */
    if (!stream.byTier[c.tier]) {
      console.error(`REFUSED: ${c.sport ?? "mlb"} card ${c.slipId ?? "?"} has tier "${c.tier}" with no bucket — the tier rows would stop summing to the record`);
      process.exit(2);
    }
    for (const bucket of [stream.byTier[c.tier], stream.overall]) {
      if (!bucket) continue;
      if (st === "push") { bucket.pushes++; continue; }
      if (st === "win") bucket.wins++; else bucket.losses++;
      bucket.staked += 1;
      if (st === "win" && Number.isFinite(c.combinedDecimal)) bucket.returned += c.combinedDecimal;
    }
    if (!stream.settledDays.includes(date)) stream.settledDays.push(date);
  }
}

for (const s of STREAMS) {
  const stream = live[s.id];
  /*
   * THE PARTS MUST SUM TO THE WHOLE (P230 · F3).
   *
   * Every bucket used to round its own `returned` from its own unrounded accumulation — tiers and
   * the overall record alike. Rounding independently is not the same as rounding once: MLB's record
   * published 22.62 while its four tier rows summed to 22.61, so a reader adding the rows got a
   * different number than the headline they sat under. One cent, and exactly the kind of thing that
   * makes a record impossible to check.
   *
   * The tiers round first and the record is then the SUM OF THE PUBLISHED TIERS, so the arithmetic
   * a reader can do by hand is the arithmetic that produced the total. `roi` is recomputed from the
   * reconciled figure rather than the pre-rounding one, so the published ratio matches the published
   * numerator.
   */
  const tierBuckets = Object.values(stream.byTier);
  for (const bucket of tierBuckets) bucket.returned = round(bucket.returned, 2);
  stream.overall.returned = round(tierBuckets.reduce((n, b) => n + b.returned, 0), 2);

  for (const bucket of [...tierBuckets, stream.overall]) {
    const decisive = bucket.wins + bucket.losses;
    bucket.hitRate = decisive ? round(bucket.wins / decisive) : null;
    bucket.roi = bucket.staked ? round((bucket.returned - bucket.staked) / bucket.staked) : null;
  }
}

// ── 2 · THE PRIOR POLICY, preserved ──────────────────────────────────────────────────────────────
/*
 * Kept because a reader meeting an empty ledger deserves to know what the previous version of this
 * did, and because a −9.4% that vanishes on the day the policy changes is the oldest trick there is.
 */
const prior = { wins: 0, losses: 0, staked: 0, returned: 0, days: new Set() };
for (const f of (() => { try { return fs.readdirSync(GRADED).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)); } catch { return []; } })()) {
  const doc = readJson(path.join(GRADED, f));
  if (!doc) continue;
  prior.days.add(doc.date ?? f.slice(0, 10));
  for (const tier of TIERS) {
    for (const slip of doc.publicRiskSections?.[tier]?.all ?? []) {
      const st = String(slip.status ?? "").toLowerCase();
      if (st !== "win" && st !== "loss") continue;
      const legs = slip.legs ?? [];
      let d = 1, ok = legs.length > 0;
      for (const l of legs) {
        if (l.oddsForSide == null || !Number.isFinite(Number(l.oddsForSide))) { ok = false; break; }
        d *= dec(Number(l.oddsForSide));
      }
      if (st === "win") prior.wins++; else prior.losses++;
      if (!ok) continue;
      prior.staked += 1;
      if (st === "win") prior.returned += d;
    }
  }
}
const priorDays = [...prior.days].sort();

const payload = {
  schemaVersion: 1,
  artifact: "parlay-lab-ledger",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW.replace(/\.\d{3}Z$/, "Z"),
  moneyClass: "PAPER_ONLY",
  note: "Paper stream with its own ledger. Never part of the Bank Builder / Moonshot bankroll or the settled product record.",
  policy: POLICY,
  streams: STREAMS.map((s) => ({
    ...s,
    evidence: s.evidence,
    settledDays: live[s.id].settledDays.length,
    record: live[s.id].overall,
    byTier: live[s.id].byTier,
  })),
  priorPolicy: {
    version: 1,
    label: "Before the 2026-08-17 selection change",
    summary: "Up to six cards per tier, legs reused across tiers, cards up to six legs",
    firstDay: priorDays[0] ?? null,
    lastDay: priorDays[priorDays.length - 1] ?? null,
    gradedDays: priorDays.length,
    wins: prior.wins,
    losses: prior.losses,
    roi: prior.staked ? round((prior.returned - prior.staked) / prior.staked) : null,
    note: "A measurement of the previous selection policy, kept because it is real. It does not describe what the Lab publishes now.",
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");

const live_ = payload.streams.find((s) => s.id === "mlb").record;
console.log(`parlay lab ledger · policy v${POLICY.version} since ${POLICY.since}`);
console.log(`  LIVE   mlb ${live_.wins}-${live_.losses} across ${payload.streams[0].settledDays} settled day(s)`);
for (const s of payload.streams.slice(1)) console.log(`  ${s.live ? "LIVE  " : "closed"} ${s.id.padEnd(5)} ${s.blocked ?? ""}`);
console.log(`  prior policy (kept, not attributed): ${payload.priorPolicy.wins}-${payload.priorPolicy.losses} · roi ${(payload.priorPolicy.roi * 100).toFixed(1)}% over ${payload.priorPolicy.gradedDays} days`);
