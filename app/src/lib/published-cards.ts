/**
 * published-cards — PURE selection of the public Suggested-Parlay cards shown
 * per sport view, from the optimizer's `publicRiskSections`. Single source of
 * truth for "what renders" so the cards on screen and the "Showing N" count can
 * never disagree, and so the rule is unit-testable without a JSX renderer.
 *
 * Pipeline per view:
 *   publicRiskSections[risk][sport]  (the curated, generated subset)
 *     → sectionSlipsForSport (deduped bucket; "all" = union of nba+mlb+multi)
 *       → filterOfficialSuggestedSlips (drops only non-modeled-sport slips;
 *          mixed-of-modeled is now ALLOWED and renders in the Mixed view)
 *         → applyVolumeDiscipline (depth + per-player/market/game caps)
 *
 * The "all" view is the per-risk DEDUPED UNION of the disciplined nba + mlb +
 * multi views — so All is a true summary of what the child tabs display and is
 * never smaller than any child. Never fabricates or pads: a section is only as
 * deep as the real generated slips that survive the caps.
 */
import {
  RISK_SECTION_ORDER,
  type RiskSectionKey,
} from "./parlay-risk-sections";
import {
  sectionSlipsForSport,
  slipKey,
  type SportBuckets,
  type SportView,
} from "./suggested-parlay-grouping";
import { filterOfficialSuggestedSlips } from "./sport-capabilities";
import {
  applyVolumeDiscipline,
  capsForSuggestedView,
  type VolumeCaps,
} from "./parlay-volume-discipline";

type SectionsByRisk<T> = Partial<Record<RiskSectionKey, SportBuckets<T>>>;
type DisplaySections<T> = Record<RiskSectionKey, T[]>;

const SINGLE_VIEWS: ReadonlyArray<Exclude<SportView, "all">> = ["nba", "mlb", "multi"];

function emptySections<T>(): DisplaySections<T> {
  return { low: [], medium: [], high: [], longshot: [] };
}

/** Disciplined display sections for ONE single-sport view (nba | mlb | multi). */
function disciplinedForView<T extends { legs?: unknown }>(
  psr: SectionsByRisk<T> | null | undefined,
  view: Exclude<SportView, "all">,
  capsOverride?: VolumeCaps,
): DisplaySections<T> {
  if (!psr) return emptySections<T>();
  const official: Partial<Record<RiskSectionKey, T[]>> = {};
  for (const risk of RISK_SECTION_ORDER) {
    const raw = sectionSlipsForSport(psr[risk], view);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    official[risk] = filterOfficialSuggestedSlips(raw as any) as T[];
  }
  const caps = capsOverride ?? capsForSuggestedView(view);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disc = applyVolumeDiscipline(official as any, caps).sections;
  const out = emptySections<T>();
  for (const risk of RISK_SECTION_ORDER) out[risk] = (disc[risk] as T[]) ?? [];
  return out;
}

/** Per-risk deduped union of several disciplined section maps. Preserves first
 *  occurrence order (mlb → nba → multi by caller convention). */
function unionSections<T>(maps: ReadonlyArray<DisplaySections<T>>): DisplaySections<T> {
  const out = emptySections<T>();
  for (const risk of RISK_SECTION_ORDER) {
    const seen = new Set<string>();
    for (const m of maps) {
      for (const slip of m[risk] ?? []) {
        const k = slipKey(slip);
        if (!seen.has(k)) {
          seen.add(k);
          out[risk].push(slip);
        }
      }
    }
  }
  return out;
}

/**
 * The published Suggested cards for a sport `view`, as disciplined sections by
 * risk. For a single-sport view this is that view's disciplined sections; for
 * "all" it is the per-risk deduped union of the disciplined mlb + nba + multi
 * views (so All ⊇ every child view and equals the on-screen union).
 */
export function selectPublishedSections<T extends { legs?: unknown }>(
  psr: SectionsByRisk<T> | null | undefined,
  view: SportView,
): DisplaySections<T> {
  if (!psr) return emptySections<T>();
  if (view !== "all") return disciplinedForView(psr, view);
  // All = union of the displayed child views (mlb first for stable ordering).
  return unionSections([
    disciplinedForView(psr, "mlb"),
    disciplinedForView(psr, "nba"),
    disciplinedForView(psr, "multi"),
  ]);
}

/** Total published cards across all risk sections for a view. */
export function countPublishedSections<T>(sections: DisplaySections<T>): number {
  let n = 0;
  for (const risk of RISK_SECTION_ORDER) n += (sections[risk] ?? []).length;
  return n;
}

/** Which sport views actually have ≥1 published card (drives which pills show). */
export function availablePublishedViews<T extends { legs?: unknown }>(
  psr: SectionsByRisk<T> | null | undefined,
): Record<SportView, number> {
  const counts: Record<SportView, number> = { all: 0, nba: 0, mlb: 0, multi: 0 };
  if (!psr) return counts;
  for (const v of SINGLE_VIEWS) counts[v] = countPublishedSections(disciplinedForView(psr, v));
  counts.all = countPublishedSections(selectPublishedSections(psr, "all"));
  return counts;
}
