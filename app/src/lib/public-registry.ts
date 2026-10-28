/**
 * PUBLIC VOCABULARY + CAPABILITY/STATUS REGISTRY (founder directive 2026-10-23 public readiness · audit A-T05:
 * F04, F09, F11, F12). ONE module every public surface reads to say what a sport or product offers and how far it
 * may be trusted. Client-safe and pure: no fs, no data/internal (it extends sport-capability-registry.ts, which is
 * client-reachable — lib/client-graph-internal-paths.test.mjs).
 *
 * THE FIVE PUBLIC TERMS (founder, verbatim intent):
 *   Official Forecast   the authorized, frozen GameTimePicks output for a game or player
 *   Predicted Player Statistics   the Official Forecast's per-player numbers (added by the founder, sprint directive 2026-10-23)
 *   Game Simulation     a clearly identified simulated game from a named engine and frozen inputs
 *   What-if Scenario    one hypothetical alternative — never the Official Forecast, never a real result
 *   Model Performance   historical grading, calibration, sample size, evaluation findings
 *   Historical Results  official finals and graded records (added by the founder, sprint directive 2026-10-23)
 *   Unavailable         cannot legitimately be shown yet, with one concise reason
 *
 * PRESENTATION, NOT PERMISSION. This registry never decides eligibility: `productEligible` is READ from the capability
 * registry's own gate (canEnterPredictionProducts — FULL_MODEL only), and market eligibility stays with
 * market-coverage.ts. A term here never makes an ineligible market look recommended, never calls a challenger
 * official, and never implies measured skill — Model Performance is always a link to the measured record, stated once
 * per feature. Three facts stay distinct on every surface: technical correctness (checks pass), publication status
 * (what is published, and as what), measured predictive performance (Model Performance).
 *
 * Exported for the Results and Forecast Record owners to adopt (PUBLIC_TERMS, PUBLIC_TERM_MEANING, RETIRED_PUBLIC_PHRASES).
 */
import { canEnterPredictionProducts, capabilityOf, type CapabilityState } from "./sport-capability-registry";
import { ELO_WIN_PROBABILITY, ELO_WIN_PROBABILITY_LABEL } from "./sports/nba/elo-win-probability.mjs";

export const PUBLIC_TERMS = Object.freeze({
  OFFICIAL_FORECAST: "Official Forecast",
  PLAYER_STATISTICS: "Predicted Player Statistics",
  GAME_SIMULATION: "Game Simulation",
  WHAT_IF: "What-if Scenario",
  MODEL_PERFORMANCE: "Model Performance",
  HISTORICAL_RESULTS: "Historical Results",
  UNAVAILABLE: "Unavailable",
} as const);
export type PublicTerm = (typeof PUBLIC_TERMS)[keyof typeof PUBLIC_TERMS];

/** One sentence per term, the same everywhere it is explained. */
export const PUBLIC_TERM_MEANING: Readonly<Record<PublicTerm, string>> = Object.freeze({
  "Official Forecast": "The authorized GameTimePicks output for a game or player, frozen before the start and never edited afterwards.",
  "Predicted Player Statistics": "The Official Forecast's per-player numbers — each player's median for the stats a sport publishes, frozen with it.",
  "Game Simulation": "One simulated game from a named engine and the same frozen inputs. It is not the Official Forecast and not a real result.",
  "What-if Scenario": "One hypothetical alternative run. It is never the Official Forecast and never a real result.",
  "Model Performance": "How the model has actually done: graded results, calibration and sample size — evaluated continuously as games settle.",
  "Historical Results": "Official finals and the graded record of every published forecast, settled from official sources.",
  "Unavailable": "Cannot legitimately be shown yet — the reason is given.",
});

/**
 * Phrases the founder retired from public surfaces (directive 2026-10-23). public-vocabulary.test.mjs fails if any
 * renders on a built public page; the disclosures they stood for live once per feature in its Model Performance link.
 */
export const RETIRED_PUBLIC_PHRASES: ReadonlyArray<string> = Object.freeze([
  "Unvalidated experimental simulation",
  "Experimental model projections",
  "Research-only prototype",
  "Experimental feature",
  "Research Possession Simulation — Unvalidated",
  "experimental projections",
  "experimental sims",
  "experimental lean",
]);

