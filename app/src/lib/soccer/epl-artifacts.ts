/**
 * EPL artifact schemas — the shape of the first EPL file ever written, and the rules it must pass.
 *
 * THE ROOT IS NEW ON PURPOSE
 * All soccer artifacts today live under `public/data/world-cup/`, which is a CLOSED destination
 * (guard: `lib/world-cup-closeout.test.mjs`) and holds two incompatible graded schemas in one
 * directory. Writing EPL output there would resurrect a closed surface and inherit a directory
 * nothing can parse uniformly. EPL gets `public/data/soccer/epl/`, competition-scoped so a second
 * competition gets its own root rather than joining a shared pool.
 *
 * LEAKAGE SAFETY IS IN THE SCHEMA, NOT IN A LATER AUDIT
 * Every odds row carries its own `capturedAt` and the `kickoffIso` it must precede, and a row that
 * violates the ordering is REJECTED at validation. This is deliberately stricter than the MLB
 * research archive, which learned the rule after the fact and then had to prove eligibility
 * retroactively for artifacts that never recorded it. A file-level `generatedAt` cannot substitute:
 * it describes the build, not the row.
 *
 * NOTHING HERE IS A MODEL. `MODEL_FIELD_KEYS` is refused at validation so a modelled number cannot
 * enter the artifact by accident and then be rendered as market intelligence.
 */
import { isLeakageSafe } from "@/lib/identity/sport-adapter";
import type { ProviderRef } from "@/lib/identity/event-identity";
import type { FixtureLifecycleState } from "./epl-lifecycle";
import type { MatchResult1x2Quote, SoccerMarketFamily } from "./epl-markets";

/** Repo-relative artifact root. Competition-scoped; `world-cup/` is never a destination. */
export const EPL_ARTIFACT_ROOT = "public/data/soccer/epl";

/** The four artifact kinds. `results` and `settlement` stay empty until a results source is chosen. */
export const EPL_ARTIFACT_SUBROOTS = ["fixtures", "odds", "results", "settlement"] as const;
export type EplArtifactSubroot = (typeof EPL_ARTIFACT_SUBROOTS)[number];

export const EPL_SCHEMA_VERSION = 1;

/**
 * How the artifact should be read.
 *
 * `FIXTURE_SAMPLE` exists so a shape can be committed and tested before a single real capture. It is
 * not a placeholder for live data — a sample never counts toward coverage, never settles, and is
 * swept out of the public export by `scripts/prune-internal-routes.mjs` via `public: false`.
 */
export type EplDataClass = "LIVE_CAPTURE" | "FIXTURE_SAMPLE";

export interface EplArtifactHeader {
  readonly schemaVersion: number;
  readonly competition: "epl";
  readonly season: string;
  readonly dataClass: EplDataClass;
  /** When the file was built. Never a substitute for a row's `capturedAt`. */
  readonly generatedAt: string;
  /** The upstream this came from, named exactly. "synthetic" for a sample. */
  readonly source: string;
  /** False keeps the file out of the deployed export. Samples are always false. */
  readonly public: boolean;
  readonly notes?: string;
}

export interface EplFixtureRow {
  /** OUR canonical id from `epl-identity.ts`. */
  readonly eventId: string;
  readonly homeClub: string;
  readonly awayClub: string;
  /** Kickoff in UTC. Part of the identity, so it is never adjusted after the fact. */
  readonly kickoffIso: string;
  readonly lifecycle: FixtureLifecycleState;
  /** Upstream aliases. Never the identity. */
  readonly providerRefs: readonly ProviderRef[];
  /** When we observed this fixture row. */
  readonly capturedAt: string;
}

export interface EplOddsRow {
  readonly eventId: string;
  /** Repeated on the row so eligibility is checkable without joining the fixture artifact. */
  readonly kickoffIso: string;
  readonly capturedAt: string;
  readonly market: SoccerMarketFamily;
  readonly book: string;
  readonly prices: MatchResult1x2Quote;
}

export interface EplArtifact<Row> extends EplArtifactHeader {
  readonly rows: readonly Row[];
}

export type EplFixtureArtifact = EplArtifact<EplFixtureRow>;
export type EplOddsArtifact = EplArtifact<EplOddsRow>;

// ── validation ─────────────────────────────────────────────────────────────────────────────────

export type EplRowRejectionCode =
  | "MISSING_EVENT_ID"
  | "MISSING_KICKOFF"
  | "MISSING_CAPTURED_AT"
  | "UNPARSEABLE_TIMESTAMP"
  /** `capturedAt >= kickoffIso`. The row knows its own outcome's start; it is not a pregame feature. */
  | "CAPTURE_NOT_PREGAME"
  | "UNKNOWN_LIFECYCLE"
  | "MALFORMED_PRICES"
  | "UNSUPPORTED_MARKET"
  /** A modelled field reached an artifact that is market intelligence only. */
  | "MODEL_FIELD_PRESENT";

export interface EplRowRejection {
  readonly code: EplRowRejectionCode;
  readonly message: string;
  readonly index: number;
  readonly eventId: string | null;
}

export interface EplValidation<Row> {
  readonly accepted: readonly Row[];
  readonly rejected: readonly EplRowRejection[];
  /** True when the artifact contributed no rejected rows. */
  readonly clean: boolean;
}

/**
 * Field names that would make this a model artifact.
 *
 * Refused structurally rather than by review. The prototype answers "what does the market believe
 * and what actually happened"; a field named `projection` or `rating` in the same row is
 * indistinguishable from market data once it reaches a template.
 */
