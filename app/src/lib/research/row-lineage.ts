/**
 * PER-ROW RESEARCH LINEAGE — an ADDITIVE sidecar over the settled ledger.
 *
 * WHY THIS EXISTS
 * `public/data/mlb/results/settled_leans.jsonl` is the official settlement ledger and it is not
 * rewritten by anything here. Its rows carry `id`, `date`, `gamePk`, `marketKey`, `line`, `lean`,
 * `outcome` — and nothing that says which real-world event that was, which provider records it came
 * from, when the price was observed relative to first pitch, or which official source graded it.
 *
 * Sprint 044 measured what that absence costs: three historical event-identity collisions produced 49
 * settled legs graded against the wrong box score, and because both halves of a doubleheader share
 * rosters the wrong grades came out plausible rather than missing. A settled row that cannot be traced
 * back through prediction → event → market → source is unfalsifiable, and an unfalsifiable win rate is
 * not evidence.
 *
 * So this module derives, per row, an envelope stating exactly what is provable — and, far more often,
 * what is not. Most of the settled history predates any per-row capture stamp. Those rows come out
 * `LEGACY_UNSTAMPED`: they may still contribute to an aggregate whose denominator is stated, and they
 * may never carry a row-level provenance claim. That is the honest answer, not a gap to be filled in.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * Pregame timing (`capturedAt`, `eventStart`) may come ONLY from an artifact captured before the event.
 * It may never be reconstructed from settlement, from a box score, or from anything else known only
 * afterwards. Backfilling those fields would make every row look eligible and every leakage check pass,
 * which is precisely the failure mode `lib/identity/provenance.ts` was built to make visible.
 * `validateRowLineage` fails closed on it; `row-lineage.test.mjs` proves the guard bites by mutating
 * this file to perform the backfill and asserting the suite goes red.
 *
 * Pure and data-only: no I/O, no React. The reading lives in `row-lineage-loader.ts`.
 */
import {
  buildAliasIndex,
  deriveEventId,
  validateIdentities,
  type EventIdentity,
  type ProviderRef,
} from "@/lib/identity/event-identity";
import {
  MLB_LEAGUE,
  MLB_SPORT,
  ODDS_PROVIDER,
  STATSAPI_PROVIDER,
  identitiesFromSchedule,
  type MlbScheduleRow,
} from "@/lib/identity/mlb-adapter";
import { evaluateProvenance, type ResearchEligibility } from "@/lib/identity/provenance";

/** Bumped when the envelope's wire shape changes. Readers refuse a version they do not understand. */
export const ROW_SCHEMA_VERSION = "research-row-lineage-1";

/**
 * Which settlement-lineage gate produced the verdict carried here. Pinned so a row settled under an
 * older gate is never read as though it had passed today's checks — the 2026-07-28 slate is
 * permanently quarantined precisely because it was built before the gate existed.
 */
export const LINEAGE_GATE_VERSION = "settlement-lineage-gate-1";

/** The board/lean schema the model probabilities on these rows were produced under. */
export const MODEL_SCHEMA_VERSION = "mlb-board-lean-1";

/**
 * How much of a row's origin is actually provable.
 *
 * Six states, because the four obvious ones collapse distinctions that matter. "We have no capture
 * stamp for this row" (LEGACY_UNSTAMPED) and "the sources contradict each other" (CONFLICTED) and "we
 * refused to settle this date" (QUARANTINED) all end up as "no row-level claim", but only one of them
 * may contribute to an aggregate, and treating them alike is how a quarantined slate quietly re-enters
 * a hit rate.
 */
