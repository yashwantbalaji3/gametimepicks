/**
 * NBA leakage-safe feature/timing contract (Phase 10). Applies the SAME discipline as the MLB pregame research
 * archive (app/src/lib/mlb/pregame-archive/eligibility.ts) and the UFC feature-eligibility gate to the NBA
 * player-prop pipeline. NBA is HISTORICAL_ONLY (docs/NBA_ENGINE_FORENSIC_AUDIT.md) — no data flows through this
 * today; this is the groundwork that must gate any re-validated NBA model before public exposure.
 *
 * The one rule that matters (see docs/NBA_FEATURE_AND_TIMING_CONTRACT.md):
 *   A feature value is eligible only when it was provably known BEFORE tip-off AND was built ONLY from games
 *   strictly earlier than the slate date:
 *
 *     boardGeneratedAt < tipoffTime
 *       AND (newsCapturedAt == null OR newsCapturedAt < tipoffTime)
 *       AND every sourceGameDate < slateDate
 *
 * Equality is ineligible. A display-only tip-off ("8:30 PM ET"), a missing capture time, or an undated source game
 * is ineligible — timing is never inferred. Pure + deterministic. No modeling, no probability, no money, not public.
 *
 * Evidence this rule already held for the real 2026 playoff boards: on app/public/data/boards/2026-06-13.json the
 * board generatedAt is 2026-06-13T15:17:23Z (11:17 AM ET) vs an 8:30 PM ET tip-off, and all 1,960 recentGames
 * source dates across 196 leans are strictly earlier than the 2026-06-13 slate (max 2026-06-11, zero leaks).
 */

/** This contract governs a HISTORICAL_ONLY sport. Every consumer carries these — never public, never money-touching. */
export const NBA_CONTRACT_FLAGS = { public: false, approvedForProduction: false, productEligible: false } as const;

export const NBA_FEATURE_TIMING_CONTRACT_VERSION = "nba-feature-timing-contract-1";

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

export interface NbaFeatureTimingInput {
  /** ISO instant the board / prediction was generated — the feature capture time. */
  boardGeneratedAt: string | null;
  /**
   * ISO instant of tip-off. A display-only string ("8:30 PM ET") is NOT a proven instant (Date.parse ⇒ NaN) and is
   * therefore INELIGIBLE — the current boards store only a display tip-off, so a reactivation must record an ISO one.
   */
  tipoffTime: string | null;
  /** The slate date (YYYY-MM-DD). Trailing-form source games must be strictly earlier. Defaults to boardGeneratedAt's date. */
  slateDate?: string | null;
  /** ISO dates of the games the trailing-form features (recent10 / rolling averages / dispersion) were derived from. */
  sourceGameDates?: (string | null)[];
  /** ISO instant the manual injury/news layer was captured, when a news signal is applied. Null/undefined = none applied. */
  newsCapturedAt?: string | null;
}

export interface NbaFeatureTimingResult {
  eligible: boolean;
  reason: string;
}

/** The single feature/timing eligibility gate. Never infers timing; unproven ⇒ ineligible. */
export function nbaFeatureTimingEligible(x: NbaFeatureTimingInput): NbaFeatureTimingResult {
  const start = ms(x.tipoffTime);
  const cap = ms(x.boardGeneratedAt);
  if (!Number.isFinite(start)) return { eligible: false, reason: "no proven tip-off instant (a display-only tip-off is unprovable)" };
  if (!Number.isFinite(cap)) return { eligible: false, reason: "no board generation time" };
  if (cap >= start) return { eligible: false, reason: "board generated at/after tip-off" };

  // Manual news/injury layer: only checked when a signal was actually applied. A proven pre-tip capture is required
  // (the audit's reactivation risk: the manual layer has no automated capturedAt<tipoff enforcement today).
  if (x.newsCapturedAt !== null && x.newsCapturedAt !== undefined) {
    const news = ms(x.newsCapturedAt);
    if (!Number.isFinite(news)) return { eligible: false, reason: "news signal applied without a proven capture time" };
    if (news >= start) return { eligible: false, reason: "news/injury signal captured at/after tip-off" };
  }

  const slateDay = day(x.slateDate) ?? day(x.boardGeneratedAt);
  if (!slateDay) return { eligible: false, reason: "no slate date to bound trailing-form source games" };

  // CHRONOLOGICAL: every trailing-form source game must be STRICTLY earlier than the slate (no same-day / future logs).
  for (const d of x.sourceGameDates ?? []) {
    const sd = day(d);
    if (!sd) return { eligible: false, reason: "a source game has no date (unprovable timing)" };
    if (sd >= slateDay) return { eligible: false, reason: `a source game (${sd}) is not strictly earlier than the slate (${slateDay}) — leakage` };
  }

  return { eligible: true, reason: "board captured pre-tip; news (if any) pre-tip; every source game strictly earlier than the slate" };
}

/** Convenience predicate: are all trailing-form source games strictly earlier than the slate date? */
export function sourceGamesStrictlyPrior(sourceGameDates: (string | null)[] | undefined, slateDate: string | null): boolean {
  const slateDay = day(slateDate);
  if (!slateDay) return false;
  for (const d of sourceGameDates ?? []) {
    const sd = day(d);
    if (!sd || sd >= slateDay) return false;
  }
  return true;
}
