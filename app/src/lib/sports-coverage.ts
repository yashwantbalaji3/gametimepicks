/**
 * sports-coverage — the single, honest source of truth for WHICH sports
 * GameTimePicks covers and at WHAT level.
 *
 * HARD honesty rules (mirrors the repo's product guardrails):
 *   - A sport is only marked "full" (Projections + Parlays) when it has a
 *     REAL player-prop projection pipeline AND graded parlay results. Today
 *     that is exactly NBA and MLB.
 *   - "schedule" means we surface a real, attributed schedule snapshot only
 *     — no odds, no projections, no parlays, no picks. (NHL, WNBA, UFC,
 *     FIFA World Cup, IPL.)
 *   - "coming-soon" means we publish NOTHING for that sport yet — no
 *     schedule, no odds, no projections. It must never link anywhere that
 *     implies coverage. (MLS, EPL.)
 *   - No fabricated data of any kind. Every link points at a real surface
 *     that already exists in the app.
 *
 * Client-safe: pure data + pure helpers, no `fs`/server-only imports, so
 * both server pages and client components can import it (and `tsx --test`
 * can exercise it directly).
 */

export type SportCoverageLevel = "full" | "projections" | "schedule" | "coming-soon";

export interface SportCoverageLink {
  label: string;
  href: string;
}

export interface SportCoverage {
  key: string;
  /** Short label, e.g. "MLB". */
  label: string;
  /** Full name, e.g. "Major League Baseball". */
  longLabel: string;
  level: SportCoverageLevel;
  /** One honest line describing what we publish for this sport. */
  blurb: string;
  /** Real in-app destinations. Empty for "coming-soon" (no coverage yet). */
  links: SportCoverageLink[];
}

/** Badge vocabulary the UI renders per level. Tone is a CSS var. */
export const COVERAGE_BADGE: Record<
  SportCoverageLevel,
  { label: string; tone: string }
> = {
  full: { label: "Projections + Parlays", tone: "var(--vault-gold-bright)" },
  projections: { label: "Projections", tone: "var(--vault-gold)" },
  schedule: { label: "Schedule only", tone: "var(--vault-text-mute)" },
  "coming-soon": { label: "Coming soon", tone: "var(--vault-text-faint)" },
};

/**
 * Coverage registry, ordered most-supported first. Levels reflect what is
 * ACTUALLY on disk / wired in the app as of this writing:
 *   - NBA + MLB: real projection pipelines + graded parlay results.
 *   - NHL/IPL/World Cup/WNBA/UFC/MLS: schedule-only surfaces that ship real,
 *     attributed schedule snapshots.
 *   - EPL: no upcoming fixtures sourceable yet — honest "coming soon".
 */
export const SPORTS_COVERAGE: ReadonlyArray<SportCoverage> = [
  {
    key: "mlb",
    label: "MLB",
    longLabel: "Major League Baseball",
    level: "full",
    blurb: "Player-prop projections and model parlays, graded after games.",
    links: [
      { label: "Straight bets", href: "/projections/" },
      { label: "Parlays", href: "/parlay-lab/#suggested" },
      { label: "Results", href: "/results/" },
    ],
  },
  {
    key: "nba",
    label: "NBA",
    longLabel: "National Basketball Association",
    level: "full",
    // BLURB CORRECTED (Sprint 019 · Phase 2). This still said "Player-prop projections and model parlays on
    // game days" for a sport the capability registry classifies HISTORICAL_ONLY — no live data since
    // 2026-06-13. The `level` field below remains "full" ONLY because it still feeds the legacy
    // MODELED_SPORT_KEYS parlay gate; the capability registry, not this field, now drives what the /events
    // badge is allowed to promise. Untangling the gate is tracked separately (it needs the mixed-sport
    // parlay rule decided first) — but the words a visitor reads must be true today.
    blurb: "Off-season — no live NBA projections. The settled NBA record stays published under Results.",
    links: [{ label: "Results", href: "/results/" }],
  },
  {
    key: "nhl",
    label: "NHL",
    longLabel: "National Hockey League",
    level: "schedule",
    blurb: "Upcoming games — schedule only. No model projections or parlays yet.",
    links: [{ label: "Schedule", href: "/nhl/" }],
  },
  {
    key: "wnba",
    label: "WNBA",
    longLabel: "Women's National Basketball Association",
    level: "schedule",
    blurb: "Upcoming games — schedule only, no odds or projections.",
    links: [{ label: "Schedule", href: "/events/" }],
  },
  {
    key: "ufc",
    label: "UFC",
    longLabel: "Ultimate Fighting Championship",
    level: "schedule",
    blurb: "Schedule available — model picks are data-gated until odds, fighter stats, grading, and a backtest are connected.",
    links: [
      { label: "Overview", href: "/ufc/" },
      { label: "Schedule", href: "/events/" },
    ],
  },
  // The 2026 FIFA World Cup is COMPLETE — it is no longer an active or upcoming sport, so it is not listed in
  // the sports coverage directory. It remains viewable only as an archive at /world-cup (past proof / history).
  {
    key: "ipl",
    label: "IPL",
    longLabel: "Indian Premier League · Cricket",
    level: "schedule",
    blurb: "Match schedule only — we do not publish player projections.",
    links: [{ label: "Schedule", href: "/ipl/" }],
  },
  {
    key: "mls",
    label: "MLS",
    longLabel: "Major League Soccer",
    level: "schedule",
    blurb: "Upcoming fixtures — schedule only. Model projections pending.",
    links: [{ label: "Schedule", href: "/events/" }],
  },
  {
    /*
     * P188: this read "Not modelled yet, and no upcoming fixtures published" while /epl was
     * publishing per-fixture distributions and nine per-match reports. A coverage registry that
     * understates is not safer than one that overstates — both are wrong answers to the question
     * "what does this product actually cover", and a reader who checks here and leaves has been
     * told the wrong thing either way.
     *
     * "projections", not "full": the team model publishes, but nothing has been graded and there
     * are NO player markets — see lib/sports/epl/player-markets.mjs, which is the documented
     * refusal rather than a gap.
     */
    key: "epl",
    label: "EPL",
    longLabel: "English Premier League",
    /*
     * "schedule", NOT "projections" — and the reason is a vocabulary trap worth stating. In THIS
     * registry `hasProjections` means PLAYER-PROP projections: `canShowProjections` is documented as
     * "May this sport surface player-prop projections?". EPL publishes TEAM-level distributions and
     * has no player data at all, so the "projections" level would have made the registry assert the
     * exact capability that lib/sports/epl/player-markets.mjs documents as refused — and would have
     * opened any surface gated on that flag.
     *
     * The four levels have no slot for "team forecasts, no player markets" (World Cup had the same
     * shape and also sits here). Understating a FLAG is safe where overstating one is not, so the
     * flag stays conservative and the blurb carries what actually publishes. A fifth level is the
     * real fix and is a deliberate follow-up, not something to improvise at the registry's edge.
     */
    level: "schedule",
    blurb: "Fixtures plus team-level model forecasts — match result, scorelines, goals and margin, per fixture. Not validated out of sample, and no player markets: the model is fitted on match results only.",
    links: [{ label: "Fixtures + forecasts", href: "/epl/" }],
  },
];

/** Sports with a real projection + parlay pipeline (level "full"). */
export function fullyCoveredSports(): SportCoverage[] {
  return SPORTS_COVERAGE.filter((s) => s.level === "full");
}

/** Convenience lookup by key. */
export function getSportCoverage(key: string): SportCoverage | undefined {
  return SPORTS_COVERAGE.find((s) => s.key === key);
}
