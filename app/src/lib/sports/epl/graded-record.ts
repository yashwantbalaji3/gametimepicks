/**
 * THE EPL GRADED RECORD — the ONE reader for what has actually been checked against a result.
 *
 * /epl asserted `Matches graded: 0 · no track record yet` as a hard-coded literal. That was true
 * when it was written and stopped being true on 2026-08-21, when Arsenal v Coventry City became the
 * first Premier League match this project has ever graded. A page that states a count it does not
 * read is a page that will eventually state a false one, so the count is now derived from the
 * append-only ledgers the settler writes and from nothing else.
 *
 * WHAT A RECORD IS NOT. A count of graded matches is not an accuracy claim, and this module is
 * careful not to let one be read as the other. Accuracy is assessed at the CALIBRATION stage — a
 * preregistered backtest against settled results, held to the same bar MLB was — and that stage is
 * UNPROVEN for this sport. So `sampleState` exists to force the caller to say how little a small
 * sample means, rather than leaving a reader to infer significance from a bare number. One match
 * that hit is one match that hit.
 *
 * FAIL-CLOSED. An unreadable ledger returns ABSENT, never a confident zero. "Nothing has been
 * graded" and "we could not read the record" are different facts and only one of them is a product
 * state — the same rule the forecast and projection loaders follow.
 */
import fs from "node:fs";
import path from "node:path";

const TEAM_LEDGER = "public/data/soccer/epl/results/graded-forecasts.jsonl";
const PLAYER_LEDGER = "public/data/soccer/epl/results/graded-player-projections.jsonl";

/**
 * How much the numbers below are allowed to mean.
 *
 * The boundary is deliberately high. Twenty graded matches is still far short of what the
 * calibration stage requires; it is the point at which a mean stops being an anecdote, not the point
 * at which the model has been validated. Nothing here ever reports a state that implies validation,
 * because no count on this page could earn one.
 */
export type EplSampleState = "ABSENT" | "NONE" | "TOO_SMALL_TO_ASSESS" | "ACCUMULATING";

export interface EplGradedMatch {
  eventId: string;
  matchup: string;
  kickoffUtc: string;
  /** Final score as recorded by the official source the settler read. */
  actual: { homeGoalsFT: number; awayGoalsFT: number; outcome: string; totalGoals: number } | null;
  /** The probability the model gave the outcome that actually happened. */
  probabilityOfActual: number | null;
  hit: boolean | null;
  predictedOutcome: string | null;
}

export interface EplGradedRecord {
  sampleState: EplSampleState;
  team: {
    matches: number;
    hits: number;
    /** Mean log loss across graded matches. Null below any graded match — never 0. */
    meanLogLoss: number | null;
    meanBrier: number | null;
    matchesList: EplGradedMatch[];
  };
  player: {
    rows: number;
    voided: number;
    hits: number;
    meanLogLoss: number | null;
    meanBrier: number | null;
    /** Distinct markets that have contributed at least one graded row. */
    markets: string[];
  };
}

/** One JSON object per line, blank lines skipped. A malformed line is DROPPED, never guessed at. */
function readJsonl(rel: string): Record<string, unknown>[] | null {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const out: Record<string, unknown>[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { /* a torn append is not a record */ }
    }
    return out;
  } catch {
    return null;
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function loadEplGradedRecord(): EplGradedRecord | null {
  const teamRows = readJsonl(TEAM_LEDGER);
  const playerRows = readJsonl(PLAYER_LEDGER);
  // Neither ledger readable at all: ABSENT. A settler that has never run leaves no file, and that is
  // genuinely indistinguishable from a broken read at this layer — so it is reported as unknown
  // rather than as zero, and the caller renders the uncertainty.
  if (teamRows == null && playerRows == null) return null;

  const team = teamRows ?? [];
  const player = playerRows ?? [];

  const teamLogLoss = team.map((r) => num((r.scores as Record<string, unknown>)?.logLoss)).filter((n): n is number => n != null);
  const teamBrier = team.map((r) => num((r.scores as Record<string, unknown>)?.brier)).filter((n): n is number => n != null);

  /*
   * A VOIDED player row is one whose condition did not hold — the player did not take the field the
   * projection was conditioned on. It is excluded from every mean rather than scored as a miss,
   * which is the whole reason conditional projections are honest to publish at all.
   *
   * READ THE LEDGER'S OWN VOCABULARY. The first version of this looked for a boolean `voided` field,
   * which does not exist: the settler writes `outcome` as HIT / MISS / VOID. It reported 0 voids
   * against 18 real ones and was only saved from reporting a wrong GRADED count by coincidence.
   * Guessing at a shape rather than reading it is the same defect that had the grader re-parsing the
   * results artifact instead of using the identity bridge that already existed.
   *
   * An outcome outside the known vocabulary is counted as NEITHER graded nor void. A row whose
   * meaning is unrecognised must not be silently folded into a published mean.
   */
  const outcomeOf = (r: Record<string, unknown>) => String(r.outcome ?? "");
  const graded = player.filter((r) => outcomeOf(r) === "HIT" || outcomeOf(r) === "MISS");
  const voided = player.filter((r) => outcomeOf(r) === "VOID").length;
  const pHit = player.filter((r) => outcomeOf(r) === "HIT").length;
  const pLogLoss = graded.map((r) => num((r.scores as Record<string, unknown>)?.logLoss)).filter((n): n is number => n != null);
  const pBrier = graded.map((r) => num((r.scores as Record<string, unknown>)?.brier)).filter((n): n is number => n != null);

  const matches = team.length;
  const sampleState: EplSampleState = matches === 0 ? "NONE" : matches < 20 ? "TOO_SMALL_TO_ASSESS" : "ACCUMULATING";

  return {
    sampleState,
    team: {
      matches,
      hits: team.filter((r) => (r.scores as Record<string, unknown>)?.hit === true).length,
      meanLogLoss: mean(teamLogLoss),
      meanBrier: mean(teamBrier),
      matchesList: team.map((r) => ({
        eventId: String(r.eventId ?? ""),
        matchup: String(r.matchup ?? ""),
        kickoffUtc: String(r.kickoffUtc ?? ""),
        actual: (r.actual as EplGradedMatch["actual"]) ?? null,
        probabilityOfActual: num((r.scores as Record<string, unknown>)?.probabilityOfActual),
        hit: ((r.scores as Record<string, unknown>)?.hit as boolean | undefined) ?? null,
        predictedOutcome: ((r.scores as Record<string, unknown>)?.predictedOutcome as string | undefined) ?? null,
      })),
    },
    player: {
      rows: graded.length,
      voided,
      hits: pHit,
      meanLogLoss: mean(pLogLoss),
      meanBrier: mean(pBrier),
      markets: [...new Set(player.map((r) => String(r.market ?? "")).filter(Boolean))].sort(),
    },
  };
}

/**
 * The sub-caption beside the count. Written here rather than at the call site so every surface says
 * the same thing about the same sample, and so the small-sample warning cannot be dropped by a page
 * that wants a tidier hero.
 */
export function gradedRecordCaption(rec: EplGradedRecord | null): string {
  if (rec == null) return "record unreadable";
  switch (rec.sampleState) {
    case "NONE": return "no track record yet";
    case "TOO_SMALL_TO_ASSESS":
      return rec.team.matches === 1 ? "one match — far too few to judge accuracy" : "far too few to judge accuracy";
    default: return "a running record, not a validation";
  }
}