export type RowCoverageState =
  /** The row's own source record carries capture time and event start inline. Nothing inferred. */
  | "PROVEN_STAMPED"
  /** Timing proven via a separately captured pregame artifact, joined on provider IDs. */
  | "PROVEN_SIDECAR"
  /** Reachable and gradable, but no pregame artifact covers it. Aggregate-only; no row-level claim. */
  | "LEGACY_UNSTAMPED"
  /** Withheld by an integrity gate. Never contributes to any rate, in any aggregate, ever. */
  | "QUARANTINED"
  /** Identity or lineage refused — sources disagree about which event this is. Never counted. */
  | "CONFLICTED"
  /** The row could not be reached at all: no board row, or the artifacts were unreadable. */
  | "UNAVAILABLE";

export const ROW_COVERAGE_STATES: readonly RowCoverageState[] = [
  "PROVEN_STAMPED",
  "PROVEN_SIDECAR",
  "LEGACY_UNSTAMPED",
  "QUARANTINED",
  "CONFLICTED",
  "UNAVAILABLE",
];

export const COVERAGE_LABEL: Readonly<Record<RowCoverageState, string>> = {
  PROVEN_STAMPED: "Fully stamped",
  PROVEN_SIDECAR: "Provenance on file",
  LEGACY_UNSTAMPED: "No capture record",
  QUARANTINED: "Withheld",
  CONFLICTED: "Sources disagree",
  UNAVAILABLE: "Cannot be traced",
};

export const COVERAGE_MEANING: Readonly<Record<RowCoverageState, string>> = {
  PROVEN_STAMPED:
    "The record this row came from states when the price was observed and when the game started. Nothing is inferred.",
  PROVEN_SIDECAR:
    "A separately captured pregame file covers this row and was matched to it by ID. Its capture time is proven to precede first pitch.",
  LEGACY_UNSTAMPED:
    "This row predates per-row capture stamps. It can be counted in a total whose size is shown, but nothing specific about its timing can be claimed.",
  QUARANTINED:
    "An integrity check refused this row or its slate. It is shown, and it is excluded from every rate on the site.",
  CONFLICTED:
    "Two sources disagree about which real game this row belongs to, so it is not counted anywhere until that is resolved.",
  UNAVAILABLE: "We could not reach the underlying record. Treat this as unknown, not as fine.",
};

/**
 * Artifact kinds allowed to supply pregame timing.
 *
 * An allowlist, not a denylist: the whole point is that a source nobody thought to forbid is the one
 * that ends up backfilling `eventStart` from a box score.
 */
export const PREGAME_SOURCE_KINDS: readonly string[] = [
  "mlb-pregame-settlement-join",
  "mlb-pregame-market-snapshot",
  "board-inline-capture",
];

/** The one join this module will accept for attaching a pregame observation to a row. */
export const PREGAME_JOIN_METHOD = "gamePk+market+playerId+line+side";

/** How the canonical event id was reached. Recorded because "matched on name" must be visible as such. */
export const IDENTITY_JOIN_METHOD =
  "board gamePk resolved against the same board's StatsAPI schedule rows; start time to the minute separates doubleheaders";

// ── inputs ─────────────────────────────────────────────────────────────────────────────────────

/** A settled ledger row, reduced to what lineage needs. The ledger itself is never modified. */
export interface LedgerRow {
  readonly id: string;
  readonly date: string;
  readonly outcome: string;
  readonly gamePk?: number | string | null;
  readonly marketKey?: string | null;
  readonly line?: number | null;
  readonly lean?: string | null;
}

/** A board lean — the pregame record the ledger row was produced from. */
export interface BoardRow {
  readonly id: string;
  readonly gamePk: number | string;
  readonly gameId?: string | null;
  readonly marketKey: string;
  readonly marketLabel?: string | null;
  readonly line: number | null;
  readonly lean: string | null;
  readonly playerId?: number | string | null;
  readonly playerName?: string | null;
  readonly commenceTime?: string | null;
  readonly modelProbOver?: number | null;
  readonly modelProbUnder?: number | null;
  readonly impliedOver?: number | null;
  readonly impliedUnder?: number | null;
  readonly homeTeamAbbr?: string | null;
  readonly awayTeamAbbr?: string | null;
  /**
   * Per-row capture time, when a board ever carries one. Today's MLB boards do not: the file-level
   * `generatedAt` describes the build, not the observation, and using it here is exactly the
   * substitution `lib/identity/provenance.ts` refuses. Present so PROVEN_STAMPED is reachable the day
   * boards start stamping rows, rather than requiring a schema change then.
   */
  readonly capturedAt?: string | null;
  readonly eventStart?: string | null;
}

