/**
 * HOMEPAGE EVENT SPOTLIGHT — a reusable "what's the big event right now" selector. Pure: types + honest
 * builders + a priority selector. No fetch, no fs, no money. The homepage loads the real artifacts and
 * passes them in; this decides WHAT to spotlight and HOW to phrase it (never over-claiming).
 *
 * Priority (Phase 6): UFC major event → World Cup knockout → today's MLB slate. Candidates are built by the
 * caller in that order and `selectHomepageSpotlight` returns the first available — so the homepage always
 * highlights the most important live thing, or nothing (normal homepage) when there's no major event.
 *
 * HONESTY: a UFC spotlight is MARKET-IMPLIED only while the model is unvalidated. It never says "model
 * picks live", "best bet", "lock", "edge", "EV", or names a product lane. Extensionless imports.
 */
export type SpotlightStatus = "upcoming" | "live" | "final";

export interface SpotlightEvent {
  key: string;
  sport: string;
  eventName: string;
  eventDate?: string;
  status: SpotlightStatus;
  sourceMode: string;
  title: string;
  subtitle: string;
  chips: string[];
  cta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  trustLabel: string;
}

/** Copy that must NEVER appear in a spotlight while a model is unvalidated (public-trust guard). */
export const SPOTLIGHT_FORBIDDEN = ["model picks live", "best bet", "lock", " edge", "positive ev", "guaranteed", "bank builder"] as const;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface UfcSpotlightInputs {
  moneylineV1Ready: boolean;
  projectionCount: number;
  oddsBackedCount: number;
  fightCount: number;
  eventName: string;
  eventDate?: string;
  gradedRows: number;
  gradedTarget: number;
  isSettled: boolean;
  /** Optional caller-computed "tomorrow" / "today" / "this weekend" label (server knows the date). */
  whenLabel?: string;
}

/**
 * Build the UFC spotlight, or null when there's nothing honest to spotlight (no sims, or the card already
 * settled). Market-implied only — never claims validated model picks.
 */
export function buildUfcSpotlight(i: UfcSpotlightInputs): SpotlightEvent | null {
  if (i.isSettled) return null; // a finished card is not a "live event" spotlight
  if (!i.moneylineV1Ready || i.projectionCount <= 0 || i.oddsBackedCount <= 0) return null; // sims not available
  const prefix = i.eventName.includes(":") ? i.eventName.split(":")[0].trim() : i.eventName.trim(); // "UFC 329"
  const when = i.whenLabel ? `${i.whenLabel}'s` : "the";
  return {
    key: `ufc-${slug(i.eventName)}`,
    sport: "UFC",
    eventName: i.eventName,
    eventDate: i.eventDate,
    status: "upcoming",
    sourceMode: "market_implied_simulation",
    title: `${prefix} Fight Simulator`,
    subtitle: `Market-implied simulations are live for ${when} fight card.`,
    chips: [
      `${i.fightCount} fights loaded`,
      `${i.oddsBackedCount} odds-backed simulations`,
      "Market-implied predictions live",
      `Model picks validating: ${i.gradedRows} / ${i.gradedTarget}`,
      "Paper-only",
    ],
    cta: { label: "Open UFC Fight Simulator", href: "/ufc" },
    secondaryCta: { label: "View fight card", href: "/ufc?tab=fight-card" },
    trustLabel: "Market-implied · paper-only",
  };
}

/** Return the first available candidate (candidates are pre-ordered by priority), or null. */
export function selectHomepageSpotlight(candidates: Array<SpotlightEvent | null | undefined>): SpotlightEvent | null {
  for (const c of candidates) if (c) return c;
  return null;
}

/** Guard used by tests + the component: a spotlight's public copy carries no forbidden over-claim. */
export function spotlightCopyIsHonest(e: SpotlightEvent): boolean {
  const blob = [e.title, e.subtitle, e.trustLabel, ...e.chips, e.cta.label, e.secondaryCta?.label ?? ""].join(" ").toLowerCase();
  return !SPOTLIGHT_FORBIDDEN.some((w) => blob.includes(w));
}
