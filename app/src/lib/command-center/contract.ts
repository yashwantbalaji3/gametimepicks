/**
 * THE UNIVERSAL PREDICTION CARD CONTRACT (P307) — one product language for every GameTimePicks forecast.
 *
 * Every public forecast, whatever the sport, is presented through this shape: what the model says (FORECAST), how
 * strong the signal is stated to be (SIGNAL — never a tier the sport has not defined), why (WHY — only what the
 * pipeline itself derived), what could be wrong with it (RISKS — only known state), whether the model behind it may
 * be trusted right now (STATUS — from receipts and the health scorecard, never restated in a component), when the
 * number was produced (UPDATED — the artifact's own stamp), and, after settlement, what happened (RESULT).
 *
 * Presentation components render this and NOTHING else: a component that reaches past the contract to an artifact
 * is the drift this contract exists to end (the homepage adoption rule, P201/P250). Adapters live in
 * lib/command-center/featured.ts; each reads its sport's canonical owner and MUST carry pauses through.
 */

export type CardSport = "mlb" | "nfl" | "epl" | "ufc";

/** A side of the matchup, enough for TeamLogo / TeamMark: a code where the sport has crests, a name always. */
export interface CardSide {
  name: string;
  /** Team or club code for the logo pipeline (TeamLogo needs the code, never the name — memory: gtp-e2e-harness). */
  code: string | null;
  /** Which of the two sides the model favours; null when the forecast names neither. */
  favoured: boolean;
}

/**
 * The strength of the signal, in the sport's own vocabulary. Only MLB carries a tiered label today
 * (lib/mlb/prediction/strength); no other sport may be given one here — a tier that was never defined from
 * evidence is a design flourish wearing a measurement's clothes.
 */
export type ConfidenceSignal =
  | { kind: "SIM_STRENGTH"; label: string; probability: number }
  | { kind: "PROBABILITY"; probability: number; of: string }
  | { kind: "RANGE"; low: number; high: number; unit: string; coverage: string }
  | { kind: "NONE"; reason: string };

/** Public model-status vocabulary. Internal states (BREACHED, ACCUMULATING, ELIGIBLE…) are mapped, never shown. */
export type PublicModelState =
  | "VALIDATED"      // cleared a preregistered historical bar it was never fit on
  | "FORWARD_TEST"   // a blind forward test is accumulating evidence
  | "HOLDING"        // live record at least as good as its floor
  | "WATCH"          // behind on the point estimate, not yet significant
  | "PAUSED"         // live record significantly below its floor: the public call is withdrawn, grading continues
  | "ESTIMATE"       // published under a founder-approved exception, below the bar
  | "TOO_EARLY"      // too few graded events to judge
  | "EXPERIMENTAL"   // published and labelled experimental; no claim against the sportsbook market
  | "SHADOW"         // research only — never powers a public number
  | "UNKNOWN";

export interface ModelStatusItem {
  id: string;
  /** What the status is about, in reader words: "Game totals", "Match model", "Fight model". */
  family: string;
  state: PublicModelState;
  /** One short reader-facing line (≤ 12 words). Built in the library from the artifact, never typed in JSX. */
  headline: string;
  /** One plain-English sentence with the evidence behind the state. */
  detail: string;
  /** Graded events behind the state, where the state rests on a live record. */
  n: number | null;
  /** Which artifact the state came from (provenance for tests and /ops; never printed on public pages). */
  source: string;
}

export type FreshnessState = "FRESH" | "DELAYED" | "STALE" | "MISSING";

export interface Freshness {
  state: FreshnessState;
  /** The artifact's own stamp, ISO. */
  updatedAt: string | null;
  /** "Updated Sep 15, 7:42 PM ET" / "Update overdue" — reader copy. */
  label: string;
  ageHours: number | null;
}

/**
 * How a saved copy of this card can learn what happened, from the canonical graded ledgers (lib/saved/results.mjs).
 * Carried on the card so the save button needs no second derivation of identity.
 */
export type SettlementKey =
  | { kind: "mlb-game"; gamePk: number; family: string }
  | { kind: "nfl-event"; providerEventId: string; family: string }
  | { kind: "epl-event"; eventId: string; family: string }
  | { kind: "ufc-bout"; date: string; red: string; blue: string };

export interface SettledResult {
  outcome: "HIT" | "MISS" | "VOID";
  actual: string;
  modelSaid: string;
}

export interface PredictionCardModel {
  id: string;
  sport: CardSport;
  href: string;
  /** Where the event stands in its own lifecycle, from the event's clock against the build instant. */
  lifecycle: "PREGAME" | "STARTED" | "SETTLED";
  startUtc: string | null;
  /** Pre-formatted ET start, from the server clock. */
  startLabel: string | null;
  /** Competition or event context: "Week 2", "Matchweek 5", "UFC 331 · main event". */
  context: string | null;
  away: CardSide;
  home: CardSide;
  /** FORECAST — the headline claim, pre-rendered: "Chiefs by 1 · 20–21", "Arsenal 58%", "Van 74%". */
  forecast: { label: string; value: string; sub: string | null };
  /** SIGNAL */
  signal: ConfidenceSignal;
  /** WHY — one model-derived line or nothing. */
  why: string | null;
  /** RISKS — caveats that change how to read the number. */
  risks: string[];
  /** STATUS — the dominant family behind the headline. */
  status: ModelStatusItem;
  /** UPDATED */
  freshness: Freshness;
  /** RESULT — present only once settled and graded. */
  result: SettledResult | null;
  /** SETTLEMENT — the key a saved copy joins the graded ledgers with. */
  settlement: SettlementKey;
}

export const PUBLIC_STATE_LABEL: Record<PublicModelState, string> = {
  VALIDATED: "Tested on past seasons",
  FORWARD_TEST: "Forward test running",
  HOLDING: "Holding",
  WATCH: "Watch",
  PAUSED: "Paused",
  ESTIMATE: "Estimate",
  TOO_EARLY: "Too early to judge",
  EXPERIMENTAL: "Experimental",
  SHADOW: "Research only",
  UNKNOWN: "Status unknown",
};

/** Rookie copy behind every "What does this mean?" — one sentence per state, the same everywhere. */
export const PUBLIC_STATE_MEANING: Record<PublicModelState, string> = {
  VALIDATED: "Before it went live, this model was scored on past seasons it had never seen and beat the simpler rules it replaced. That is a bar, not a promise.",
  FORWARD_TEST: "The model is being graded on new games as they happen, against the model it replaced. If it falls significantly behind, the previous model comes back automatically.",
  HOLDING: "Over the games graded so far, this call has done at least as well as its floor (a coin flip, or the model it replaced).",
  WATCH: "Over the games graded so far, this call is slightly behind its floor, but not by enough to be sure it is worse. It keeps publishing while the record grows.",
  PAUSED: "Over the games graded so far, this call has done worse than a coin flip by a clear margin. The public call is withdrawn; it is still made and graded every day and comes back when its record recovers.",
  ESTIMATE: "This family did not clear its calibration bar in testing. It is shown as an estimate under a stated exception, not as a validated forecast.",
  TOO_EARLY: "Not enough games have been graded to judge this call either way. The number is published; the verdict on it is not.",
  EXPERIMENTAL: "Published and labelled experimental: tested on past seasons, but not validated to out-predict the sportsbook market.",
  SHADOW: "A research candidate scored privately beside the live model. It never powers a public number.",
  UNKNOWN: "The status file for this family could not be read at build time, so no verdict is shown.",
};