/**
 * A pregame observation drawn from an archive captured BEFORE the event.
 *
 * This is the only channel through which pregame timing may enter an envelope. The type deliberately
 * carries no outcome field, so a caller cannot hand `deriveRowLineage` a postgame record wearing this
 * shape without noticing.
 */
export interface PregameObservation {
  readonly capturedAt: string | null;
  readonly availableAt: string | null;
  readonly eventStart: string | null;
  /** Path or id of the artifact. Retained so a reader can go and look. */
  readonly sourceRef: string;
  /** Must be in `PREGAME_SOURCE_KINDS`. */
  readonly sourceKind: string;
  /** Must be `PREGAME_JOIN_METHOD`. A name-based match is not a join. */
  readonly joinMethod: string;
  /** The captured market snapshot this observation was taken from, when the artifact names one. */
  readonly snapshotRef: string | null;
  /** De-vigged market probability as captured. Null when the snapshot was one-sided. */
  readonly noVigProbability: number | null;
}

/**
 * The settlement side of the chain. Postgame by definition.
 *
 * `finalizedAt` is when the official source was READ — after the event, always. It is here so the
 * envelope can cite it, and it must never reach a pregame field.
 */
export interface SettlementRecord {
  readonly outcome: string | null;
  /** The official endpoint or artifact the outcome was read from. */
  readonly sourceRef: string | null;
  /** An entry from `OFFICIAL_SETTLEMENT_SOURCES`, or null when the ledger did not record one. */
  readonly sourceType: string | null;
  /** The source record the outcome was read from — an MLB gamePk. Injectivity on this is the 49-legs check. */
  readonly gradedAgainstId: string | number | null;
  readonly finalizedAt: string | null;
}

/** Why a row was withheld, when it was. */
export interface QuarantineNote {
  readonly scope: "date" | "row";
  readonly reason: string;
  readonly sourceRef: string | null;
}

/** The outcome of resolving a board row to a canonical event. */
export interface IdentityResolution {
  readonly eventId: string | null;
  readonly providerRefs: readonly ProviderRef[];
  readonly method: string;
  readonly refusedReason: string | null;
}

export interface DeriveRowLineageInput {
  readonly ledger: LedgerRow;
  readonly board: BoardRow | null;
  readonly identity: IdentityResolution | null;
  readonly pregame: PregameObservation | null;
  readonly settlement: SettlementRecord | null;
  readonly quarantine: QuarantineNote | null;
  /** Market-registry status from the public research contract. Never recomputed here. */
  readonly registryStatus: string;
  /** Version of the calibrator that would apply to this row, or null when none does. */
  readonly calibrationVersion: string | null;
  /** Lineage-gate violations recorded for this row, if the gate ran. Empty means it ran and passed. */
  readonly lineageViolations?: readonly string[];
  /** False when the gate did not run for this row at all — distinct from running and finding nothing. */
  readonly lineageEvaluated?: boolean;
}

// ── the envelope ───────────────────────────────────────────────────────────────────────────────

export interface RowPregameBlock {
  readonly capturedAt: string | null;
  readonly availableAt: string | null;
  readonly eventStart: string | null;
  readonly sourceRef: string | null;
  readonly sourceKind: string | null;
  readonly joinMethod: string | null;
  readonly snapshotRef: string | null;
  readonly noVigProbability: number | null;
}

