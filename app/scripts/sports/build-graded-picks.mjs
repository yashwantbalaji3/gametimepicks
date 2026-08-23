/**
 * Publish one "model picks vs actual outcomes" artifact per sport, from each sport's own graded
 * ledger, in the single shape every surface renders.
 *
 * Writes public/data/<sport>/graded-picks.json.
 *
 * FOUR SOURCES, FOUR SHAPES, ONE CONTRACT. Each adapter below reads the ledger that sport already
 * maintains and translates it — nothing is re-graded here, and no outcome is derived. If a sport's
 * ledger says a pick missed, this says it missed. That matters because a translation layer that
 * recomputed anything would be a second opinion about a settled result, and settled results have
 * exactly one source per sport.
 *
 * WHAT EACH SPORT'S RECORD ACTUALLY IS differs, and the difference is carried on the artifact rather
 * than flattened away:
 *   · MLB is a MODEL-PERFORMANCE ledger over player props, independent of the paper bankroll — it
 *     shares no rows with the 19-14 money record and must never be read as one.
 *   · NFL is EXPERIMENTAL preseason forecasting. The team model is not promoted, and its own model
 *     card says so.
 *   · UFC is the fight model's winner head, the one model here that cleared a preregistered bar.
 *   · EPL is a model that has cleared nothing and is published as distributions, not picks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGradedRecord } from "../../src/lib/sports/graded-picks.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WRITE = process.argv.includes("--write");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const readJsonl = (p) => {
  try {
    return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }
};

/* ── UFC ───────────────────────────────────────────────────────────────────────────────────────
 * The model-vs-market ledger: the model's winner pick, its probability, and who actually won. It
 * also carries the de-vigged market probability for the same bout, which no other sport has, so the
 * market column is published here and simply absent elsewhere rather than faked. */
function ufcPicks() {
  const rows = readJsonl(path.join(ROOT, "data/internal/research/ufc/model-vs-market/graded.jsonl")) ?? [];
  return rows
    .sort((a, b) => String(b.eventDate).localeCompare(String(a.eventDate)))
    .map((r) => ({
      eventId: r.boutId,
      when: r.eventDate,
      eventName: r.eventName ?? null,
      subject: `${r.pick} vs ${r.opponent}`,
      market: "Fight winner",
      predicted: r.pick,
      actual: r.winner ?? null,
      modelProbability: r.modelProbability ?? null,
      probabilityOfActual: r.model?.probabilityOfActual ?? null,
      marketProbabilityOfActual: r.market?.probabilityOfActual ?? null,
      hit: typeof r.hit === "boolean" ? r.hit : null,
    }));
}

/* ── EPL ───────────────────────────────────────────────────────────────────────────────────────
 * matchesList carries the model's predicted outcome, the actual score, and the probability it gave
 * to what actually happened. Home/draw/away are rendered as words here; the letters are the
 * ledger's own vocabulary and mean nothing to a reader. */
const EPL_OUTCOME = { H: "home win", D: "draw", A: "away win" };
function eplPicks() {
  // The same ledger loadEplGradedRecord reads, so /epl's own "graded so far" count and this record
  // cannot disagree about how many matches have been graded.
  const rows = readJsonl(path.join(APP, "public/data/soccer/epl/results/graded-forecasts.jsonl"));
  if (!rows) return null;
  return rows
    .sort((a, b) => String(b.kickoffUtc ?? b.date).localeCompare(String(a.kickoffUtc ?? a.date)))
    .map((r) => {
      /*
       * The ledger nests its grading under `scores`, which the first version of this adapter missed
       * — it read r.predictedOutcome, found undefined, and reported all seven graded matches as
       * VOID. Seven voids and zero graded is exactly what "the model has never been scored" looks
       * like, so the bug would have published a false absence rather than an obvious error.
       */
      const actual = r.actual?.outcome ?? null;
      const predicted = r.scores?.predictedOutcome ?? null;
      return {
        eventId: r.eventId ?? r.canonicalEventId ?? null,
        when: String(r.kickoffUtc ?? r.date ?? "").slice(0, 10),
        eventName: r.matchweek != null ? `Matchweek ${r.matchweek}` : null,
        subject: r.matchup ?? null,
        market: "Match result",
        predicted: EPL_OUTCOME[predicted] ?? predicted,
        actual: r.actual ? `${EPL_OUTCOME[actual] ?? actual} (${r.actual.homeGoalsFT}-${r.actual.awayGoalsFT})` : (EPL_OUTCOME[actual] ?? actual),
        // The probability the model gave to its OWN pick — the same field every other sport fills,
        // reconstructed from the published distribution rather than left null.
        modelProbability: r.forecast?.probs
          ? (predicted === "H" ? r.forecast.probs.home : predicted === "D" ? r.forecast.probs.draw : r.forecast.probs.away) ?? null
          : null,
        probabilityOfActual: r.scores?.probabilityOfActual ?? null,
        marketProbabilityOfActual: null,
        hit: typeof r.scores?.hit === "boolean" ? r.scores.hit : (predicted && actual ? predicted === actual : null),
      };
    });
}

