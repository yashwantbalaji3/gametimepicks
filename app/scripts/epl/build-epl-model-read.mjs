/**
 * WHAT THE MODEL ACTUALLY THINKS — every fixture, beside the price it is standing next to.
 *
 * ── WHY THIS IS PRIVATE ─────────────────────────────────────────────────────────────────────────
 * Two independent reasons, either of which alone would be enough.
 *
 * 1. THE COMPARISON IS DERIVED FROM PAID DATA. The no-vig probabilities come from an authorised
 *    odds capture. Captures never reach a public artifact, and a figure computed from one is still
 *    computed from one.
 *
 * 2. THE MODEL HAS NEVER BEEN SHOWN TO BE RIGHT. Its calibration stage is UNPROVEN: ZERO matches
 *    have ever been scored against a no-vig price. Publishing "where the model disagrees with the
 *    market" to a reader is, in effect, publishing a pick — and this model's disagreements are
 *    currently dominated by fixtures it knows nothing about. On 2026-08-21 it read Hull City at
 *    42.2% at home to Manchester United against a market price of 10.6%, not because it saw
 *    something but because Hull are newly promoted and it had no history for them at all.
 *
 * So this is an OPERATOR view. It answers "what does the model say, and how far is that from the
 * price" for someone who already knows the model is unvalidated — which is exactly the question the
 * learning loop will answer with evidence once matches accumulate.
 *
 * ── WHAT IT REFUSES TO EMIT ─────────────────────────────────────────────────────────────────────
 * No pick, no lean, no edge, no confidence, no rating, no stake, no ordering by "opportunity". A
 * disagreement is reported as a DIFFERENCE, signed and in percentage points, and the largest
 * differences are the ones the model is least entitled to — which the cold-start flag says on the
 * row rather than in a footnote.
 *
 * Usage: npx tsx scripts/epl/build-epl-model-read.mjs --now <iso> [--write]
 * Writes: data/internal/research/epl/model-read/latest.json (PRIVATE)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const WRITE = process.argv.includes("--write");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/* The PRIVATE forecast: it is the only copy carrying the market block. */
const forecasts = read(path.join(REPO, "data/internal/research/epl/forecasts/latest.json"));
if (!forecasts?.rows) { console.error("REFUSED: no private forecast set to read"); process.exit(1); }

/** De-vigged market probabilities, mapped by club rather than by position. Null on any ambiguity. */
function marketProbs(row) {
  const noVig = row?.market?.noVig;
  if (!Array.isArray(noVig) || noVig.length !== 3) return null;
  const fold = (x) => String(x ?? "").toLowerCase().trim();
  const home = fold(row.homeClub), away = fold(row.awayClub);
  let h = null, d = null, a = null;
  for (const o of noVig) {
    const n = fold(o?.name), p = Number(o?.prob);
    if (!Number.isFinite(p)) return null;
    if (n === "draw") d = p; else if (n === home) h = p; else if (n === away) a = p; else return null;
  }
  return h != null && d != null && a != null ? { home: h, draw: d, away: a } : null;
}

const pp = (x) => Number((x * 100).toFixed(1));
const rows = [];
for (const r of forecasts.rows) {
  if (r.state !== "CURRENT_PRE_EVENT" || !r.model?.probs) continue;
  const m = r.model.probs;
  const k = marketProbs(r);
  const cold = Boolean(r.model?.coldStart?.home || r.model?.coldStart?.away);
  const diff = k ? { home: pp(m.home - k.home), draw: pp(m.draw - k.draw), away: pp(m.away - k.away) } : null;
  /* The single largest signed disagreement, for ordering an operator's attention — NOT a selection. */
  const widest = diff ? Object.entries(diff).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] : null;
  rows.push({
    eventId: r.eventId, matchup: r.matchup, kickoffUtc: r.kickoffUtc,
    coldStart: cold,
    model: { home: pp(m.home), draw: pp(m.draw), away: pp(m.away), expectedGoals: r.model?.totals?.expected ?? null },
    market: k ? { home: pp(k.home), draw: pp(k.draw), away: pp(k.away) } : null,
    differencePoints: diff,
    widestDisagreement: widest ? { outcome: widest[0], points: widest[1] } : null,
    /* What the model's own distribution peaks on. NOT a recommendation — the word is deliberate. */
    modelHighestOutcome: m.home >= m.draw && m.home >= m.away ? "home" : m.draw >= m.away ? "draw" : "away",
    marketHighestOutcome: k ? (k.home >= k.draw && k.home >= k.away ? "home" : k.draw >= k.away ? "draw" : "away") : null,
  });
}
rows.sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));

const withMarket = rows.filter((r) => r.market);
const agree = withMarket.filter((r) => r.modelHighestOutcome === r.marketHighestOutcome).length;

const out = {
  schemaVersion: 1,
  artifact: "epl-model-read",
  dataClass: "INTERNAL_RESEARCH",
  public: false,
  generatedAt: NOW,
  forecastGeneratedAt: forecasts.generatedAt,
  validation: "NOT_VALIDATED_OUT_OF_SAMPLE — zero matches have been scored against a no-vig price",
  /*
   * Stated POSITIVELY, on purpose. The first version listed the vocabulary it was refusing to emit —
   * and naming those words inside the artifact is how a disclaimer becomes the thing it disclaims,
   * which the lane's own copy guard catches and is right to. Saying what a number IS leaves less
   * room than saying what it is not.
   */
  note: "An operator view. Every figure is a probability or a signed difference in percentage points, " +
        "and nothing here is ordered by opportunity or marked for action. A cold-start fixture's " +
        "disagreement reflects the model having no history for a promoted club, not a view about the match.",
  counts: { fixtures: rows.length, withMarket: withMarket.length, agreeOnHighest: agree, disagreeOnHighest: withMarket.length - agree },
  rows,
};

console.log(`\nEPL MODEL READ · forecast ${forecasts.generatedAt}`);
console.log(`${rows.length} fixture(s) · ${withMarket.length} with a market · model and market peak on the same outcome in ${agree}/${withMarket.length}\n`);
console.log("fixture                                     model H/D/A        market H/D/A       widest diff   cold");
console.log("-".repeat(104));
for (const r of rows) {
  const mo = `${String(r.model.home).padStart(5)}/${String(r.model.draw).padStart(5)}/${String(r.model.away).padStart(5)}`;
  const mk = r.market ? `${String(r.market.home).padStart(5)}/${String(r.market.draw).padStart(5)}/${String(r.market.away).padStart(5)}` : "      no market      ";
  const w = r.widestDisagreement ? `${r.widestDisagreement.outcome} ${r.widestDisagreement.points > 0 ? "+" : ""}${r.widestDisagreement.points}pp` : "—";
  console.log(`${r.matchup.slice(0, 42).padEnd(43)} ${mo}   ${mk}   ${w.padEnd(13)} ${r.coldStart ? "COLD" : ""}`);
}
console.log("\nZero matches have ever been scored against a no-vig price, so no disagreement above is");
console.log("evidence of anything. The widest ones belong to clubs the model has no history for at all.");

if (!WRITE) { console.log("\ndry run — pass --write to persist."); process.exit(0); }
const dir = path.join(REPO, "data/internal/research/epl/model-read");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log("\nwrote data/internal/research/epl/model-read/latest.json");
