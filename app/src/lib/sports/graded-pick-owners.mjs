/**
 * THE GRADED-PICK OWNERS, READ ONCE (moved from scripts/sports/build-graded-picks.mjs, Results V2 · B-1).
 *
 * Each sport's full graded ledger, read into one uniform row: {eventId, when, subject, market, predicted,
 * actual, modelProbability, probabilityOfActual, marketProbabilityOfActual, hit} where hit is true / false /
 * null (void — a tie, a draw the market did not ask about, a push). The graded-picks builder and the Results V2
 * overview read the SAME rows, so the two cannot disagree about what was graded. IO only; no grading here.
 *
 * `appDir` is the Next app directory, `rootDir` the repository root (internal ledgers live there).
 */
import fs from "node:fs";
import path from "node:path";

export function makeGradedPickOwners({ appDir, rootDir }) {
  const APP = appDir;
  const ROOT = rootDir;
  /* The site's day is the ET day (Results V2 · B-1): a Monday Night Football kickoff at 00:15Z Tuesday is a
     MONDAY game. Slicing the UTC instant put it on the wrong day in every daily record. */
  const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const etDayOf = (iso, fallback) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : String(fallback ?? "").slice(0, 10); };
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
          when: r.kickoffUtc ? etDayOf(r.kickoffUtc, r.date) : String(r.date ?? "").slice(0, 10),
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
          when: etDayOf(e.kickoffUtc, f),
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

  return { ufcPicks, eplPicks, nflPicks, mlbPicks };
}