/** Where a feature stands for a sport. */
export type FeatureAvailability =
  /** published on its surface whenever there is an event to publish for */
  | "AVAILABLE"
  /** supported, but published per slate / matchweek / card — it may not be out yet for a given date */
  | "PER_SLATE"
  /** the product does not offer it for this sport (not a delay) */
  | "NOT_SUPPORTED";

export type PublicFeatureKey = "officialForecast" | "topBoards" | "gameSimulation" | "results" | "modelPerformance";

export interface PublicFeature {
  availability: FeatureAvailability;
  /** the page that carries it, when there is one */
  href: string | null;
  /** one plain sentence: what it is for this sport (or, NOT_SUPPORTED, the one concise reason) */
  note: string;
}

/** A forecast family and its publication status. Withheld families have no field anywhere in the public tree. */
export interface ForecastFamily {
  id: string;
  label: string;
  publication: "OFFICIAL_FORECAST" | "WITHHELD";
  /** the command-center model-status id that carries this family's Model Performance (null: none graded publicly yet) */
  performanceId: string | null;
}

export interface PublicSport {
  key: "mlb" | "nfl" | "nba" | "epl" | "ligue-1" | "ufc";
  label: string;
  hub: string;
  /** the capability registry's state — the gate, read, never re-decided here */
  capability: CapabilityState;
  /** may this sport's forecasts enter paper products (Bank Builder, Moonshot, Parlays)? canEnterPredictionProducts */
  productEligible: boolean;
  families: ReadonlyArray<ForecastFamily>;
  features: Readonly<Record<PublicFeatureKey, PublicFeature>>;
  /** Ask GameTime's OWN access for this sport — what the assistant can read, nothing about the product's coverage */
  assistant: { forecasts: boolean; liveState: boolean; results: boolean };
  /** the short navigation note */
  navNote: string;
  /** how the Official Forecast is made, in one or two plain sentences (Methodology) */
  method: string;
}

const MODEL_PERFORMANCE_HREF = "/models/";
/**
 * The ONE NBA Model Performance sentence. Every NBA surface — /nba, the Theater, Top Boards — prints this literal.
 * REVISED (independent audit 2026-10-28 F04): the 2026-10-23 text said no public record existed, beside /results/nba
 * printing the favoured-side record (34 won, 22 lost on 10-28). The record IS published as counts; what is not made is an
 * accuracy claim, before the preregistered minimum of graded games.
 */
export const NBA_RECORD_MIN_FOR_CLAIM = 300;
export const NBA_MODEL_PERFORMANCE_NOTE = `NBA forecasts are graded after every game. The favoured-side record is published as counts on NBA results; it is not judged before ${NBA_RECORD_MIN_FOR_CLAIM} graded games.`;
/**
 * NBA forecast families, from the switch that decides what is shown (audit 2026-10-28 F03: "win chance withheld" sat
 * beside a displayed Elo-derived estimate). The estimate is its own family while the 2026-10-23 founder switch is ON;
 * OFF folds it back into the withheld family. One source: every "withheld" line on an NBA surface reads this.
 */
export const NBA_ELO_ESTIMATE_SHOWN = ELO_WIN_PROBABILITY.enabled === true;
export const NBA_WITHHELD_LABEL = NBA_ELO_ESTIMATE_SHOWN ? "Team scores, margin, total and ranges" : "Team scores, win chance and ranges";
const fam = (id: string, label: string, publication: ForecastFamily["publication"], performanceId: string | null = null): ForecastFamily => ({ id, label, publication, performanceId });
const sport = (s: Omit<PublicSport, "capability" | "productEligible">): PublicSport => ({ ...s, capability: capabilityOf(s.key).state, productEligible: canEnterPredictionProducts(s.key) });

