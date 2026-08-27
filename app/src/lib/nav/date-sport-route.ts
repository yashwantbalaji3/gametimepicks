/**
 * THE DATE-AND-SPORT URL CONTRACT — one owner, so no surface has to guess.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every public surface that carries a date built its own URL: `simulate-day.tsx` had a `dateHref`
 * helper, `results/page.tsx` interpolated one shape, `results/date/[date]/page.tsx` a second for its
 * own prev/next, `board-date-status-banner.tsx` and `mlb-board-body.tsx` two more. SIX private
 * implementations of one contract, and they had already drifted in form: five emitted
 * `/results/date/<date>` and one `/results/date/<date>/`, against a `next.config` that sets
 * `trailingSlash: true`.
 *
 * BE PRECISE ABOUT WHAT THAT COST. It was latent, not user-visible: every one of those sites feeds
 * a `<Link>`, and Next normalises the href at render, so production serves zero unslashed dated
 * links across /simulate, /results and /mlb/board — checked, after a first draft of this comment
 * claimed a redirect hop on every date step that the live bytes did not support. The one place
 * without that safety net is the date picker's `router.push`, which now emits the canonical form.
 *
 * The defect that IS load-bearing is ownership. Nothing said which surfaces can hold a date at all,
 * so "link the reader to this day" had no answer a caller could look up — only six answers a caller
 * could copy, each free to drift again.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It introduces no router and invents no route. Both conventions here are the repository's own and
 * predate it: the date lives in the PATH (`/simulate/d/<date>/`, `/results/date/<date>/`, from
 * P209) and the sport lives in a `?sport=` QUERY (from `/today`'s top-reads filter). This module
 * only writes them down once.
 *
 * Pure and dependency-free, so the guards can drive every surface without a build.
 */

/** Surfaces that participate in the shared date/sport journey. */
export type Surface =
  | "home"
  | "today"
  | "simulate"
  | "picks"
  | "parlay"
  | "results";

/** How a surface expresses a selected date. */
type DateMode =
  /** One statically-exported page per in-window date, date in the path. */
  | "route"
  /** The surface is today-only by design; a date other than today has no page here. */
  | "today-only";

/** How a surface expresses a selected sport. */
type SportMode = "query" | "none";

interface SurfaceSpec {
  /** Path for the surface's default (today / newest) view. Always slash-terminated. */
  readonly base: string;
  readonly dateMode: DateMode;
  /** Path prefix for a non-default date, when dateMode is "route". */
  readonly datePrefix?: string;
  readonly sportMode: SportMode;
}

/**
 * The registry. Adding a surface here is the whole cost of giving it date/sport links, and a
 * surface absent from it cannot be linked to with a date — which is the honest answer for one that
 * has no page for that date.
 */
export const SURFACES: Record<Surface, SurfaceSpec> = {
  home: { base: "/", dateMode: "today-only", sportMode: "none" },
  today: { base: "/today/", dateMode: "today-only", sportMode: "query" },
  simulate: { base: "/simulate/", dateMode: "route", datePrefix: "/simulate/d/", sportMode: "query" },
  // `/markets` is the canonical path; "Picks" is its label (see navigation.ts).
  picks: { base: "/markets/", dateMode: "today-only", sportMode: "query" },
  parlay: { base: "/build/", dateMode: "today-only", sportMode: "query" },
  results: { base: "/results/", dateMode: "route", datePrefix: "/results/date/", sportMode: "query" },
};

/** ISO calendar date, YYYY-MM-DD. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `trailingSlash: true` in next.config means the exported file for `/x/y` is `/x/y/index.html`, and
 * an unslashed request is answered by a 308. `<Link>` normalises this for JSX callers, so emitting
 * the canonical form is belt rather than braces there — but `router.push` and any future non-Link
 * caller get no such help, and one contract should not depend on which renderer happens to consume
 * it. Every href this module returns is slash-terminated.
 */
function withSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export interface HrefOptions {
  /** The date being linked to, YYYY-MM-DD. Omit for the surface's default view. */
  readonly date?: string | null;
  /**
   * The date the surface treats as its default — today for forward-looking surfaces, the newest
   * settled date for Results. Linking to it yields the base path rather than a dated one, so the
   * canonical view has ONE url instead of two that render the same thing.
   */
  readonly defaultDate?: string | null;
  /** Sport filter to carry, e.g. "mlb". Omit or null to clear it. */
  readonly sport?: string | null;
  /** Fragment to append, without the "#". */
  readonly hash?: string | null;
}

/**
 * The canonical href for a surface at a date and sport.
 *
 * Returns `null` when the request cannot be honoured — a dated link to a today-only surface, or a
 * malformed date. A null is a refusal a caller can render as "no page for that day here"; a
 * best-effort guess would be a link to a 404.
 */
export function surfaceHref(surface: Surface, opts: HrefOptions = {}): string | null {
  const spec = SURFACES[surface];
  if (!spec) return null;

  const { date = null, defaultDate = null, sport = null, hash = null } = opts;

  let path: string;
  if (date == null || (defaultDate != null && date === defaultDate)) {
    path = spec.base;
  } else if (!ISO_DATE.test(date)) {
    // A date we cannot parse is not a date. Refuse rather than emit `/simulate/d/undefined/`.
    return null;
  } else if (spec.dateMode === "route" && spec.datePrefix) {
    path = withSlash(`${spec.datePrefix}${date}`);
  } else {
    // today-only surface asked for another day: it genuinely has no page for it.
    return null;
  }

  const qs = sport && spec.sportMode === "query" ? `?sport=${encodeURIComponent(sport)}` : "";
  const frag = hash ? `#${hash}` : "";
  return `${withSlash(path)}${qs}${frag}`;
}

/** True when a surface can show a day other than its default. */
export function supportsDate(surface: Surface): boolean {
  return SURFACES[surface]?.dateMode === "route";
}

/** True when a surface carries a sport filter in its URL. */
export function supportsSport(surface: Surface): boolean {
  return SURFACES[surface]?.sportMode === "query";
}

/**
 * The surfaces a reader can reach for a given date — used to build "see this day on …" actions
 * without any caller re-deriving which pages exist per day.
 */
export function surfacesForDate(date: string, defaultDate: string | null): Surface[] {
  return (Object.keys(SURFACES) as Surface[]).filter(
    (s) => surfaceHref(s, { date, defaultDate }) !== null,
  );
}

/** Read a sport filter out of a surface's query string. Unknown or empty reads as no filter. */
export function sportFromQuery(search: string | URLSearchParams | null | undefined): string | null {
  if (!search) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get("sport");
  const v = (raw ?? "").trim().toLowerCase();
  return v ? v : null;
}
