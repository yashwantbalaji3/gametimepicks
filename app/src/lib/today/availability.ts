/**
 * GAME AVAILABILITY CONTRACT — the ONE canonical, deterministic answer to "what analysis is available
 * for this game, and what is the honest action?" Pure, framework-free, fail-closed. Shared by /today and
 * /mlb so the two surfaces can never disagree.
 *
 * The tiers, in strict order — each requires PROVEN evidence, never an inference from team names or date:
 *   SIMULATION_READY  — a genuine ready run-simulation whose game identity reconciles.
 *   MODEL_READ        — no ready sim, but the MLB Game Lab carries ≥1 model lean vs the market.
 *   MARKET_READ       — no sim/model, but a de-vigged market-implied Game Center exists.
 *   REPORT_ONLY       — a known game with a canonical report route, but no proven richer analysis; the
 *                       explanation states the ACTUAL reason (awaiting inputs / stale / started / identity).
 *   UNAVAILABLE       — not even a canonical fallback report action can be offered (no route / no teams).
 *
 * Fail-closed rules:
 *   • A proven identity mismatch (`reconciled.ok === false`) FORBIDS the sim/model/market tiers — the
 *     joined artifacts disagree on which game this is, so we never present their analysis. It falls to
 *     REPORT_ONLY (the report page renders its own honest "could not be reconciled" state).
 *   • A non-"ready" simulation is never surfaced as a simulation.
 *   • Doubleheaders stay gamePk-specific via the caller's canonical slug — this contract never reconstructs
 *     a game from team+date and never silently falls back from one game to another.
 *   • Nothing here fabricates confidence, a pick, or a ranking. The explanation is neutral and public-facing.
 *
 * No React/Next imports so tsx can unit-test it directly; the input is a structural SUBSET of the real
 * PublicGameDetail, so callers pass `buildAllGameDetails()` rows as-is.
 */

export type AvailabilityLevel = "simulation" | "model-read" | "market-read" | "report" | "unavailable";

/** Has the scheduled first pitch passed? `scheduled` = not yet; `started` = clock proves it began. */
export type StartState = "scheduled" | "started" | "unknown";

/** Freshness of the game's richest artifact (the simulation). */
export type FreshnessState = "fresh" | "stale" | "unknown";

/** The minimal per-game shape the contract reads (a structural subset of PublicGameDetail). */
export interface GameAvailabilityInput {
  sport: string;
  sportLabel?: string | null;
  slug?: string | null;
  date?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  /** Run-simulation view — only `status: "ready"` counts as a genuine, current simulation. */
  gameLabSimulation?: { status: "ready" | "unavailable" | "stale" | "error" } | null;
  /** MLB Game Lab model report — `leanCount > 0` means model reads vs the market exist. */
  gameLabMlb?: { leanCount?: number | null } | null;
  /** Market-implied (de-vigged) Game Center — presence = market read; carries first pitch. */
  gameCenter?: { firstPitch?: string | null } | null;
  /** Game-to-artifact reconciliation. `ok === false` forbids the sim/model/market tiers (fail-closed). */
  reconciled?: { ok: boolean; reason: string } | null;
  /** Per-module data status (player props etc.) — used to explain a REPORT_ONLY game's actual gap. */
  dataStatus?: Array<{ status: "live" | "pending" | "unavailable" | "model_only"; label?: string }> | null;
}

export interface GameAvailability {
  level: AvailabilityLevel;
  /** Public chip label. */
  label: string;
  /** Neutral, public-facing "why there is something to inspect" OR the honest limitation. Never predictive. */
  explanation: string;
  /** The primary action label (empty string ONLY for UNAVAILABLE — no deceptive button). */
  actionLabel: string;
  /** Canonical, doubleheader-distinct report href; null ONLY for UNAVAILABLE. */
  canonicalHref: string | null;
  startState: StartState;
  firstPitchIso: string | null;
  freshnessState: FreshnessState;
  /** Machine-readable tokens that justify the level (for tests + debugging; never user-facing prose). */
  evidence: string[];
  tone: "success" | "gold" | "mute";
}

const SPORT_LABEL: Record<string, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

function validStr(s: unknown): string | null {
  return typeof s === "string" && s.length > 0 ? s : null;
}

/** Has first pitch passed? Needs a real first pitch AND an injected clock; otherwise honestly `unknown`. */
export function deriveStartState(firstPitchIso: string | null, nowMs?: number): StartState {
  if (!firstPitchIso) return "unknown";
  const t = Date.parse(firstPitchIso);
  if (!Number.isFinite(t)) return "unknown";
  if (nowMs == null || !Number.isFinite(nowMs)) return "unknown"; // no clock → never guess "started"/"scheduled"
  return t <= nowMs ? "started" : "scheduled";
}

/**
 * Derive the canonical availability for one game.
 * @param opts.nowMs real epoch-ms clock for start-state (omit → startState "unknown"; never fabricated).
 */