export const PUBLIC_SPORTS: ReadonlyArray<PublicSport> = Object.freeze([
  sport({
    key: "mlb", label: "MLB", hub: "/mlb/",
    families: [fam("mlb_moneyline", "Game winner", "OFFICIAL_FORECAST", "mlb_moneyline"), fam("mlb_run_line", "Run line", "OFFICIAL_FORECAST", "mlb_run_line"), fam("mlb_total", "Game total", "OFFICIAL_FORECAST", "mlb_total"), fam("mlb_player_props", "Player props (strikeouts, hits, total bases)", "OFFICIAL_FORECAST")],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/mlb/", note: "Every game on the daily board, published before first pitch." },
      topBoards: { availability: "PER_SLATE", href: "/mlb/board/", note: "The daily board of model leans." },
      gameSimulation: { availability: "PER_SLATE", href: "/simulate/?sport=mlb", note: "10,000 complete simulated games per matchup from the pregame projections." },
      results: { availability: "AVAILABLE", href: "/results/mlb/", note: "Every settled game, graded from the official box score." },
      modelPerformance: { availability: "AVAILABLE", href: MODEL_PERFORMANCE_HREF, note: "Graded records by market; markets below their floor are switched off." },
    },
    assistant: { forecasts: true, liveState: true, results: true },
    // the MLB hub is the simulation center (legacy-route-hiding.test: the footer labels MLB by what its hub is)
    navNote: "Game Simulations · Official Forecasts",
    method: "Each stat is modelled as a distribution around a projection built from recent-form and season windows, then converted to a probability against the posted line; simulated game outcomes come from those same projections, and stated probabilities are calibrated against earlier settled slates.",
  }),
  sport({
    key: "nfl", label: "NFL", hub: "/nfl/",
    families: [fam("nfl_team", "Game winner and score range", "OFFICIAL_FORECAST", "nfl_team"), fam("nfl_player_forward", "Predicted Player Statistics (player ranges)", "OFFICIAL_FORECAST", "nfl_player_forward"), fam("nfl_anytime_td", "Touchdown chances", "OFFICIAL_FORECAST", "nfl_anytime_td")],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/nfl/", note: "A score range and win chance for every regular-season game, frozen before kickoff." },
      topBoards: { availability: "PER_SLATE", href: "/nfl/#nfl-boards", note: "Weekly player boards." },
      gameSimulation: { availability: "PER_SLATE", href: "/nfl/", note: "A Game Simulation for games with a published World Model V2 run — a supporting simulation, never the Official Forecast." },
      results: { availability: "AVAILABLE", href: "/results/nfl/", note: "Weekly graded reports against official finals." },
      modelPerformance: { availability: "AVAILABLE", href: MODEL_PERFORMANCE_HREF, note: "Tested on past seasons; not yet shown to out-predict the sportsbook market." },
    },
    assistant: { forecasts: true, liveState: true, results: true },
    navNote: "Official Forecasts · Game Simulations",
    method: "Team ratings built on every final since 1999 and updated after each game day: the win chance comes from the rating that weights how decisively teams win, and a score range is simulated for every game.",
  }),
  sport({
    key: "nba", label: "NBA", hub: "/nba/",
    families: [
      fam("nba_winner_side", "Favoured side (Elo rating)", "OFFICIAL_FORECAST"),
      ...(NBA_ELO_ESTIMATE_SHOWN ? [fam("nba_elo_estimate", `${ELO_WIN_PROBABILITY_LABEL} (accuracy not established)`, "OFFICIAL_FORECAST")] : []),
      fam("nba_player_medians", "Predicted Player Statistics (PTS, REB, AST, 3PM, PRA, P+R, P+A medians)", "OFFICIAL_FORECAST"),
      fam("nba_team_scores", NBA_WITHHELD_LABEL, "WITHHELD"),
    ],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/nba/", note: "The favoured side and player medians for every game on the slate, frozen before tip-off." },
      topBoards: { availability: "PER_SLATE", href: "/nba/projections/", note: "Every player median for the slate, filterable and sortable." },
      gameSimulation: { availability: "PER_SLATE", href: "/nba/", note: "A possession-by-possession Game Simulation of each game on the current slate, with What-if Scenarios." },
      results: { availability: "AVAILABLE", href: "/nba/#nba-results", note: "Official finals from the write-once finals record." },
      modelPerformance: { availability: "AVAILABLE", href: "/results/nba/", note: NBA_MODEL_PERFORMANCE_NOTE },
    },
    assistant: { forecasts: false, liveState: false, results: false },
    navNote: "Official Forecasts · Top Boards · Game Simulations",
    method: "An Elo team rating names the favoured side; a player simulation of 10,000 draws per game gives each player's median, and PRA, P+R and P+A are medians of the per-draw sums.",
  }),
  sport({
    key: "epl", label: "Premier League", hub: "/epl/",
    families: [fam("epl_match", "Match result, expected goals, over 2.5", "OFFICIAL_FORECAST", "epl_match_model"), fam("epl_scorer", "Anytime goalscorer", "OFFICIAL_FORECAST")],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/epl/", note: "Every fixture in the matchweek, frozen before kickoff." },
      topBoards: { availability: "NOT_SUPPORTED", href: null, note: "No player board for the Premier League." },
      gameSimulation: { availability: "PER_SLATE", href: "/simulate/?sport=epl", note: "A score-distribution simulation per fixture." },
      results: { availability: "AVAILABLE", href: "/results/", note: "Every fixture graded against the official 90-minute result." },
      modelPerformance: { availability: "AVAILABLE", href: MODEL_PERFORMANCE_HREF, note: "Tested blind on past seasons; a forward test is running." },
    },
    assistant: { forecasts: true, liveState: false, results: true },
    navNote: "Official Forecasts",
    method: "An exact-Poisson match model gives the 1X2 split, expected goals and over 2.5; a separate head gives anytime-scorer chances.",
  }),
  sport({
    key: "ligue-1", label: "Ligue 1", hub: "/soccer/ligue-1/",
    families: [fam("ligue1_match", "Match result", "OFFICIAL_FORECAST")],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/soccer/ligue-1/", note: "Model-only match forecasts for every fixture, frozen before kickoff." },
      topBoards: { availability: "NOT_SUPPORTED", href: null, note: "No player markets for Ligue 1." },
      gameSimulation: { availability: "NOT_SUPPORTED", href: null, note: "No simulated-match view for Ligue 1." },
      results: { availability: "AVAILABLE", href: "/soccer/ligue-1/", note: "Graded fixtures on the league page." },
      modelPerformance: { availability: "AVAILABLE", href: "/soccer/ligue-1/", note: "Accepted on a preregistered league backtest; too few matches yet to grade forward." },
    },
    assistant: { forecasts: false, liveState: false, results: false },
    navNote: "Official Forecasts",
    method: "The Premier League match model, applied unchanged after a preregistered league backtest accepted it. Model-only: no sportsbook prices and no player markets.",
  }),
  sport({
    key: "ufc", label: "UFC", hub: "/ufc/",
    families: [fam("ufc_fight", "Winner, method and finishing round", "OFFICIAL_FORECAST", "ufc_model")],
    features: {
      officialForecast: { availability: "PER_SLATE", href: "/ufc/", note: "Every bout with enough tracked fighter history, frozen before the card." },
      topBoards: { availability: "NOT_SUPPORTED", href: null, note: "No board for UFC." },
      gameSimulation: { availability: "NOT_SUPPORTED", href: null, note: "No simulated-fight view." },
      results: { availability: "AVAILABLE", href: "/ufc/", note: "Every graded bout on the UFC page." },
      modelPerformance: { availability: "AVAILABLE", href: MODEL_PERFORMANCE_HREF, note: "Backtested on past cards; graded publicly beside the sportsbook line." },
    },
    assistant: { forecasts: false, liveState: false, results: true },
    navNote: "Official Forecasts",
    method: "A model of each fighter's tracked history gives a Platt-calibrated win chance, with a method-of-victory head and a finishing-round read.",
  }),
]);