/* ── NFL ───────────────────────────────────────────────────────────────────────────────────────
 * Dated experimental-settlement files, each holding graded forecasts. A TIE is recorded as a void,
 * not a miss: the model answered "who wins" and the game produced no winner — the same rule UFC
 * applies to a draw. */
function nflPicks() {
  const dir = path.join(ROOT, "data/internal/nfl/experimental-settlement");
  if (!fs.existsSync(dir)) return null;
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse()) {
    for (const e of readJson(path.join(dir, f))?.events ?? []) {
      const g = e.grade ?? {};
      out.push({
        eventId: e.canonicalEventId ?? null,
        when: String(e.kickoffUtc ?? f).slice(0, 10),
        eventName: null,
        subject: e.matchup ?? null,
        market: "Winner",
        predicted: g.winner?.modelFavoured ?? null,
        actual: g.actual?.tie ? "tie" : (g.winner?.outcome ?? null),
        modelProbability: null,
        probabilityOfActual: g.probabilistic?.brier != null && g.probabilistic?.logLoss != null
          ? Number(Math.exp(-g.probabilistic.logLoss).toFixed(4)) : null,
        marketProbabilityOfActual: null,
        // A tie is not a loss. It is a question the model was not asked and could not answer.
        hit: g.actual?.tie ? null : (typeof g.winner?.correct === "boolean" ? g.winner.correct : null),
      });
    }
  }
  return out;
}

/* ── MLB ───────────────────────────────────────────────────────────────────────────────────────
 * The settled-leans validation ledger: 30k+ graded player-prop projections. This is a MODEL
 * ledger and shares no row with the paper bankroll. Only rows the pipeline marked graded are read,
 * and a Push is a void rather than either result. */
function mlbPicks() {
  const rows = readJsonl(path.join(ROOT, "pipeline/validation/mlb_settled_leans.jsonl"));
  if (!rows) return null;
  return rows
    .filter((r) => r.graded)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((r) => {
      const outcome = String(r.outcome ?? "").toLowerCase();
      const over = String(r.lean ?? "").toLowerCase() === "over";
      return {
        eventId: r.id ?? null,
        when: r.date ?? null,
        eventName: null,
        subject: `${r.playerName} · ${r.playerTeamAbbr} v ${r.opponentAbbr}`,
        market: `${r.marketLabel} ${r.lean} ${r.line}`,
        predicted: `${r.lean} ${r.line}`,
        actual: r.actual != null ? String(r.actual) : null,
        modelProbability: over ? r.modelProbOver ?? null : r.modelProbUnder ?? null,
        probabilityOfActual: null,
        marketProbabilityOfActual: null,
        hit: outcome === "win" ? true : outcome === "loss" ? false : null,   // a Push is a void
      };
    });
}

const SPORTS = [
  { sport: "mlb", label: "MLB", picks: mlbPicks, shown: 60,
    what: "Player-prop projections: the model's over/under lean against the book's line, graded from the official box score.",
    caveat: "A model-performance record, independent of the paper bankroll. It shares no row with the settled money record on /results." },
  { sport: "nfl", label: "NFL", picks: nflPicks, shown: 60,
    what: "Preseason game forecasts: which side the model favoured, graded against the official final.",
    caveat: "EXPERIMENTAL. The NFL team model has not cleared a preregistered bar and is not promoted into any paper product. A tie is recorded as void, not a miss." },
  { sport: "ufc", label: "UFC", picks: ufcPicks, shown: 60,
    what: "Fight-winner picks: the model's chosen fighter and its probability, graded against the official result.",
    caveat: "The market's own de-vigged probability for the same bout is shown alongside. This is the only sport here where the two are recorded together." },
  { sport: "epl", label: "Premier League", picks: eplPicks, shown: 60,
    what: "Match-result forecasts: the outcome the model gave the most probability to, graded against the official full-time score.",
    caveat: "This model has cleared no preregistered bar and publishes distributions rather than picks — the 'predicted' column is simply its likeliest outcome." },
];

let wrote = 0;
for (const s of SPORTS) {
  const picks = s.picks();
  if (picks == null) { console.log(`${s.sport}: no graded ledger on disk — nothing published (not a zero)`); continue; }
  const record = buildGradedRecord({ sport: s.sport, label: s.label, picks, shown: s.shown, what: s.what, caveat: s.caveat });
  const artifact = {
    schemaVersion: 1, artifact: "graded-picks", dataClass: "PUBLIC_DERIVED", moneyClass: "NON_MONEY",
    generatedAt: NOW, ...record,
  };
  const out = path.join(APP, "public", "data", s.sport, "graded-picks.json");
  console.log(`${s.sport}: ${record.counts.counted} graded · ${record.counts.hits} hit · ${record.counts.voided} void · ${record.sampleState}`);
  if (WRITE) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(artifact, null, 1) + "\n"); wrote += 1; }
}
console.log(WRITE ? `wrote ${wrote} artifact(s)` : "dry run — pass --write to publish");
