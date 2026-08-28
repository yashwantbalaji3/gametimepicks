/**
 * NFL model DIFFERENTIATION audit (Program 178 · Release C). PRIVATE_RESEARCH.
 *
 * The founder's observation: two Friday games projected 19-19 and a third 19-18. Similar low
 * preseason scores can be legitimate, but repeated outputs demand evidence that the engine actually
 * consumes event-specific information — and if it does not, the honest move is to say so, not to
 * manufacture cosmetic differences.
 *
 * This audit answers the question PER MODEL HEAD rather than per game, because that is where the
 * truth turned out to live:
 *
 *   MARGIN / WIN  — driven by `marginMean = homeAdvantage + λ·(marginSlope · d)`, where d is the
 *                   cutoff-safe Elo difference between the two teams. Event-specific.
 *   TOTAL         — driven by `base.muTotal`, a single preseason scoring climatology CONSTANT.
 *                   Identical for every event. This is a declared SHARED PRIOR, not a bug, but
 *                   publishing it without saying so would let a reader believe the model has a
 *                   game-specific view of scoring that it does not have.
 *
 * So the report emits, for every weekend event: the full input fingerprint, the higher-precision
 * expected values behind the rounded scoreline, which heads varied, and — where a head is a shared
 * prior — an explicit LIMITED_INPUTS classification naming the missing adapter.
 *
 * Identical fingerprints across DISTINCT events would be a P0. Rounded ties are only acceptable
 * when the underlying distributions differ, which is checked numerically rather than asserted.
 *
 * Usage: node scripts/nfl/audit-nfl-differentiation.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/differentiation-<date>.json
 *         app/public/data/nfl/model-differentiation.json   (PUBLIC, reader-facing summary only)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const pub = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
if (!pub || !Array.isArray(pub.forecasts) || pub.forecasts.length === 0) {
  console.error("REFUSED: no published forecasts to audit — an audit of nothing is not a finding");
  process.exit(2);
}
const sig = read(path.join(ROOT, "data/internal/research/nfl/reports/signal-significance.json"));
const cal = read(path.join(ROOT, "data/internal/research/nfl/reports/public-beta-v1-calibration.json"));
const fit = read(path.join(ROOT, "data/internal/research/nfl/reports/preseason-model-v1-evaluation.json"))?.fit;
if (!cal || !fit) { console.error("REFUSED: the model's own calibration/fit is unreadable"); process.exit(2); }

// ── per-event fingerprints, straight off the published receipts ────────────────────────────────
const dir = path.join(ROOT, "data/internal/nfl/forecast-receipts", pub.date);
const receiptFor = (id) => {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const versions = files
    .map((f) => read(path.join(dir, f)))
    .filter((r) => r?.providerEventId === id && Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc))
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return versions[versions.length - 1] ?? null;
};

const events = pub.forecasts.map((f) => {
  const s = f.forecastSummary;
  return {
    canonicalEventId: `nfl-${f.providerEventId}`,
    matchup: f.matchup,
    kickoffUtc: f.kickoffUtc,
    // The fingerprint is the receipt's own input hash: everything the forecast depends on, hashed
    // by the generator itself. Deriving a second one here would just be a second opinion.
    inputHash: f.model.inputHash,
    engineVersion: `${f.model.id}@v${f.model.version}`,
    /*
     * Full precision where it exists. `winProbability.home` is rounded to four places for display,
     * which is NOT enough resolution to adjudicate a tie — see the generator's note beside
     * `homeUnrounded`. Falling back to the rounded value keeps older artifacts readable, and the
     * tie rule below refuses to call a P0 when that is all it has.
     */
    expected: {
      marginMean: s.margin.mean ?? s.margin.median,
      marginMedian: s.margin.median,
      totalMedian: s.total.median,
      winProbHome: s.winProbability.homeUnrounded ?? s.winProbability.home,
      winProbIsRounded: s.winProbability.homeUnrounded == null,
      projected: s.projectedScore,
    },
    intervals: { marginP10: s.margin.p10, marginP90: s.margin.p90, totalP10: s.total.p10, totalP90: s.total.p90 },
    receiptGeneratedAt: receiptFor(f.providerEventId)?.generatedAt ?? null,
  };
});