const BY_KEY = new Map(PUBLIC_SPORTS.map((s) => [s.key as string, s]));
export function publicSport(key: string): PublicSport | null {
  return BY_KEY.get(String(key ?? "").trim().toLowerCase()) ?? null;
}

/**
 * P0 10-28 · CAPABILITY WORDS COME FROM THE FAMILIES, NOT FROM PROSE. /sports, /learn, /bucket-blitz and /mr-dub each
 * kept their own sentence about NBA ("Schedule only — not modelled", "No validated NBA forecast is published", "no
 * forecast") and every one went stale the day the NBA composition became official. A surface that states what a
 * sport publishes reads these two instead, so the statement changes when the families change and at no other time.
 */
/** Does the sport publish at least one Official Forecast family (its catalog entry is modelled)? */
export function publishesOfficialForecast(key: string): boolean {
  return (publicSport(key)?.families ?? []).some((f) => f.publication === "OFFICIAL_FORECAST");
}

/**
 * One plain statement of a sport's Official Forecast, from its families: what publishes, then what is withheld.
 * NBA → "Official Forecasts: favoured side (Elo rating) and Predicted Player Statistics (…). Withheld: team scores,
 * win chance and ranges." Null for a sport with no Official Forecast family (and then nothing is claimed).
 */
export function officialForecastCoverage(key: string): string | null {
  const fams = publicSport(key)?.families ?? [];
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  /* mid-sentence a label reads lower-case, except a public term ("Predicted Player Statistics"), which keeps its name */
  const inline = (l: string) => (Object.values(PUBLIC_TERMS).some((t) => l.startsWith(t)) ? l : l.charAt(0).toLowerCase() + l.slice(1));
  const official = fams.filter((f) => f.publication === "OFFICIAL_FORECAST").map((f) => inline(f.label));
  if (!official.length) return null;
  const withheld = fams.filter((f) => f.publication === "WITHHELD").map((f) => inline(f.label));
  return `${PUBLIC_TERMS.OFFICIAL_FORECAST}s: ${list(official)}.${withheld.length ? ` Withheld: ${list(withheld)}.` : ""}`;
}