export interface ResearchRowLineage {
  readonly rowSchemaVersion: typeof ROW_SCHEMA_VERSION;
  readonly rowId: string;
  readonly date: string;
  readonly sport: string;
  readonly league: string | null;
  readonly eventId: string | null;
  readonly providerRefs: readonly ProviderRef[];
  readonly identityMethod: string;
  readonly identityRefusedReason: string | null;
  readonly market: {
    readonly key: string | null;
    readonly label: string | null;
    readonly line: number | null;
    readonly side: string | null;
    readonly registryStatus: string;
  };
  readonly pregame: RowPregameBlock;
  readonly pregameEligibility: {
    readonly verdict: ResearchEligibility | "UNKNOWN";
    readonly reason: string;
    readonly researchEligible: boolean;
  };
  readonly settlement: {
    readonly outcome: string | null;
    readonly sourceRef: string | null;
    readonly sourceType: string | null;
    readonly gradedAgainstId: string | null;
    readonly finalizedAt: string | null;
  };
  readonly lineage: {
    readonly verdict: "PASS" | "REFUSED" | "NOT_EVALUATED";
    readonly gateVersion: string;
    readonly violations: readonly string[];
  };
  readonly model: {
    readonly modelSchemaVersion: string;
    readonly calibrationVersion: string | null;
  };
  readonly coverageState: RowCoverageState;
  /** True only for PROVEN_*. Anything else may not carry a statement about this specific row. */
  readonly rowLevelClaimAllowed: boolean;
  /** False for QUARANTINED, CONFLICTED, UNAVAILABLE. Aggregates must honour this. */
  readonly countsTowardRates: boolean;
  readonly quarantine: QuarantineNote | null;
}

const EMPTY_PREGAME: RowPregameBlock = {
  capturedAt: null,
  availableAt: null,
  eventStart: null,
  sourceRef: null,
  sourceKind: null,
  joinMethod: null,
  snapshotRef: null,
  noVigProbability: null,
};

const normalizeSide = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").toLowerCase();
  return s === "over" || s === "under" ? s : null;
};

/**
 * Assemble one envelope.
 *
 * The pregame block is built from `input.pregame` and `input.board` ONLY. `input.settlement` is read
 * for the settlement block and nowhere else — that separation is the guard's whole subject, and
 * `validateRowLineage` catches it if a future edit blurs it.
 */