export const MODEL_FIELD_KEYS: readonly string[] = [
  "modelProb",
  "modelProbability",
  "projection",
  "projected",
  "rating",
  "recommendation",
  "selection",
  "confidence",
  "expectedValue",
  "ev",
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep scan for a forbidden key. Returns the first path found, or null. */
export function findModelField(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findModelField(value[i], [...path, String(i)]);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [k, v] of Object.entries(value)) {
    if (MODEL_FIELD_KEYS.includes(k)) return [...path, k].join(".");
    const hit = findModelField(v, [...path, k]);
    if (hit) return hit;
  }
  return null;
}

const parseable = (iso: string | null | undefined): boolean =>
  typeof iso === "string" && iso.length > 0 && Number.isFinite(Date.parse(iso));

function commonRowChecks(
  row: { eventId?: unknown; kickoffIso?: unknown; capturedAt?: unknown },
  index: number,
): EplRowRejection | null {
  const eventId = typeof row.eventId === "string" && row.eventId ? row.eventId : null;
  const at = (code: EplRowRejectionCode, message: string): EplRowRejection => ({
    code,
    message,
    index,
    eventId,
  });

  if (!eventId) return at("MISSING_EVENT_ID", "row has no canonical eventId");
  if (typeof row.kickoffIso !== "string" || !row.kickoffIso) {
    return at("MISSING_KICKOFF", "row has no kickoffIso — leakage eligibility is unprovable");
  }
  if (typeof row.capturedAt !== "string" || !row.capturedAt) {
    return at("MISSING_CAPTURED_AT", "row has no capturedAt — a file-level generatedAt is not a substitute");
  }
  if (!parseable(row.kickoffIso) || !parseable(row.capturedAt)) {
    return at("UNPARSEABLE_TIMESTAMP", `kickoffIso "${row.kickoffIso}" / capturedAt "${row.capturedAt}"`);
  }
  const modelField = findModelField(row);
  if (modelField) {
    return at("MODEL_FIELD_PRESENT", `row carries a modelled field at "${modelField}"`);
  }
  return null;
}

/**
 * The leakage gate, stated once.
 *
 * Delegates to the canonical `isLeakageSafe`, which is fail-closed on a missing or unparseable
 * timestamp. Equality is NOT pregame: a capture stamped at kickoff cannot be shown to precede it.
 */
export function isRowPregame(row: { capturedAt?: string | null; kickoffIso?: string | null }): boolean {
  return isLeakageSafe({ capturedAt: row.capturedAt ?? "", eventStart: row.kickoffIso ?? null });
}

export function validateFixtureArtifact(artifact: EplFixtureArtifact): EplValidation<EplFixtureRow> {
  const accepted: EplFixtureRow[] = [];
  const rejected: EplRowRejection[] = [];

  artifact.rows.forEach((row, index) => {
    const common = commonRowChecks(row, index);
    if (common) {
      rejected.push(common);
      return;
    }
    if (!row.lifecycle || row.lifecycle === "UNKNOWN") {
      rejected.push({
        code: "UNKNOWN_LIFECYCLE",
        message: "fixture lifecycle is UNKNOWN — fail closed rather than assume SCHEDULED",
        index,
        eventId: row.eventId,
      });
      return;
    }
    accepted.push(row);
  });

  return { accepted, rejected, clean: rejected.length === 0 };
}

/**
 * Validate an odds artifact, rejecting any row not captured before its kickoff.
 *
 * Rejection is the whole point: a postgame capture is not "slightly late" data, it is a row that can
 * see the result it would be used to study.
 */
export function validateOddsArtifact(artifact: EplOddsArtifact): EplValidation<EplOddsRow> {
  const accepted: EplOddsRow[] = [];
  const rejected: EplRowRejection[] = [];

  artifact.rows.forEach((row, index) => {
    const common = commonRowChecks(row, index);
    if (common) {
      rejected.push(common);
      return;
    }
    if (row.market !== "MATCH_RESULT_1X2") {
      rejected.push({
        code: "UNSUPPORTED_MARKET",
        message: `market "${row.market}" is not proven on real EPL payloads — only MATCH_RESULT_1X2 ships`,
        index,
        eventId: row.eventId,
      });
      return;
    }
    const p = row.prices;
    const numericOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
    if (!p || !numericOrNull(p.HOME) || !numericOrNull(p.DRAW) || !numericOrNull(p.AWAY)) {
      rejected.push({
        code: "MALFORMED_PRICES",
        message: "three-way prices must each be a finite number or null",
        index,
        eventId: row.eventId,
      });
      return;
    }
    if (!isRowPregame(row)) {
      rejected.push({
        code: "CAPTURE_NOT_PREGAME",
        message: `capturedAt ${row.capturedAt} does not precede kickoff ${row.kickoffIso}`,
        index,
        eventId: row.eventId,
      });
      return;
    }
    accepted.push(row);
  });

  return { accepted, rejected, clean: rejected.length === 0 };
}

/**
 * Refuse to publish an artifact with any rejected row.
 *
 * Partial acceptance is available to a research caller that wants the clean subset; publication is
 * not, because a file that silently dropped its bad rows looks like a file that never had any.
 */
export function assertArtifactPublishable<Row>(
  validation: EplValidation<Row>,
  label: string,
): void {
  if (validation.clean) return;
  const lines = validation.rejected
    .map((r) => `  [${r.code}] row ${r.index} (${r.eventId ?? "no eventId"}): ${r.message}`)
    .join("\n");
  throw new Error(`EPL ${label} artifact failed validation — refusing to publish:\n${lines}`);
}