/**
 * W9 (audit 2026-10-28): the sports that publish Official Forecasts, in registry order, read from the families — so
 * "which sports publish" is never a hand-written list ("MLB, NFL, Premier League" on /ask; "the two that publish
 * today" on /bucket-blitz) that goes stale when a sport's composition changes.
 */
export function officialForecastSportLabels(): string[] {
  return PUBLIC_SPORTS.filter((s) => publishesOfficialForecast(s.key)).map((s) => s.label);
}

/** "A, B and C" — the list form the sentences above use. */
export function listInWords(xs: ReadonlyArray<string>): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The sports Ask GameTime reads live game state for — the live gateway's public list, through the same gateway. */
export const ASSISTANT_LIVE_SPORTS: ReadonlyArray<string> = Object.freeze(PUBLIC_SPORTS.filter((s) => s.assistant.liveState).map((s) => s.label));

/**
 * F09: a game with nothing published says WHICH of the two it is — not out yet for this slate, or not offered at all.
 * Never "by design" for a feature the sport supports.
 */
export function availabilityLine(key: string, feature: PublicFeatureKey): string {
  const s = publicSport(key);
  const f = s?.features[feature];
  const name = feature === "gameSimulation" ? PUBLIC_TERMS.GAME_SIMULATION : feature === "officialForecast" ? PUBLIC_TERMS.OFFICIAL_FORECAST : feature === "modelPerformance" ? PUBLIC_TERMS.MODEL_PERFORMANCE : feature === "topBoards" ? "Top Boards" : "Results";
  if (!s || !f) return `${PUBLIC_TERMS.UNAVAILABLE} — not covered.`;
  if (f.availability === "NOT_SUPPORTED") return `${PUBLIC_TERMS.UNAVAILABLE} — ${f.note.replace(/\.$/, "")}.`;
  return f.availability === "PER_SLATE" ? `${name} not published yet for this slate — it publishes before the start.` : `${name} available.`;
}

/**
 * Display terms for the market-coverage statuses (market-coverage.ts owns the statuses and eligibility; this owns only
 * the words). "experimental" markets are published GameTimePicks forecasts that never enter products.
 */
export const MARKET_STATUS_TERM = Object.freeze({
  supported: "Available",
  conditional: "Available where inputs exist",
  experimental: `${PUBLIC_TERMS.OFFICIAL_FORECAST} · not in products`,
  provider_needed: `${PUBLIC_TERMS.UNAVAILABLE} · needs a data provider`,
  settlement_blocked: `${PUBLIC_TERMS.UNAVAILABLE} · grading not proven`,
  coming_soon: `${PUBLIC_TERMS.UNAVAILABLE} · not built yet`,
} as const);
/** A market row that IS a simulation (market-coverage "full_game_sim") is a Game Simulation, not a forecast family. */
export const marketStatusTerm = (status: keyof typeof MARKET_STATUS_TERM, market?: string): string =>
  status === "experimental" && market === "full_game_sim" ? `${PUBLIC_TERMS.GAME_SIMULATION} · not in products` : MARKET_STATUS_TERM[status];

/**
 * The ONE disclosure an NBA Official Forecast surface carries (hub lane, Top Boards): frozen, not a recommendation, and
 * its Model Performance status from the registry — said once per surface, never per card.
 */
export const NBA_FORECAST_DISCLOSURE = `Frozen before tip-off and shown exactly as frozen. Not a betting recommendation. ${NBA_MODEL_PERFORMANCE_NOTE}`;
