/**
 * Shadow L10 (recent-form) audit — OFFLINE, READ-ONLY.
 *
 * ⚠  SHADOW MODE. Reads ONLY settled public-era graded slates and asks:
 *    does a transparent "L10 recent-form hit rate" (the fraction of a leg's
 *    last-N games that already cleared its line, in the leg's direction)
 *    predict the leg's settled outcome — and does it add signal BEYOND the
 *    market-implied probability? It writes NOTHING and changes NO behavior.
 *
 * Why: the Bank Builder revamp (feedback #4) wants to require strong
 *   recent-form support, but L10 must be REAL, pregame-safe, and audited
 *   before any wiring. Per #240/#245, edgePct/confidence are NOT usable as
 *   quality signals — so we test L10 on its own merits here. NOTHING is wired.
 *
 * L10 definition (pregame-safe): from the leg's stored `recentSeries` (the
 *   player's recent per-game stat values for that market), L10 hit rate =
 *   (# recent games that cleared the line in the leg's side) / (# decisive
 *   recent games). Ties (value == line) are pushes, excluded from the
 *   denominator. Requires ≥ MIN_GAMES decisive recent games, else "no L10"
 *   (never fabricated).
 *
 * Dataset: deduped settled legs from optimizer-graded for the public era
 *   (May 27 … June 1). May 25/26 excluded. Pending excluded. No same-slate
 *   leakage (each leg graded vs its own final box score). Small sample —
 *   read aggregates, not single cells.
 *
 * Run: cd app && npx tsx scripts/shadow-l10-audit.mjs
 */
import { readFileSync } from "node:fs";

const DATES = ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"];
const MIN_GAMES = 5; // minimum decisive recent games to compute an L10 rate