// ── P0 CHECK: distinct events must not share an input fingerprint ──────────────────────────────
const byHash = new Map();
for (const e of events) byHash.set(e.inputHash, [...(byHash.get(e.inputHash) ?? []), e.canonicalEventId]);
const collisions = [...byHash.entries()].filter(([, ids]) => ids.length > 1)
  .map(([hash, ids]) => ({ hash, events: ids }));

// ── PER-HEAD differentiation, measured rather than asserted ────────────────────────────────────
const spread = (xs) => (xs.length ? Number((Math.max(...xs) - Math.min(...xs)).toFixed(6)) : 0);
const distinct = (xs) => new Set(xs.map((x) => Number(x.toFixed(6)))).size;

const winProbs = events.map((e) => e.expected.winProbHome);
const margins = events.map((e) => e.expected.marginMean);
const totals = events.map((e) => e.expected.totalMedian);

const teamSignalApplied = sig?.significant === true;

const heads = [
  {
    head: "margin_and_win",
    driver: "marginMean = homeAdvantage + lambda * (marginSlope * d), where d is the cutoff-safe Elo difference between the two teams",
    // The gate, not the spread, decides this. Ten distinct win probabilities look like evidence and
    // are not: with the team term zeroed they are ten Monte Carlo draws around one common mean.
    // Reading that as differentiation is the same error the total head already taught us to avoid.
    eventSpecific: teamSignalApplied,
    observedVariationIsNoise: !teamSignalApplied,
    teamSignalState: sig?.significant ? "APPLIED" : "NOT_SIGNIFICANT",
    tStatistic: sig?.fitted?.tStatistic ?? null,
    distinctValues: distinct(winProbs),
    spread: spread(winProbs),
    classification: teamSignalApplied ? "EVENT_SPECIFIC" : "LIMITED_INPUTS",
    declaredSharedPrior: !teamSignalApplied,
    missingAdapter: teamSignalApplied ? undefined
      : "a team-strength signal that clears |t| >= 2 on preseason data. The current coefficient is t = " + (sig?.fitted?.tStatistic ?? "?") + " with a 95% interval spanning zero, so it is switched off rather than published as a direction.",
    reading: teamSignalApplied
      ? `win probability spans ${(Math.min(...winProbs) * 100).toFixed(2)}%-${(Math.max(...winProbs) * 100).toFixed(2)}% across ${events.length} events, so the engine is consuming team-specific evidence`
      : `the team-strength term is switched off because its coefficient is indistinguishable from zero, so the remaining ${(spread(winProbs) * 100).toFixed(2)}pp spread across ${events.length} events is simulation noise around one common mean, not a read on these teams`,
  },
  {
    head: "total",
    driver: "base.muTotal — a single preseason scoring climatology constant, identical for every event",
    // FALSE even though the published integers vary: a declared shared prior produces variation
    // from SIMULATION NOISE and integer rounding, never from evidence about these two teams.
    // Reading that noise as differentiation is precisely the mistake this audit exists to prevent,
    // and an earlier draft of this script made it — reporting FULLY_EVENT_SPECIFIC over a head it
    // had itself classified LIMITED_INPUTS.
    eventSpecific: false,
    observedVariationIsNoise: true,
    distinctValues: distinct(totals),
    spread: spread(totals),
    // A shared prior is DECLARED here, not discovered by a reader from repeated numbers.
    classification: "LIMITED_INPUTS",
    declaredSharedPrior: true,
    missingAdapter:
      "no per-team offensive/defensive scoring-rate adapter exists. The preseason corpus carries final scores, so one is buildable — but it must clear a preregistered bar on held-out preseason before it is allowed to move a published total.",
    reading:
      "the model has NO game-specific view of scoring. Every event draws its total from the same league prior, so any variation a reader sees between published totals is simulation noise and integer rounding, not a claim about these two teams.",
  },
];