export function deriveRowLineage(input: DeriveRowLineageInput): ResearchRowLineage {
  const { ledger, board, identity, pregame, settlement, quarantine } = input;

  const inlineStamped =
    board != null && typeof board.capturedAt === "string" && typeof board.eventStart === "string";

  const sidecarStamped =
    pregame != null &&
    typeof pregame.capturedAt === "string" &&
    typeof pregame.eventStart === "string" &&
    PREGAME_SOURCE_KINDS.includes(pregame.sourceKind) &&
    pregame.joinMethod === PREGAME_JOIN_METHOD;

  const pregameBlock: RowPregameBlock = inlineStamped
    ? {
        capturedAt: board!.capturedAt ?? null,
        availableAt: null,
        eventStart: board!.eventStart ?? null,
        sourceRef: `board:${ledger.date}`,
        sourceKind: "board-inline-capture",
        joinMethod: "board row carries its own capture stamp",
        snapshotRef: null,
        noVigProbability: null,
      }
    : sidecarStamped
      ? {
          capturedAt: pregame!.capturedAt,
          availableAt: pregame!.availableAt,
          eventStart: pregame!.eventStart,
          sourceRef: pregame!.sourceRef,
          sourceKind: pregame!.sourceKind,
          joinMethod: pregame!.joinMethod,
          snapshotRef: pregame!.snapshotRef,
          noVigProbability: pregame!.noVigProbability,
        }
      : EMPTY_PREGAME;

  const eligibility =
    pregameBlock.capturedAt == null && pregameBlock.eventStart == null
      ? {
          verdict: "UNKNOWN" as const,
          reason:
            "no pregame artifact covers this row — its capture time relative to first pitch is unknown and is not inferred",
          researchEligible: false,
        }
      : (() => {
          const ev = evaluateProvenance({
            eventId: identity?.eventId ?? "",
            provider: ODDS_PROVIDER,
            marketType: board?.marketKey ?? ledger.marketKey ?? "",
            capturedAt: pregameBlock.capturedAt,
            availableAt: pregameBlock.availableAt,
            eventStart: pregameBlock.eventStart,
          });
          return { verdict: ev.eligibility, reason: ev.reason, researchEligible: ev.researchEligible };
        })();

  const violations = [...(input.lineageViolations ?? [])];
  const lineageVerdict: ResearchRowLineage["lineage"]["verdict"] =
    input.lineageEvaluated === false ? "NOT_EVALUATED" : violations.length > 0 ? "REFUSED" : "PASS";

  const identityRefused = identity == null || identity.eventId == null;

  const coverageState: RowCoverageState =
    board == null
      ? "UNAVAILABLE"
      : quarantine != null
        ? "QUARANTINED"
        : identityRefused || lineageVerdict === "REFUSED"
          ? "CONFLICTED"
          : inlineStamped
            ? "PROVEN_STAMPED"
            : sidecarStamped
              ? "PROVEN_SIDECAR"
              : "LEGACY_UNSTAMPED";

  const proven = coverageState === "PROVEN_STAMPED" || coverageState === "PROVEN_SIDECAR";

  return {
    rowSchemaVersion: ROW_SCHEMA_VERSION,
    rowId: ledger.id,
    date: ledger.date,
    sport: MLB_SPORT,
    league: MLB_LEAGUE,
    // A refused identity must not present an eventId, or the refusal is decorative.
    eventId: coverageState === "CONFLICTED" ? null : (identity?.eventId ?? null),
    providerRefs: identity?.providerRefs ?? [],
    identityMethod: identity?.method ?? "unresolved",
    identityRefusedReason: identity?.refusedReason ?? (identityRefused ? "no identity resolution supplied" : null),
    market: {
      key: board?.marketKey ?? ledger.marketKey ?? null,
      label: board?.marketLabel ?? null,
      line: board?.line ?? ledger.line ?? null,
      side: normalizeSide(board?.lean ?? ledger.lean),
      registryStatus: input.registryStatus,
    },
    pregame: pregameBlock,
    pregameEligibility: eligibility,
    settlement: {
      outcome: settlement?.outcome ?? ledger.outcome ?? null,
      sourceRef: settlement?.sourceRef ?? null,
      sourceType: settlement?.sourceType ?? null,
      gradedAgainstId: settlement?.gradedAgainstId == null ? null : String(settlement.gradedAgainstId),
      finalizedAt: settlement?.finalizedAt ?? null,
    },
    lineage: { verdict: lineageVerdict, gateVersion: LINEAGE_GATE_VERSION, violations },
    model: { modelSchemaVersion: MODEL_SCHEMA_VERSION, calibrationVersion: input.calibrationVersion },
    coverageState,
    rowLevelClaimAllowed: proven,
    countsTowardRates:
      coverageState === "LEGACY_UNSTAMPED" || proven,
    quarantine,
  };
}

// ── the guard ──────────────────────────────────────────────────────────────────────────────────

export type LineageEnvelopeViolationCode =
  /** Pregame timing present with no pregame artifact behind it — the unsafe-backfill signature. */
  | "PREGAME_TIMING_WITHOUT_SOURCE"
  /** An unstamped row is carrying timing it has no right to. */
  | "UNSTAMPED_ROW_CARRIES_TIMING"
  /** A PROVEN state without the stamps that make it proven. */
  | "PROVEN_WITHOUT_TIMING"
  /** The pregame source and the settlement source are the same record. */
  | "PREGAME_SOURCE_IS_SETTLEMENT"
  /** A withheld or contradicted row is marked as countable. */
  | "WITHHELD_ROW_COUNTED"
  /** A refused identity still presents an eventId. */
  | "REFUSED_IDENTITY_CARRIES_EVENT_ID"
  /** A row-level claim is allowed on a row whose provenance is not proven. */
  | "ROW_CLAIM_WITHOUT_PROVENANCE"
  /** The envelope does not declare the schema version a reader must check. */
  | "MISSING_SCHEMA_VERSION"
  /** A pregame observation was attached by something other than an ID join. */
  | "NON_ID_JOIN";

