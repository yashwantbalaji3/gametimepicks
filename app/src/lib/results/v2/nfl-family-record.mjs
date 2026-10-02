/**
 * RESULTS / TRACKING V2 · FIRST VERTICAL SLICE — NFL, BY PROP FAMILY, SEASON TO DATE (Session 5 · B7).
 *
 * THE OWNER IS THE WEEK RECONCILIATION (build-nfl-week-reconciliation.mjs → public/data/nfl/reconciliation/<key>.json):
 * it grades every published row against the official box score "exactly as printed" and summarises each family
 * per week (`summary.props[]`: checks = decided rows, hits, voids). This module RE-GRADES NOTHING. It folds the
 * owner's own weekly summaries into one season-to-date record per family, so a reader sees the numerator and the
 * denominator together, and it reads the owner's rows for a drill-down.
 *
 * Rules: a void is never a miss and never in the denominator; a pending game is a pending game — counted at the week,
 * never per family (the owner holds no rows for it, so a per-family pending count would be invented); a week that
 * graded nothing contributes nothing and is listed as pending.
 */
import { finish } from "./populations.mjs";

/** Owner row outcome → population outcome. Anything else (e.g. NO_LINE) is not a graded row. */
const OUTCOME = { HIT: "WIN", MISS: "LOSS", VOID: "VOID", PUSH: "PUSH" };

/**
 * @param weeks  [{ key, label, report }] in season order — `report` is the owner's week file
 * @returns {{ weeks: Array<{key,label,gamesFinal,gamesPending}>, families: Array<{id,label,group,target,total,byWeek}> }}
 */
export function nflFamilyRecord(weeks) {
  const fams = new Map();
  const weekRows = [];
  for (const { key, label, report } of weeks ?? []) {
    const s = report?.summary ?? {};
    weekRows.push({ key, label: report?.period?.label ?? label ?? key, gamesFinal: s.gamesFinal ?? 0, gamesPending: s.gamesPending ?? 0 });
    /* A week with no final game graded nothing: it is named as pending (weekRows), never a 0/0 cell or an empty
       drill-down entry (Production 2026-10-02: "Week 4 · 0 decided" under every family). */
    if (!(s.gamesFinal > 0)) continue;
    for (const p of s.props ?? []) {
      if (!Number.isInteger(p.checks) || !Number.isInteger(p.hits)) continue;
      const f = fams.get(p.id) ?? { id: p.id, label: p.label, group: p.group ?? null, target: p.target ?? null, counts: { won: 0, lost: 0, push: 0, void: 0 }, byWeek: [] };
      const voids = Number.isInteger(p.voids) ? p.voids : 0;
      f.counts.won += p.hits;
      f.counts.lost += p.checks - p.hits;
      f.counts.void += voids;
      f.byWeek.push({ key, hits: p.hits, checks: p.checks, voids, rate: p.checks > 0 ? p.hits / p.checks : null });
      if (p.target != null) f.target = p.target;
      fams.set(p.id, f);
    }
  }
  return {
    weeks: weekRows,
    families: [...fams.values()].map(({ counts, ...f }) => ({ ...f, total: finish(counts) })),
  };
}

/**
 * The owner's graded rows for one family in one week — the drill-down. Team families are one row per game.
 * @returns Array<{ matchup, name, team, low, median, high, actual, outcome }>
 */
export function nflFamilyRows(report, familyId) {
  const out = [];
  /* The owner grades "our likeliest scorer scored" from the touchdowns block: the likeliest row per game,
     SCORED = hit, DID_NOT_SCORE = miss, VOID = did not play. Its own vocabulary, mapped once here. */
  if (familyId === "likeliest_scorer") {
    const TD = { SCORED: "HIT", DID_NOT_SCORE: "MISS", VOID: "VOID" };
    for (const g of report?.games ?? []) {
      for (const t of g.touchdowns ?? []) {
        if (!t.likeliest || !TD[t.outcome]) continue;
        out.push({ matchup: g.matchup ?? null, name: t.name ?? null, team: t.team ?? null, low: null, median: t.probability ?? null, high: null, actual: null, outcome: TD[t.outcome] });
      }
    }
    return out;
  }
  for (const g of report?.games ?? []) {
    for (const r of [...(g.team ?? []), ...(g.players ?? [])]) {
      if (r.prop !== familyId || !OUTCOME[r.outcome]) continue;
      out.push({ matchup: g.matchup ?? null, name: r.name ?? null, team: r.team ?? null, low: r.low ?? null, median: r.median ?? null, high: r.high ?? null, actual: r.actual ?? null, outcome: r.outcome });
    }
  }
  return out;
}