// ── ROUNDED TIES: legitimate only when the underlying distributions differ ─────────────────────
const scoreKey = (e) => `${e.expected.projected.away}-${e.expected.projected.home}`;
const tieGroups = [...events.reduce((m, e) => m.set(scoreKey(e), [...(m.get(scoreKey(e)) ?? []), e]), new Map()).entries()]
  .filter(([, g]) => g.length > 1)
  .map(([score, g]) => {
    const ws = g.map((e) => e.expected.winProbHome);
    const differ = distinct(ws) === ws.length;
    /*
     * A P0 here is a claim that two events produced the SAME distribution. Making that claim from a
     * display-rounded number is making it from evidence that cannot support it — the tie may BE the
     * rounding, which is exactly the distinction this group exists to draw one level up.
     *
     * On 2026-08-28 it raised a P0 on ATL @ MIA and ARI @ GB for both landing on 0.4585. The slate's
     * win probabilities span about 0.012; four decimal places divide that into roughly a hundred
     * buckets, so two of twelve draws colliding is close to a coin flip. The audit had no way to
     * tell that from the defect it is named for.
     *
     * An unproven tie is not waved through: it names the events, says what its input hashes show,
     * and says exactly what would settle it.
     */
    const roundedOnly = g.some((e) => e.expected.winProbIsRounded);
    // `distinct` is numeric (it rounds to six places); input hashes are strings and need their own.
    const inputsDiffer = new Set(g.map((e) => String(e.inputHash))).size === g.length;
    return {
      roundedScore: score,
      events: g.map((e) => e.matchup),
      underlyingWinProbabilities: ws.map((w) => Number((w * 100).toFixed(2))),
      distributionsDiffer: differ,
      precision: roundedOnly ? "DISPLAY_ROUNDED" : "FULL",
      verdict: differ
        ? "LEGITIMATE — the same rounded scoreline sits on top of distinct distributions; integer football scores are a coarse view of a continuous margin"
        : roundedOnly
          ? `UNPROVEN — these share a display-rounded win probability, which cannot distinguish an identical distribution from an identical rounding.${inputsDiffer ? " Their input hashes DIFFER, so the model did read different events." : " Their input hashes also match, which IS a defect and is reported separately as IDENTICAL_FINGERPRINT."} Regenerate with winProbability.homeUnrounded to settle it.`
          : "P0 — two distinct events produced an identical distribution, not merely an identical rounding",
    };
  });

const p0 = [
  ...collisions.map((c) => ({ id: "IDENTICAL_FINGERPRINT", detail: `${c.events.join(", ")} share input hash ${c.hash}` })),
  // Only a tie proven at FULL precision is a P0. An UNPROVEN tie is reported and surfaced, never a
  // defect the run dies on — a guard must assert what it can actually show.
  ...tieGroups.filter((t) => !t.distributionsDiffer && t.precision === "FULL").map((t) => ({ id: "IDENTICAL_DISTRIBUTION", detail: `${t.events.join(", ")} at ${t.roundedScore}` })),
];