export interface LineageEnvelopeViolation {
  readonly code: LineageEnvelopeViolationCode;
  readonly rowId: string;
  readonly message: string;
}

/**
 * Validate one envelope.
 *
 * Returns violations rather than throwing so an exporter can report every bad row in one pass. The
 * exporter refuses to write when this is non-empty.
 */
export function validateRowLineage(env: ResearchRowLineage): LineageEnvelopeViolation[] {
  const out: LineageEnvelopeViolation[] = [];
  const fail = (code: LineageEnvelopeViolationCode, message: string) =>
    out.push({ code, rowId: env.rowId, message });

  if (env.rowSchemaVersion !== ROW_SCHEMA_VERSION) {
    fail("MISSING_SCHEMA_VERSION", `row declares schema "${String(env.rowSchemaVersion)}", expected "${ROW_SCHEMA_VERSION}"`);
  }

  const hasTiming = env.pregame.capturedAt != null || env.pregame.eventStart != null;

  if (hasTiming && (env.pregame.sourceRef == null || !PREGAME_SOURCE_KINDS.includes(env.pregame.sourceKind ?? ""))) {
    fail(
      "PREGAME_TIMING_WITHOUT_SOURCE",
      `carries pregame timing (capturedAt=${String(env.pregame.capturedAt)}, eventStart=${String(env.pregame.eventStart)}) ` +
        `with sourceKind "${String(env.pregame.sourceKind)}" — pregame timing may come only from an artifact captured before the event`,
    );
  }

  if (hasTiming && env.pregame.joinMethod !== PREGAME_JOIN_METHOD && env.pregame.sourceKind !== "board-inline-capture") {
    fail(
      "NON_ID_JOIN",
      `pregame observation was attached by "${String(env.pregame.joinMethod)}" — only the ID join "${PREGAME_JOIN_METHOD}" is accepted`,
    );
  }

  if (env.coverageState === "LEGACY_UNSTAMPED" && hasTiming) {
    fail(
      "UNSTAMPED_ROW_CARRIES_TIMING",
      "is LEGACY_UNSTAMPED yet carries a capture time or event start — a row with no pregame artifact has no timing to report",
    );
  }

  if (
    (env.coverageState === "PROVEN_STAMPED" || env.coverageState === "PROVEN_SIDECAR") &&
    (env.pregame.capturedAt == null || env.pregame.eventStart == null)
  ) {
    fail("PROVEN_WITHOUT_TIMING", `is ${env.coverageState} without both a capture time and an event start`);
  }

  if (
    env.pregame.sourceRef != null &&
    env.settlement.sourceRef != null &&
    env.pregame.sourceRef === env.settlement.sourceRef
  ) {
    fail(
      "PREGAME_SOURCE_IS_SETTLEMENT",
      `cites "${env.pregame.sourceRef}" as both its pregame observation and its settlement source`,
    );
  }

  const withheld =
    env.coverageState === "QUARANTINED" ||
    env.coverageState === "CONFLICTED" ||
    env.coverageState === "UNAVAILABLE";
  if (withheld && env.countsTowardRates) {
    fail("WITHHELD_ROW_COUNTED", `is ${env.coverageState} and still marked as counting toward rates`);
  }

  if (env.coverageState === "CONFLICTED" && env.eventId != null) {
    fail("REFUSED_IDENTITY_CARRIES_EVENT_ID", `is CONFLICTED yet presents eventId "${env.eventId}"`);
  }

  if (env.rowLevelClaimAllowed && env.coverageState !== "PROVEN_STAMPED" && env.coverageState !== "PROVEN_SIDECAR") {
    fail("ROW_CLAIM_WITHOUT_PROVENANCE", `allows a row-level claim while its coverage is ${env.coverageState}`);
  }

  return out;
}

