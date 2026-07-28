/**
 * SportAdapter — the contract a sport must satisfy before it can be modelled, published, or settled.
 *
 * WHY A CONTRACT RATHER THAN AN INTERFACE
 * Three sports were audited on 2026-07-28 and each failed differently, but all three failed the SAME
 * requirement in the end: nothing in the codebase forced a sport to state, per row, when its data was
 * captured relative to when the event started. Measured:
 *
 *   MLB      the only sport with per-row capture provenance, and it still shipped a doubleheader
 *            collision to two surfaces because identity was a provider id (Sprint 041).
 *   UFC      20 pregame lines ever captured, none joining a result for the same fight; features are
 *            career aggregates that INCLUDE the fight being predicted; the settlement join key is
 *            `sorted(fighter_a, fighter_b)` with no date, which collides on 10 rematches.
 *   Soccer   one honest 64-match 2022 backtest that LOSES to the de-vigged closing market
 *            (Brier +0.0099); two parallel settlement implementations wrote incompatible schemas
 *            into the same directory; 192 of 385 graded legs left permanently pending.
 *   NBA      3,635 settled outcomes but `fullyResearchEligibleDates: 0` — tip-off is stored as
 *            "8:30 PM ET" display text, so `capturedAt < start` cannot be mechanically proven for a
 *            single date.
 *
 * So this file is not an abstraction for its own sake. Each member exists because its absence caused a
 * specific, measured failure. A sport that cannot implement a member does not get a stub — it gets a
 * lower `SportReadiness` and stays out of the surfaces that would imply the capability.
 *
 * SCOPE
 * Types and pure predicates only. No I/O, no sport knowledge, no imports from any sport's modules.
 */
import type { EventIdentity, EventStatus, IdentityViolation, ProviderRef } from "./event-identity";

/**
 * What a sport is actually allowed to claim.
 *
 * Ordered by decreasing capability. The classification is an OUTPUT of evidence, never an aspiration:
 * `DISABLED` is the correct answer for a sport with no data, and is preferable to a scaffold that
 * makes an empty pipeline look like a pending one.
 */
export type SportReadiness =
  /** Leakage-safe pregame capture, deterministic settlement, and a backtest against a market baseline. */
  | "FULL_MODEL"
  /** Real settled outcomes worth studying, but nothing forward-looking is producing. */
  | "HISTORICAL_ONLY"
  /** Code and artifacts exist; the data foundation cannot support research yet. */
  | "SCAFFOLD_ONLY"
  /** Not operating. Includes sports with no artifacts and no ingestion at all. */
  | "DISABLED";

/**
 * Per-row capture provenance.
 *
 * `capturedAt` is when WE observed the value; `availableAt` is when it became knowable to anyone.
 * They differ for a line posted at 09:00 and captured at 11:00, and the distinction decides whether a
 * row is usable as a research feature. A file-level `generatedAt` cannot substitute: it describes the
 * build, not the row, and every "market baseline" claim in this repo outside MLB currently rests on
 * exactly that substitution.
 */
export interface CaptureProvenance {
  readonly capturedAt: string;
  readonly availableAt?: string | null;
  /** The event start this capture must precede. Null means leakage-safety is UNPROVABLE, not fine. */
  readonly eventStart: string | null;
}

/**
 * Is a captured row usable as a pregame research feature?
 *
 * FAIL-CLOSED. A missing or unparseable timestamp returns false. The alternative — assuming a row is
 * pregame because it looks like it should be — is precisely how UFC accumulated a feature set built
 * from career statistics that include the fight being predicted.
 */
export function isLeakageSafe(p: CaptureProvenance | null | undefined): boolean {
  if (!p || !p.eventStart || !p.capturedAt) return false;
  const captured = Date.parse(p.availableAt ?? p.capturedAt);
  const start = Date.parse(p.eventStart);
  if (!Number.isFinite(captured) || !Number.isFinite(start)) return false;
  return captured < start;
}

/** A market offering, in the shape settlement needs and no more. */
export interface SportMarket {
  readonly eventId: string;
  /** Sport-specific key: "moneyline", "h2h", "player_strikeouts", "btts". */
  readonly market: string;
  readonly selection: string;
  readonly line?: number | null;
  /** Decimal price, or null when the sport captured no price. */
  readonly price?: number | null;
  readonly book?: string | null;
  readonly provenance: CaptureProvenance;
}

/**
 * A settlement outcome.
 *
 * `void` and `push` are distinct on purpose (a no-contest is not a tie), and `pending` is a real
 * terminal-for-now state rather than a silent omission — 192 soccer legs were dropped from view
 * because one implementation `continue`d past what it could not grade instead of recording it.
 */
export type SettlementResult = "win" | "loss" | "push" | "void" | "pending" | "ungradeable";

export interface SettledMarket {
  readonly eventId: string;
  readonly market: string;
  readonly selection: string;
  readonly result: SettlementResult;
  /** Why, in a form a human can check against a box score. Required for every non-pending result. */
  readonly basis: string;
  /** The official source consulted. Never a web snippet, never a model's own output. */
  readonly source: string;
}