const report = {
  schemaVersion: 1,
  artifact: "nfl-model-differentiation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  slateDate: pub.date,
  eventCount: events.length,
  engineVersion: `${pub.model.id}@v${pub.model.version}`,
  config: { lambda: cal.calibration.signalShrinkLambda, sigmaMargin: cal.calibration.sigmaMarginCalibrated, sigmaTotal: cal.calibration.sigmaTotalCalibrated, muTotal: fit.muTotal, homeAdvantage: fit.homeAdvantage, marginSlope: fit.marginSlope },
  heads,
  events,
  fingerprintCollisions: collisions,
  roundedTies: tieGroups,
  p0,
  // Derived from CLASSIFICATION, never from whether the numbers happened to differ. A verdict that
  // could disagree with its own per-head classification is not a verdict, it is a coin flip.
  verdict: p0.length > 0
    ? "P0_DEFECT"
    : heads.every((h) => h.classification === "EVENT_SPECIFIC")
      ? "FULLY_EVENT_SPECIFIC"
      : heads.some((h) => h.classification === "EVENT_SPECIFIC")
        ? "PARTIALLY_EVENT_SPECIFIC"
        // Every head is a declared shared prior. This is a real and publishable state: the model
        // produces a calibrated distribution from league-wide preseason context, and says plainly
        // that it cannot tell these particular teams apart.
        : "NO_EVENT_SPECIFIC_SIGNAL",
};

const outDir = path.join(ROOT, "data/internal/research/nfl/reports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `differentiation-${pub.date}.json`), JSON.stringify(report, null, 2) + "\n");

// ── PUBLIC summary: the limitation in words, no research payload ───────────────────────────────
const publicSummary = {
  schemaVersion: 1,
  artifact: "nfl-model-differentiation-public",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  slateDate: pub.date,
  headline: heads.every((h) => h.classification === "EVENT_SPECIFIC")
    ? "Every part of this model reacts to the specific teams playing."
    : heads.some((h) => h.classification === "EVENT_SPECIFIC")
      ? "Part of this model reacts to the specific teams playing, and part of it does not."
      : "This model does not currently tell these teams apart — and we would rather say so than pretend otherwise.",
  heads: heads.map((h) => ({
    head: h.head === "margin_and_win" ? "Who wins, and by how much" : "How many points are scored",
    state: h.classification,
    plainEnglish: h.head === "margin_and_win"
      ? (teamSignalApplied
          ? `This part uses each team's own strength, so it differs from game to game — across this slate our win percentages range from ${(Math.min(...winProbs) * 100).toFixed(1)}% to ${(Math.max(...winProbs) * 100).toFixed(1)}%.`
          : "We tested whether this model can tell which of two preseason teams is better, and it cannot — the measurement is indistinguishable from no effect at all. So we switched that part off rather than publish a favourite we cannot justify. The small differences you see between games are the simulation's own randomness, not a view on the teams.")
      : "This part does NOT look at the two teams. Every game draws its point total from the same preseason average, so if two games show a similar total that is not a claim about those teams — it is the same starting number in both.",
  })),
  whyGamesLookAlike:
    "Preseason games on this slate look similar to each other because, right now, this model genuinely cannot tell them apart. Scoring comes from one league-wide preseason average, and the team-strength input was measured and found to carry no usable signal, so it is switched off. Similar-looking numbers are the honest output of a model that knows very little — not a coincidence, and not a bug.",
  whatWeFoundAndFixed:
    "An earlier version of this page applied the team-strength input anyway. Because the measured effect pointed slightly the wrong way, it was quietly favouring the WEAKER side in every game. We caught it, tested the input properly, and switched it off.",
  whatWouldChangeIt:
    "A per-team scoring adapter built from the preseason corpus, which would have to beat a preregistered bar on a season it had never seen before it is allowed to move a published total.",
};
fs.writeFileSync(path.join(APP, "public/data/nfl/model-differentiation.json"), JSON.stringify(publicSummary, null, 2) + "\n");

console.log(`nfl differentiation: ${report.verdict} · ${events.length} events · ${collisions.length} fingerprint collisions · ${tieGroups.length} rounded-tie groups · ${p0.length} P0`);
for (const h of heads) console.log(`  ${h.head}: ${h.classification} (${h.distinctValues} distinct, spread ${h.spread})`);
if (p0.length) { for (const d of p0) console.error(`  P0 ${d.id}: ${d.detail}`); process.exit(3); }