export function deriveGameAvailability(d: GameAvailabilityInput, opts?: { nowMs?: number }): GameAvailability {
  const sportLabel = validStr(d.sportLabel) ?? SPORT_LABEL[d.sport] ?? d.sport.toUpperCase();
  const href = validStr(d.slug) ? `/games/${d.sport}/${d.slug}` : null;
  const firstPitchIso = validStr(d.gameCenter?.firstPitch);
  const startState = deriveStartState(firstPitchIso, opts?.nowMs);
  const started = startState === "started";

  const reconciledFailed = d.reconciled != null && d.reconciled.ok === false;
  const sim = d.gameLabSimulation ?? null;
  const simReady = !reconciledFailed && sim != null && sim.status === "ready";
  const simStale = sim != null && sim.status === "stale";
  const leans = d.gameLabMlb?.leanCount ?? 0;
  const hasModel = !reconciledFailed && typeof leans === "number" && leans > 0;
  const hasMarket = !reconciledFailed && d.gameCenter != null;
  const propsPending = (d.dataStatus ?? []).some((s) => s.status === "pending");

  const evidence: string[] = [];
  if (firstPitchIso) evidence.push("first-pitch");
  if (reconciledFailed) evidence.push(`reconcile-failed:${d.reconciled?.reason ?? "unknown"}`);

  // UNAVAILABLE — no canonical fallback report action can be offered.
  if (!href || !d.homeTeam || !d.awayTeam) {
    evidence.push(!href ? "no-route" : "no-teams");
    return {
      level: "unavailable",
      label: "Unavailable",
      explanation: !href
        ? "This game could not be identified, so no report is available yet."
        : "This game is missing team information, so no report is available yet.",
      actionLabel: "",
      canonicalHref: null,
      startState,
      firstPitchIso,
      freshnessState: "unknown",
      evidence,
      tone: "mute",
    };
  }

  // SIMULATION_READY
  if (simReady) {
    evidence.push("ready-sim");
    if (d.reconciled?.ok) evidence.push("reconciled-ok");
    return {
      level: "simulation",
      label: "Simulation ready",
      explanation: started
        ? "Game started — the pregame simulation and its uncertainty range are preserved for review."
        : "Simulation report and uncertainty range are available.",
      actionLabel: started ? "Review simulation →" : "Open simulation →",
      canonicalHref: href,
      startState,
      firstPitchIso,
      freshnessState: "fresh",
      evidence,
      tone: "success",
    };
  }

  // MODEL_READ
  if (hasModel) {
    evidence.push(`model-leans:${leans}`);
    return {
      level: "model-read",
      label: "Model read",
      explanation: "Pregame model inputs are available; the full simulation is not ready.",
      actionLabel: "View model read →",
      canonicalHref: href,
      startState,
      firstPitchIso,
      freshnessState: simStale ? "stale" : "unknown",
      evidence,
      tone: "gold",
    };
  }

  // MARKET_READ
  if (hasMarket) {
    evidence.push("market-center");
    return {
      level: "market-read",
      label: "Market read",
      explanation: "Pregame market context is available; no simulation is shown.",
      actionLabel: "View market context →",
      canonicalHref: href,
      startState,
      firstPitchIso,
      freshnessState: "unknown",
      evidence,
      tone: "gold",
    };
  }

  // REPORT_ONLY — the actual, specific reason.
  evidence.push("report-only");
  const explanation = reconciledFailed
    ? "Game identity could not be reconciled — the plain report is shown instead."
    : simStale
      ? "The most recent simulation for this game is out of date."
      : started
        ? "Game has started — pregame inputs are incomplete."
        : propsPending
          ? "Awaiting inputs — player-prop lines are still pending."
          : "Game report is available; richer simulation inputs are not ready yet.";
  return {
    level: "report",
    label: "Game report",
    explanation,
    actionLabel: "Open report →",
    canonicalHref: href,
    startState,
    firstPitchIso,
    freshnessState: simStale ? "stale" : "unknown",
    evidence,
    tone: "mute",
  };
}

/** Display order of tiers, richest first. */
export const AVAILABILITY_ORDER: AvailabilityLevel[] = ["simulation", "model-read", "market-read", "report", "unavailable"];

/** Group heading for each tier on the slate board. */
export const AVAILABILITY_GROUP_HEADING: Record<AvailabilityLevel, string> = {
  simulation: "Simulations ready",
  "model-read": "Model reads available",
  "market-read": "Market context available",
  report: "Reports · awaiting inputs",
  unavailable: "Unavailable",
};

/** Short factual count noun for the summary line (singularization handled by the caller). */
export const AVAILABILITY_SUMMARY_NOUN: Record<AvailabilityLevel, string> = {
  simulation: "simulation ready",
  "model-read": "model read",
  "market-read": "market context",
  report: "awaiting inputs",
  unavailable: "unavailable",
};