/**
 * The adapter itself.
 *
 * Every method may return an empty result. None may return a fabricated one — an adapter that cannot
 * answer must say so through emptiness or a violation, so the caller can degrade visibly.
 */
export interface SportAdapter {
  readonly sport: string;
  readonly league: string | null;
  /** What this sport may currently claim, and the evidence behind it. */
  readonly readiness: SportReadiness;
  readonly readinessEvidence: string;

  /** Canonical identities for a date. Empty when the provider is down — never a cached guess. */
  getEvents(date: string): Promise<readonly EventIdentity[]> | readonly EventIdentity[];

  /**
   * Resolve a provider alias to one identity, or null.
   *
   * Null on ambiguity is mandatory, not a convenience. Returning "the best match" is the Sprint 041
   * defect and the UFC rematch-collision defect restated.
   */
  resolveIdentity(ref: ProviderRef, known: readonly EventIdentity[]): EventIdentity | null;

  /** Markets for known events. Rows without usable provenance must be omitted, not stamped. */
  getMarkets(
    events: readonly EventIdentity[],
  ): Promise<readonly SportMarket[]> | readonly SportMarket[];

  /**
   * Grade markets against an official result.
   *
   * There must be exactly ONE implementation per sport. Soccer has two that disagree on market
   * coverage (9 vs 5), selection format (text vs codes), and unresolvable handling — and both wrote
   * to the same directory. A second implementation is a defect, not redundancy.
   */
  settleMarkets(
    markets: readonly SportMarket[],
    officialResults: unknown,
  ): Promise<readonly SettledMarket[]> | readonly SettledMarket[];

  /** Sport-specific structural checks, on top of the universal identity invariants. */
  validateEvent(event: EventIdentity): readonly IdentityViolation[];
}

// ── readiness derivation ───────────────────────────────────────────────────────────────────────

/** The measured facts that decide what a sport may claim. All required; none inferred. */
export interface ReadinessEvidence {
  /** Events with pregame capture provable against a real start timestamp. */
  readonly leakageSafeEvents: number;
  /** Events whose markets were graded against an official source. */
  readonly settledEvents: number;
  /** True only when a backtest compared the model to a de-vigged market baseline. */
  readonly hasMarketBaseline: boolean;
  /** True only when that comparison FAVOURED the model. Losing is a valid, publishable answer. */
  readonly beatsMarketBaseline: boolean;
  /** Identity joins that resolved to more than one event. Any value above zero blocks FULL_MODEL. */
  readonly identityCollisions: number;
  /** True when exactly one settlement implementation exists for the sport. */
  readonly singleSettlementImplementation: boolean;
  /** Whether anything produced an artifact recently. */
  readonly producingCurrentOutput: boolean;
}

/**
 * Derive readiness from evidence.
 *
 * Deliberately harsh, and deliberately not a score: a single disqualifying fact caps the sport. Every
 * threshold below is set by an observed failure rather than a preference.
 */
export function deriveReadiness(e: ReadinessEvidence): {
  readiness: SportReadiness;
  reasons: readonly string[];
} {
  const reasons: string[] = [];

  if (e.leakageSafeEvents === 0 && e.settledEvents === 0) {
    return {
      readiness: "DISABLED",
      reasons: ["no leakage-safe captures and no settled events — nothing to model or study"],
    };
  }

  // A collision means some event's markets are attached to a different event's model output. There is
  // no sample size at which that averages out.
  if (e.identityCollisions > 0) {
    reasons.push(`${e.identityCollisions} identity collision(s) — joins resolve to the wrong event`);
  }
  if (!e.singleSettlementImplementation) {
    reasons.push("more than one settlement implementation — results depend on which path ran");
  }
  if (e.leakageSafeEvents === 0) {
    reasons.push("no event has provable pregame capture — features may include their own outcome");
  }

  if (reasons.length > 0) {
    // Settled history is still a real asset even when the forward path is broken.
    return {
      readiness: e.settledEvents > 0 ? "HISTORICAL_ONLY" : "SCAFFOLD_ONLY",
      reasons,
    };
  }

  if (!e.producingCurrentOutput) {
    return { readiness: "HISTORICAL_ONLY", reasons: ["no current output — history only"] };
  }
  if (!e.hasMarketBaseline) {
    return {
      readiness: "HISTORICAL_ONLY",
      reasons: ["no de-vigged market baseline — 'the model works' is untested"],
    };
  }
  if (!e.beatsMarketBaseline) {
    return {
      readiness: "HISTORICAL_ONLY",
      reasons: ["measured against the market baseline and did not out-predict it"],
    };
  }

  return { readiness: "FULL_MODEL", reasons: ["leakage-safe, settled, and measured against the market"] };
}

/** Convenience re-export so an adapter file needs one import. */
export type { EventIdentity, EventStatus, ProviderRef };