const impliedRaw = (o) => (o >= 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
function load(d) {
  try { return JSON.parse(readFileSync(`public/data/parlays/optimizer-graded/${d}.json`, "utf8")); }
  catch { return null; }
}

// L10 hit rate for one leg from its recentSeries, in the leg's side direction.
function l10Rate(leg) {
  const rs = Array.isArray(leg.recentSeries) ? leg.recentSeries.map(Number).filter(Number.isFinite) : [];
  if (rs.length < MIN_GAMES || leg.line == null || (leg.side !== "Over" && leg.side !== "Under")) return null;
  let hit = 0, decisive = 0;
  for (const v of rs) {
    if (v === leg.line) continue; // push — exclude
    decisive++;
    if (leg.side === "Over" ? v > leg.line : v < leg.line) hit++;
  }
  if (decisive < MIN_GAMES) return null;
  return hit / decisive;
}

// ── build deduped settled-leg dataset + keep slips for slip-level pass ──
const legs = [];
const slips = [];
const seen = new Set();
for (const date of DATES) {
  const g = load(date);
  if (!g) continue;
  for (const s of g.uniqueSlips ?? []) {
    const slipLegs = [];
    for (const l of s.legs) {
      const r = l.result;
      const rate = l10Rate(l);
      slipLegs.push({ rate, win: r === "win" ? 1 : r === "loss" ? 0 : null });
      if (r !== "win" && r !== "loss") continue;
      const key = `${date}|${l.leanId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      legs.push({
        date, sport: l.sport, market: l.market, side: l.side, line: l.line,
        l10: rate, imp: l.oddsForSide == null ? null : impliedRaw(l.oddsForSide),
        win: r === "win" ? 1 : 0,
      });
    }
    slips.push({ status: s.status, legs: slipLegs });
  }
}

const rate = (rows) => { const n = rows.length, w = rows.reduce((a, x) => a + x.win, 0); return n ? `${w}/${n}=${Math.round((w / n) * 100)}%` : "—"; };
const pct = (x) => `${(x * 100).toFixed(0)}%`;

console.log("════════════════════════════════════════════════════════════════════");
console.log(" SHADOW L10 (recent-form) audit  —  offline, read-only, nothing wired");
console.log("════════════════════════════════════════════════════════════════════");
const withL10 = legs.filter((l) => l.l10 != null);
console.log(`\nDataset: ${legs.length} deduped settled legs (public era May27–Jun1).`);
console.log(`  legs with a usable L10 (≥${MIN_GAMES} decisive recent games): ${withL10.length}/${legs.length} (${pct(withL10.length / legs.length)})`);
console.log(`  overall leg hit rate: ${rate(legs)}   |   with-L10 subset: ${rate(withL10)}`);

// ── leg hit rate by L10 bucket ──
console.log(`\nLEG hit rate by L10 bucket (does higher recent-form predict the leg?):`);
const buckets = [[0, 0.5, "<50%"], [0.5, 0.6, "50–59%"], [0.6, 0.7, "60–69%"], [0.7, 0.8, "70–79%"], [0.8, 1.001, "80–100%"]];
for (const [lo, hi, label] of buckets) {
  const rows = withL10.filter((l) => l.l10 >= lo && l.l10 < hi);
  if (rows.length) console.log(`  L10 ${label.padEnd(8)} n=${String(rows.length).padStart(3)}  ${rate(rows)}`);
}

// ── candidate availability + hit rate by threshold ──
console.log(`\nLEG candidate availability + hit rate by L10 threshold:`);
for (const t of [0.5, 0.6, 0.7, 0.8]) {
  const rows = withL10.filter((l) => l.l10 >= t);
  console.log(`  L10 ≥ ${pct(t)}  candidates=${String(rows.length).padStart(3)} (${pct(rows.length / legs.length)} of all legs)  hit ${rate(rows)}`);
}

// ── does L10 add signal BEYOND market-implied probability? ──
console.log(`\nL10 vs MARKET — within implied-probability bands, does high L10 add lift?`);
console.log(`  (if L10 only proxies the market, the two columns will match)`);
const impBands = [[0, 0.5, "implied <50%"], [0.5, 0.6, "implied 50–59%"], [0.6, 1.01, "implied ≥60%"]];
for (const [lo, hi, label] of impBands) {
  const band = withL10.filter((l) => l.imp != null && l.imp >= lo && l.imp < hi);
  if (!band.length) continue;
  const hiL10 = band.filter((l) => l.l10 >= 0.7);
  const loL10 = band.filter((l) => l.l10 < 0.7);
  console.log(`  ${label.padEnd(14)} n=${String(band.length).padStart(3)}  L10≥70%: ${rate(hiL10).padEnd(11)}  L10<70%: ${rate(loL10)}`);
}

// ── top markets by L10 effect ──
console.log(`\nLEG hit rate by market — L10≥70% vs L10<70% (markets with ≥8 L10 legs):`);
const byMarket = {};
for (const l of withL10) (byMarket[l.market] ??= []).push(l);
for (const [mkt, rows] of Object.entries(byMarket).sort((a, b) => b[1].length - a[1].length)) {
  if (rows.length < 8) continue;
  const hi = rows.filter((l) => l.l10 >= 0.7), lo = rows.filter((l) => l.l10 < 0.7);
  console.log(`  ${mkt.padEnd(24)} n=${String(rows.length).padStart(3)}  L10≥70%: ${rate(hi).padEnd(11)}  L10<70%: ${rate(lo)}`);
}

// ── slip-level: every leg clears the threshold ──
console.log(`\nSLIP hit rate when EVERY leg has L10 and all clear the threshold (Bank-Builder-style gate):`);
const decisiveSlips = slips.filter((s) => s.status === "win" || s.status === "loss");
console.log(`  decisive slips total: ${decisiveSlips.length}`);
for (const t of [0.5, 0.6, 0.7]) {
  const qualifying = decisiveSlips.filter((s) =>
    s.legs.length > 0 && s.legs.every((l) => l.rate != null && l.rate >= t),
  );
  const w = qualifying.filter((s) => s.status === "win").length;
  console.log(`  all legs L10 ≥ ${pct(t)}:  qualifying slips=${String(qualifying.length).padStart(3)}  hit ${qualifying.length ? `${w}/${qualifying.length}=${Math.round((w / qualifying.length) * 100)}%` : "—"}`);
}

console.log(`\n── READ ──`);
console.log(`  Small sample (≈${legs.length} legs / 5 days; fewer with L10). Read aggregates, not`);
console.log(`  single cells. This is SHADOW ONLY — no L10 gate is wired. Use it to decide`);
console.log(`  whether L10 is a hard filter, a display-only badge, or kept shadow.`);
console.log(`  No edgePct/confidence used. No performance claim. No fabricated data.`);
console.log("════════════════════════════════════════════════════════════════════");
