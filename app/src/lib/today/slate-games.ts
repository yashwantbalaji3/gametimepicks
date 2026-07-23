/**
 * SLATE GAMES selector — a PURE, framework-free picker for the /today "every game on the slate" board.
 *
 * The gap this closes: the featured-simulation row (`featuredSimulations`) is a CAPPED highlight reel (top
 * 5). On a 12-game MLB slate the other games are only reachable through a generic "+N more in the Simulate
 * lobby" link — they have no per-game action on the daily hub. This selector returns EVERY game on the
 * presented slate as an honest, actionable row so nothing is stranded: "every game has a clear action."
 *
 * Rules (honest — nothing here fabricates a simulation or a read):
 *   • One row per game on the presented slate (`date === today`), keyed by the canonical, doubleheader-safe
 *     slug — so BOTH ends of a doubleheader appear, each with its own distinct action (the game-identity
 *     invariant reinforced on the hub).
 *   • Availability tier is the HONEST best artifact the game actually has, in strict order:
 *       simulation  — a genuine `gameLabSimulation.status === "ready"` run simulation
 *       model-read  — no ready sim, but the MLB Game Lab has ≥1 model lean vs the market
 *       market-read — no model leans, but a de-vigged market-implied Game Center exists
 *       report      — none of the above; the row still links to the report page, which renders its OWN
 *                     honest unavailable state (a game is NEVER left without a working action).
 *   • The subline is informational and NON-PREDICTIVE — counts + "vs market", never a specific pick
 *     surfaced as a recommendation. The run count is not asserted (unsourced here); the chip carries it.
 *   • A real first-pitch timestamp is passed through when the team markets carry one (honest game status).
 *
 * No React/Next imports so tsx can unit-test it directly and the server component can import it as-is. The
 * input is a structural SUBSET of the real PublicGameDetail, so the hub passes `buildAllGameDetails()` as-is.
 */

export type SlateAvailability = "simulation" | "model-read" | "market-read" | "report";

/** The minimal game-detail shape the selector reads (a structural subset of the real detail). */
export interface SlateGameDetailInput {
  sport: string;
  sportLabel?: string | null;
  slug: string;
  date?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** MLB run-simulation view — only `status: "ready"` counts as a genuine simulation. */
  gameLabSimulation?: { status: "ready" | "unavailable" | "stale" | "error" } | null;
  /** MLB Game Lab model report — `leanCount > 0` means the game carries model reads vs the market. */
  gameLabMlb?: { leanCount?: number | null } | null;
  /** Market-implied (de-vigged) Game Center — presence means a market read exists; carries first pitch. */
  gameCenter?: { firstPitch?: string | null } | null;
}

export interface SlateGameRow {
  slug: string;
  /** Canonical, doubleheader-safe report href — the game's clear action target. */
  href: string;
  sport: string;
  sportLabel: string;
  teams: { home: string; away: string };
  homeLogo: string | null;
  awayLogo: string | null;
  date: string;
  /** Real scheduled first pitch (ISO) when the team markets carry it; null otherwise. */
  firstPitchIso: string | null;
  availability: SlateAvailability;
  statusLabel: string;
  actionLabel: string;
  /** Informational, NON-PREDICTIVE detail line (counts + framing), or null. */
  subline: string | null;
  tone: "success" | "gold" | "mute";
}

export interface SlateGamesResult {
  games: SlateGameRow[];
  /** Total games on the presented slate (rows returned). */
  total: number;
  /** How many of those carry a genuine ready simulation. */
  simReadyCount: number;
}

const SPORT_LABEL: Record<string, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

/** The honest availability tier + its copy, derived from the best artifact the game actually has. */
export function deriveAvailability(d: SlateGameDetailInput): Pick<
  SlateGameRow,
  "availability" | "statusLabel" | "actionLabel" | "subline" | "tone"
> {
  if (d.gameLabSimulation != null && d.gameLabSimulation.status === "ready") {
    return {
      availability: "simulation",
      statusLabel: "Simulation ready",
      actionLabel: "Open simulation →",
      subline: null, // the "Simulation ready" chip + action already carry it; no unsourced run-count claim
      tone: "success",
    };
  }
  const leans = d.gameLabMlb?.leanCount ?? 0;
  if (typeof leans === "number" && leans > 0) {
    return {
      availability: "model-read",
      statusLabel: "Model read",
      actionLabel: "View game report →",
      subline: `${leans} model read${leans === 1 ? "" : "s"} vs market`,
      tone: "gold",
    };
  }
  if (d.gameCenter != null) {
    return {
      availability: "market-read",
      statusLabel: "Market read",
      actionLabel: "View market read →",
      subline: "Market-implied read (de-vigged odds)",
      tone: "gold",
    };
  }
  return {
    availability: "report",
    statusLabel: "Report",
    actionLabel: "Open game page →",
    subline: null,
    tone: "mute",
  };
}

/**
 * Build one honest, actionable row per game on the presented slate.
 * @param today the presented slate date (YYYY-MM-DD). Only games with `date === today` are returned, so a
 *   stale slate is never rendered as "today's games". When omitted, all games are returned (edge-sorted).
 */
export function slateGames(details: readonly SlateGameDetailInput[], today?: string): SlateGamesResult {
  const rows: SlateGameRow[] = [];
  const seen = new Set<string>();

  for (const d of details) {
    if (today != null && d.date !== today) continue; // only the presented slate
    if (!d.homeTeam || !d.awayTeam) continue; // cannot render a matchup honestly without both teams
    if (!d.slug || seen.has(d.slug)) continue; // slugs are unique; guard against accidental dupes
    seen.add(d.slug);

    const tier = deriveAvailability(d);
    rows.push({
      slug: d.slug,
      href: `/games/${d.sport}/${d.slug}`,
      sport: d.sport,
      sportLabel: d.sportLabel ?? SPORT_LABEL[d.sport] ?? d.sport.toUpperCase(),
      teams: { home: d.homeTeam, away: d.awayTeam },
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      date: d.date ?? "",
      firstPitchIso: typeof d.gameCenter?.firstPitch === "string" && d.gameCenter.firstPitch ? d.gameCenter.firstPitch : null,
      ...tier,
    });
  }

  // Chronological slate order: soonest first pitch first; games without a known time sort last (stable by
  // slug). This is the order a fan scans the day in.
  rows.sort((a, b) => {
    const ta = a.firstPitchIso ?? "9999-99-99T99:99Z";
    const tb = b.firstPitchIso ?? "9999-99-99T99:99Z";
    return ta.localeCompare(tb) || a.slug.localeCompare(b.slug);
  });

  return {
    games: rows,
    total: rows.length,
    simReadyCount: rows.filter((r) => r.availability === "simulation").length,
  };
}
