/**
 * ASK'S SPORT FORECAST RECORD, FROM THE SAME OWNER /results RENDERS (Production audit 2026-10-18, finding D-1).
 *
 * THE DEFECT. Ask's per-sport headline (`headline.bySport.<sport>` in ask/v1/results.json) was the results
 * projection's `graded-picks` cell, copied as-is. That cell counts `public/data/<sport>/graded-picks.json`, a
 * snapshot only the nightly settle rewrites — while /results (Season and All), /results/date/<d>/ and Ask's own
 * results days read the graded ledger itself through Results V2 (lib/results/v2/overview.ts). An EPL match graded
 * by the matchweek refresh AFTER the settle therefore showed on /results (27–34) and not in Ask's headline (27–33)
 * until the next settle rebuilt the snapshot.
 *
 * THE RULE. For a sport whose headline is a graded-ledger record that /results renders as a PUBLIC Results V2
 * population, Ask's counts ARE that population's all-time window — the same rows, the same function
 * (`resultsV2Populations`), at Ask's build time. Nothing is re-graded: every outcome is still the owner's own; only
 * the snapshot in between is bypassed. The cell keeps its identity (cellId, era, display eligibility), so the
 * headline map still points at it.
 *
 * The derived fields follow the owners' own rules: pending is the population's (null — a graded ledger holds no
 * pending rows, "missing is never zero"), the hit rate and sample state are graded-picks' (4 dp; sampleStateFor
 * over the decided count), and `asOf` is the newest graded ET day in the population.
 */
import { sampleStateFor } from "../sports/graded-picks.mjs";

/** sport → the Results V2 population id /results renders for that sport's graded forecast record. */
export const ASK_SPORT_RECORD_POPULATION = Object.freeze({ epl: "epl-matches", ufc: "ufc-fights" });

/**
 * The projection's headline cell with its record restated from the Results V2 population.
 * Returns the cell unchanged when either side is missing — the caller records that it fell back.
 *
 * @param {Record<string, any> | null} cell  the projection cell the headline designates
 * @param {{ windows?: { all?: { won: number, lost: number, push: number, void: number, decisive: number, n: number } }, days?: Array<{ date: string }>, pending?: number | null } | null | undefined} pop
 */
export function sportRecordCell(cell, pop) {
  const all = pop?.windows?.all;
  if (!cell || !all) return cell;
  return {
    ...cell,
    counts: { won: all.won, lost: all.lost, pending: pop.pending ?? null, push: all.push, void: all.void },
    decisive: all.decisive,
    n: all.n,
    hitRate: all.decisive > 0 ? Number((all.won / all.decisive).toFixed(4)) : null,
    ownerState: sampleStateFor(all.decisive),
    asOf: pop.days?.[0]?.date ?? cell.asOf ?? cell.owner?.generatedAt ?? null,
  };
}
