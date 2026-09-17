/**
 * SAVED FORECASTS — where a saved card may link (v1.1.4.1). Pure: no network, no clock, no storage.
 *
 * ⚠ WHY THIS EXISTS. A saved snapshot keeps the `href` of the card it was saved from. For MLB that is
 * `/games/mlb/<slug>/`, and MLB game pages are generated only for the CURRENT slate (`gameDetailParams`,
 * `dynamicParams = false`). The day after, the stored href is a syntactically valid URL for a page that is no longer
 * exported: production served `/games/mlb/nyy-vs-min-2026-09-15/` as 404 on 2026-09-16, from /saved and from the
 * My GameTime Saved preview. A URL that ages is presentation state, not forecast truth — so the destination is
 * derived here at render time and the saved record is never rewritten.
 *
 * THE RULE (MLB), decided from routes THIS deploy actually exported (`manifest`, built from the same owners the
 * pages' generateStaticParams use) — never from whether a URL can be constructed:
 *
 *   1. GAME     the game page exported for this gamePk today                       "View game"
 *   2. BOARD    the dated MLB board that lists the game, anchored to its gamePk   "View on the Sep 15 MLB board"
 *               (`/mlb/board/<ET date of first pitch>/#game-<gamePk>`; every graded game in the ledger has that
 *               anchor on that date — pinned in the built export)
 *   3. NONE     no exported destination can be proven → no link at all (never a known 404)
 *
 * Identity is the settlement key's gamePk. The stored slug is never parsed for teams and never name-matched.
 * Other sports keep their stored href unchanged (outside this hotfix).
 */

/** @typedef {{ mlbGamePathByPk: Record<string, string>, mlbBoardDates: string[] }} SavedRouteManifest */
/** @typedef {{ kind: "GAME"|"BOARD"|"NONE"|"UNCHANGED", href: string|null, label: string|null }} SavedDestination */

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/**
 * @param {any} saved   a saved forecast in the Saved owner's schema (saved-schema.mjs)
 * @param {SavedRouteManifest|null|undefined} manifest
 * @returns {SavedDestination}
 */
export function resolveSavedDestination(saved, manifest) {
  if (saved?.settlement?.kind !== "mlb-game") {
    return { kind: "UNCHANGED", href: typeof saved?.href === "string" && saved.href ? saved.href : null, label: null };
  }
  const gamePk = saved.settlement.gamePk;
  if (!Number.isInteger(gamePk) || !manifest) return NONE;

  const gamePath = manifest.mlbGamePathByPk?.[String(gamePk)];
  if (typeof gamePath === "string" && gamePath) return { kind: "GAME", href: gamePath, label: "View game" };

  const start = Date.parse(saved.startUtc ?? "");
  if (!Number.isFinite(start)) return NONE;
  const date = ET_DATE.format(new Date(start));
  if (!(manifest.mlbBoardDates ?? []).includes(date)) return NONE;
  return {
    kind: "BOARD",
    href: `/mlb/board/${date}/#game-${gamePk}`,
    label: `View on the ${ET_LABEL.format(new Date(start))} MLB board`,
  };
}

const NONE = Object.freeze({ kind: "NONE", href: null, label: null });