// ── identity resolution ────────────────────────────────────────────────────────────────────────

export interface EventIdentityIndex {
  /** Canonical identity for a StatsAPI gamePk, or null when unknown OR claimed by more than one event. */
  resolve(gamePk: string | number): EventIdentity | null;
  readonly identities: readonly EventIdentity[];
  /** gamePks the index refuses because they map to more than one event — the Sprint 041 signature. */
  readonly collidedGamePks: readonly string[];
  readonly violations: readonly string[];
}

/**
 * Build the per-slate identity index from a board's own schedule rows.
 *
 * A colliding gamePk resolves to null rather than to whichever half of the doubleheader happened to be
 * written last. On 2026-07-28 that collision is real and the whole slate is quarantined because of it.
 */
export function buildEventIdentityIndex(
  games: readonly Record<string, unknown>[],
  resolvedAt: string,
): EventIdentityIndex {
  const rows: MlbScheduleRow[] = games.map((g) => ({
    gamePk: g.gamePk as number | string,
    gameDate: (g.gameDate as string | null) ?? null,
    homeTeamName: (g.homeTeamName as string | null) ?? null,
    awayTeamName: (g.awayTeamName as string | null) ?? null,
    homeTeamAbbr: (g.homeTeamAbbr as string | null) ?? null,
    awayTeamAbbr: (g.awayTeamAbbr as string | null) ?? null,
    homeTeamId: (g.homeTeamId as number | string | null) ?? null,
    awayTeamId: (g.awayTeamId as number | string | null) ?? null,
    status: (g.status as string | null) ?? null,
  }));

  const identities = identitiesFromSchedule(rows, resolvedAt);
  const index = buildAliasIndex<EventIdentity>(
    identities.flatMap((i) =>
      i.providerIds
        .filter((r) => r.provider === STATSAPI_PROVIDER)
        .map((r) => [r.id, i] as const),
    ),
    (i) => i.eventId,
  );

  return {
    resolve: (gamePk) => index.resolve(String(gamePk)),
    identities,
    collidedGamePks: index.ambiguousAliases,
    violations: validateIdentities(identities).map((v) => `${v.code}: ${v.message}`),
  };
}

/**
 * Resolve one board row to its canonical event.
 *
 * The odds-provider id is attached as an ALIAS from the board row itself — it is never used to find the
 * event, and it is never inferred from team names. A board row whose gamePk the index refuses comes
 * back with `eventId: null` and the reason, which is what makes the refusal visible downstream.
 */
export function resolveRowIdentity(index: EventIdentityIndex, board: BoardRow): IdentityResolution {
  const identity = index.resolve(board.gamePk);
  if (!identity) {
    const collided = index.collidedGamePks.includes(String(board.gamePk));
    return {
      eventId: null,
      providerRefs: [{ provider: STATSAPI_PROVIDER, id: String(board.gamePk), kind: "game" }],
      method: IDENTITY_JOIN_METHOD,
      refusedReason: collided
        ? `gamePk ${board.gamePk} is claimed by more than one event on this slate — resolving it would attach this row to an arbitrary half of a doubleheader`
        : `gamePk ${board.gamePk} matches no scheduled game on this board`,
    };
  }

  const refs: ProviderRef[] = [...identity.providerIds];
  if (board.gameId) refs.push({ provider: ODDS_PROVIDER, id: board.gameId, kind: "event" });

  return { eventId: identity.eventId, providerRefs: refs, method: IDENTITY_JOIN_METHOD, refusedReason: null };
}

/** Re-exported so an exporter can derive an id without reaching past this module. */
export { deriveEventId };

