/**
 * Premier League and Ligue 1 method-card facts for /methodology (2026-10-05).
 *
 * Every count comes from the committed artifact Soccer named for it (method notes,
 * /mnt/project-files/soccer/METHOD_NOTES_EPL_LIGUE1_2026-10-05.md), read at build time, so the cards move after
 * every matchday with no hand edit. A missing artifact yields null and the card says the count is unavailable;
 * nothing is filled in. Wording rule from Soccer: facts and counts only, never "validated".
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data", "soccer");

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")) as T;
  } catch {
    return null;
  }
}

export interface EplFacts {
  matchGradedCurrent: number | null;
  matchGradedPrior: number | null;
  matchGradedTotal: number | null;
  playerHoldoutN: number | null;
  scorer: { hit: number; miss: number; void: number } | null;
  shot: { hit: number; miss: number; void: number } | null;
}

export interface Ligue1Facts {
  holdoutSeason: string | null;
  holdoutMatches: number | null;
  holdoutLogLoss: number | null;
  holdoutBaseline: number | null;
  graded: number | null;
  gradedLogLoss: number | null;
  uniformLogLoss: number | null;
  tooSmall: boolean;
}

export function eplFacts(): EplFacts {
  const f = readJson<{ gradedRecord?: { gradedUnderThisModel?: number; priorModels?: { graded?: number }[]; ledgerTotal?: number } }>(
    "epl/forecasts/latest.json",
  );
  const p = readJson<{ validation?: { holdout?: { n?: number } } }>("epl/player-projections/latest.json");
  const tally = (market: string) => ({ market, hit: 0, miss: 0, void: 0 });
  const scorer = tally("anytime_goalscorer");
  const shot = tally("shots_on_goal_over_0_5");
  let graded = false;
  try {
    const text = fs.readFileSync(path.join(DATA, "epl/results/graded-player-projections.jsonl"), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { market?: string; outcome?: string };
      const t = r.market === scorer.market ? scorer : r.market === shot.market ? shot : null;
      if (!t) continue;
      graded = true;
      if (r.outcome === "HIT") t.hit += 1;
      else if (r.outcome === "MISS") t.miss += 1;
      else if (r.outcome === "VOID") t.void += 1;
    }
  } catch {
    graded = false;
  }
  const strip = ({ hit, miss, void: v }: { hit: number; miss: number; void: number }) => ({ hit, miss, void: v });
  return {
    matchGradedCurrent: f?.gradedRecord?.gradedUnderThisModel ?? null,
    matchGradedPrior: f?.gradedRecord?.priorModels ? f.gradedRecord.priorModels.reduce((s, m) => s + (m.graded ?? 0), 0) : null,
    matchGradedTotal: f?.gradedRecord?.ledgerTotal ?? null,
    playerHoldoutN: p?.validation?.holdout?.n ?? null,
    scorer: graded ? strip(scorer) : null,
    shot: graded ? strip(shot) : null,
  };
}

export function ligue1Facts(): Ligue1Facts {
  const v = readJson<{ validation?: { holdout?: { season?: string; matches?: number; logLoss?: number; empiricalLogLoss?: number } } }>(
    "ligue-1/forecasts/latest.json",
  );
  const g = readJson<{ summary?: { matches?: number; logLoss?: number; uniformLogLoss?: number; sampleState?: string } }>("ligue-1/results/graded.json");
  return {
    holdoutSeason: v?.validation?.holdout?.season ?? null,
    holdoutMatches: v?.validation?.holdout?.matches ?? null,
    holdoutLogLoss: v?.validation?.holdout?.logLoss ?? null,
    holdoutBaseline: v?.validation?.holdout?.empiricalLogLoss ?? null,
    graded: g?.summary?.matches ?? null,
    gradedLogLoss: g?.summary?.logLoss ?? null,
    uniformLogLoss: g?.summary?.uniformLogLoss ?? null,
    tooSmall: g?.summary?.sampleState !== "ACCUMULATING", // grading.mjs: NONE → TOO_SMALL_TO_ASSESS (< 20) → ACCUMULATING
  };
}

/** A count for reader copy: the number with separators, or an honest "not available". */
export const n = (x: number | null) => (x == null ? "not available" : x.toLocaleString("en-US"));