// ── pregame observation join ───────────────────────────────────────────────────────────────────

export interface PregameJoinSubject {
  readonly gamePk: number | string | null | undefined;
  readonly marketKey: string | null | undefined;
  readonly playerId: number | string | null | undefined;
  readonly playerName?: string | null;
  readonly line: number | null | undefined;
  readonly side: string | null | undefined;
}

/**
 * The join key for attaching a pregame observation to a row.
 *
 * Returns null when there is no player ID. Names are not identifiers: two players share "Luis Garcia"
 * in the same season, and matching on a display name would attach one player's captured price to
 * another player's prediction — plausibly, and therefore invisibly. Sprint 043 made refusing a
 * name-only match a hard rule; this is where it is enforced for research rows.
 */
export function pregameJoinKey(subject: PregameJoinSubject): string | null {
  const side = normalizeSide(subject.side);
  if (subject.gamePk == null || !subject.marketKey || subject.playerId == null || side == null) return null;
  return [String(subject.gamePk), subject.marketKey, String(subject.playerId), subject.line ?? "", side].join("|");
}

export interface PregameObservationIndex {
  /** The observation for a row, or null when unknown OR when the key is claimed by more than one. */
  lookup(subject: PregameJoinSubject): PregameObservation | null;
  readonly size: number;
  readonly ambiguousKeys: readonly string[];
}

/**
 * Index pregame observations by their ID join key.
 *
 * Built on `buildAliasIndex` so a key claimed by two different observations resolves to null in both
 * directions. A last-write-wins Map here would silently hand back one of them, which is the read-site
 * shape of the Sprint 041 defect.
 */
export function buildPregameObservationIndex(
  entries: readonly (readonly [PregameJoinSubject, PregameObservation])[],
): PregameObservationIndex {
  // The target identity embeds the join key as well as the observation's content. Without the key,
  // every row captured in the same snapshot reduces to one target, the index reads that as a
  // many-aliases-to-one-target collision, and it blocks the entire slate.
  type Target = { readonly key: string; readonly obs: PregameObservation };
  const pairs: (readonly [string, Target])[] = [];
  for (const [subject, obs] of entries) {
    const key = pregameJoinKey(subject);
    if (key == null) continue; // no ID, no join — never fall back to a name
    pairs.push([key, { key, obs }]);
  }
  const index = buildAliasIndex<Target>(
    pairs,
    (t) => `${t.key}::${t.obs.sourceRef}#${t.obs.snapshotRef ?? ""}#${t.obs.capturedAt ?? ""}#${t.obs.noVigProbability ?? ""}`,
  );
  return {
    lookup: (subject) => {
      const key = pregameJoinKey(subject);
      return key == null ? null : (index.resolve(key)?.obs ?? null);
    },
    size: pairs.length,
    ambiguousKeys: index.ambiguousAliases,
  };
}

// ── coverage summary ───────────────────────────────────────────────────────────────────────────

export interface CoverageSummary {
  readonly total: number;
  readonly byState: Readonly<Record<RowCoverageState, number>>;
  readonly rowLevelClaimable: number;
  readonly countable: number;
}

/** Summarise a set of envelopes, always reporting every state including the zeroes. */
export function summarizeCoverage(rows: readonly ResearchRowLineage[]): CoverageSummary {
  const byState: Record<RowCoverageState, number> = {
    PROVEN_STAMPED: 0,
    PROVEN_SIDECAR: 0,
    LEGACY_UNSTAMPED: 0,
    QUARANTINED: 0,
    CONFLICTED: 0,
    UNAVAILABLE: 0,
  };
  for (const r of rows) byState[r.coverageState] += 1;
  return {
    total: rows.length,
    byState,
    rowLevelClaimable: rows.filter((r) => r.rowLevelClaimAllowed).length,
    countable: rows.filter((r) => r.countsTowardRates).length,
  };
}
