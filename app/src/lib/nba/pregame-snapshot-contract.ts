/**
 * NBA immutable pregame-snapshot contract (Phase 12). Defines the exact candidate fields a leakage-safe NBA
 * player-prop snapshot may carry, and the ONE rule that governs whether a captured value may ever be used in
 * challenger research. Mirrors the MLB pregame research archive (app/src/lib/mlb/pregame-archive/eligibility.ts):
 * a value is research-eligible only when it was provably known BEFORE tip-off. NBA is HISTORICAL_ONLY
 * (docs/NBA_ENGINE_FORENSIC_AUDIT.md) — this models NO probabilities, surfaces nothing, and never touches money.
 *
 * Why this is needed (grounded in the real 2026 artifacts):
 *   - Every historical board stores tip-off as a DISPLAY string ("8:30 PM ET"), never an ISO instant — so
 *     capturedAt < tipoff can never be mechanically PROVEN today. Under this contract that is TIMESTAMP_UNPROVEN.
 *   - The manual injury layer (pipeline/manual_overrides/news_signals.json) has a `createdAt` but NO structural
 *     capturedAt<tipoff enforcement — a post-tip edit could silently apply. This contract forbids that.
 *   - `expected_minutes` / confirmed starters do not exist anywhere in the pipeline — they are enumerated here as
 *     MISSING candidate fields a reactivation must add.
 *
 * Immutability rule: snapshots are append-only. A late update (e.g. an injury downgrade) creates a NEW cadence
 * snapshot that `supersedes` the prior one; it NEVER overwrites an earlier eligible snapshot. Pure + deterministic.
 */

/** HISTORICAL_ONLY. Every snapshot carries these — never public, never money-touching. */
export const NBA_CONTRACT_FLAGS = { public: false, approvedForProduction: false, productEligible: false } as const;
export const NBA_PREGAME_SNAPSHOT_SCHEMA_VERSION = "nba-pregame-snapshot-1";

/** Cadence reasons — why a snapshot was taken. A later reason supersedes an earlier one; it never mutates it. */
export type NbaSnapshotReason =
  | "BOARD_GENERATION"
  | "SCHEDULED_REFRESH"
  | "LINEUP_PROJECTED"
  | "LINEUP_CONFIRMED"
  | "INJURY_UPDATE"
  | "MARKET_REFRESH"
  | "FINAL_PREGAME_FREEZE";

export type NbaSnapshotFamily =
  | "schedule"
  | "active_roster"
  | "injury_status"
  | "starters"
  | "expected_minutes"
  | "markets"
  | "team_context"
  | "rest_context"
  | "role_usage";

export type NbaSnapshotQuality =
  | "COMPLETE"
  | "PARTIAL"
  | "MISSING"
  | "STALE"
  | "TIMESTAMP_UNPROVEN"
  | "POST_TIP_ONLY"
  | "FETCH_FAILED";

/**
 * The EXACT candidate-field catalog. These are the fields a pregame NBA snapshot may carry. `presentInHistorical`
 * flags whether the field exists in the 2026 pipeline at all — three do NOT and are reactivation gaps.
 */
export const NBA_SNAPSHOT_FIELD_CATALOG: ReadonlyArray<{
  key: string;
  family: NbaSnapshotFamily;
  presentInHistorical: boolean;
  description: string;
}> = [
  { key: "schedule", family: "schedule", presentInHistorical: true, description: "game + scheduled tip-off; MUST be an ISO instant, not a display string" },
  { key: "active_roster", family: "active_roster", presentInHistorical: false, description: "players eligible to play (inactives excluded) — not modeled historically" },
  { key: "injury_status", family: "injury_status", presentInHistorical: true, description: "OUT/DOUBTFUL/QUESTIONABLE/PROBABLE — manual layer, no capturedAt<tipoff enforcement today" },
  { key: "projected_starters", family: "starters", presentInHistorical: false, description: "projected starting five before official confirmation" },
  { key: "confirmed_starters", family: "starters", presentInHistorical: false, description: "confirmed starting five (official ~30 min pregame)" },
  { key: "expected_minutes", family: "expected_minutes", presentInHistorical: false, description: "projected minutes — MISSING in the pipeline; a reactivation must add it" },
  { key: "market_line", family: "markets", presentInHistorical: true, description: "player prop line + over/under prices — the de-vig baseline source" },
  { key: "team_total", family: "team_context", presentInHistorical: true, description: "team implied total (game-markets file; only 5 dates ever produced)" },
  { key: "spread", family: "team_context", presentInHistorical: true, description: "point spread (game-markets file)" },
  { key: "pace", family: "team_context", presentInHistorical: false, description: "expected game pace — not modeled historically" },
  { key: "rest_days", family: "rest_context", presentInHistorical: false, description: "days since the team's last game — derivable from schedule, not stored" },
  { key: "back_to_back", family: "rest_context", presentInHistorical: false, description: "2nd game of a back-to-back — derivable, not stored" },
  { key: "role_usage", family: "role_usage", presentInHistorical: false, description: "role / usage-rate context (starter vs bench, usage band)" },
];

/** One candidate input inside a snapshot. Only fields with `used:true` gate the snapshot's research eligibility. */
export interface NbaCandidateField {
  family: NbaSnapshotFamily;
  key: string;
  /** Opaque value — this contract governs TIMING + PROVENANCE, not modeling. */
  value: unknown;
  /** ISO — when the pipeline captured this value. */
  capturedAt: string | null;
  /** ISO — when the value provably became available at its source. Null ⇒ unproven. */
  availableAt: string | null;
  /** Whether the underlying source timestamp is proven (not merely inferred). */
  timestampProven: boolean;
  /** Does the research question actually consume this field? Only USED fields can make a snapshot ineligible. */
  used: boolean;
}

export interface NbaPregameSnapshotInput {
  gameKey: string; // canonical game key from identity-contract
  playerKey: string; // canonical player id from identity-contract (or "" for a team-level snapshot)
  reason: NbaSnapshotReason;
  /** ISO tip-off instant. A display-only string ("8:30 PM ET") is NOT proven — pass null. */
  tipoffTime: string | null;
  /** ISO — when THIS snapshot was captured. */
  capturedAt: string | null;
  fields: NbaCandidateField[];
  /** provenanceHash of the prior snapshot in this game/player cadence, or null for the first. */
  supersedes?: string | null;
  /** 0-based order within the cadence. */
  cadenceIndex?: number;
}

export interface NbaPregameSnapshot {
  readonly schemaVersion: string;
  readonly gameKey: string;
  readonly playerKey: string;
  readonly reason: NbaSnapshotReason;
  readonly tipoffTime: string | null;
  readonly capturedAt: string | null;
  readonly fields: ReadonlyArray<NbaCandidateField>;
  readonly provenanceHash: string;
  readonly supersedes: string | null;
  readonly cadenceIndex: number;
}

export interface SnapshotEligibilityResult {
  eligible: boolean;
  reason: string;
  quality: NbaSnapshotQuality;
  /** keys of the used fields that failed the pre-tip rule (empty when eligible). */
  offendingFields: string[];
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const isProvenInstant = (v: string | null | undefined): boolean => !!v && Number.isFinite(Date.parse(v)) && /\d{4}-\d\d-\d\dT/.test(v);

/** Deterministic, non-cryptographic FNV-1a hash → 8 hex chars. Pure; used only as a provenance tag. */
export function deterministicHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Provenance hash over the snapshot's IDENTITY + USED inputs. Deterministic: identical inputs (including capturedAt +
 * cadenceIndex) yield an identical hash; changing any used value/timing changes it. Unused fields do not affect it.
 */
export function computeProvenanceHash(x: NbaPregameSnapshotInput): string {
  const used = x.fields
    .filter((f) => f.used)
    .map((f) => `${f.family}|${f.key}|${stableValue(f.value)}|${f.availableAt ?? "∅"}|${f.timestampProven ? 1 : 0}`)
    .sort();
  const payload = [
    NBA_PREGAME_SNAPSHOT_SCHEMA_VERSION,
    x.gameKey,
    x.playerKey,
    x.reason,
    x.tipoffTime ?? "∅",
    x.capturedAt ?? "∅",
    String(x.cadenceIndex ?? 0),
    used.join(";"),
  ].join("~");
  return deterministicHash(payload);
}

function stableValue(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, Object.keys(v as object).sort());
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** Build an IMMUTABLE snapshot. The returned object (and its fields) are deep-frozen — any mutation attempt throws. */
export function createSnapshot(x: NbaPregameSnapshotInput): NbaPregameSnapshot {
  const snap: NbaPregameSnapshot = {
    schemaVersion: NBA_PREGAME_SNAPSHOT_SCHEMA_VERSION,
    gameKey: x.gameKey,
    playerKey: x.playerKey,
    reason: x.reason,
    tipoffTime: x.tipoffTime,
    capturedAt: x.capturedAt,
    fields: x.fields.map((f) => ({ ...f })),
    provenanceHash: computeProvenanceHash(x),
    supersedes: x.supersedes ?? null,
    cadenceIndex: x.cadenceIndex ?? 0,
  };
  return deepFreeze(snap);
}

/**
 * The single snapshot-eligibility gate. A snapshot is research-eligible only when:
 *   1. tip-off is a PROVEN ISO instant (display-only ⇒ TIMESTAMP_UNPROVEN),
 *   2. the snapshot's capturedAt is a proven instant strictly before tip-off,
 *   3. EVERY used field has a proven availableAt strictly before tip-off and a proven source timestamp.
 * Never inferred; anything unproven is ineligible.
 */
export function snapshotEligibility(snap: NbaPregameSnapshot): SnapshotEligibilityResult {
  const start = ms(snap.tipoffTime);
  if (!isProvenInstant(snap.tipoffTime) || !Number.isFinite(start)) {
    return { eligible: false, reason: "no proven ISO tip-off instant (a display-only tip-off is unprovable)", quality: "TIMESTAMP_UNPROVEN", offendingFields: [] };
  }
  const cap = ms(snap.capturedAt);
  if (!Number.isFinite(cap)) return { eligible: false, reason: "no proven capture time", quality: "TIMESTAMP_UNPROVEN", offendingFields: [] };
  if (cap >= start) return { eligible: false, reason: "snapshot captured at/after tip-off", quality: "POST_TIP_ONLY", offendingFields: [] };

  const usedFields = snap.fields.filter((f) => f.used);
  if (usedFields.length === 0) return { eligible: false, reason: "no used input fields", quality: "MISSING", offendingFields: [] };

  const offending: string[] = [];
  let unproven = false;
  for (const f of usedFields) {
    const fc = ms(f.capturedAt);
    const fa = ms(f.availableAt);
    if (!f.timestampProven || !Number.isFinite(fa)) {
      unproven = true;
      offending.push(f.key);
      continue;
    }
    if (Number.isFinite(fc) && fc >= start) {
      offending.push(f.key);
      continue;
    }
    if (fa >= start) offending.push(f.key);
  }
  if (offending.length > 0) {
    return {
      eligible: false,
      reason: unproven ? "a used input has an unproven source timestamp" : "a used input was available only at/after tip-off",
      quality: unproven ? "TIMESTAMP_UNPROVEN" : "POST_TIP_ONLY",
      offendingFields: Array.from(new Set(offending)),
    };
  }
  return { eligible: true, reason: "tip-off proven; snapshot + every used input captured & available strictly before tip-off", quality: "COMPLETE", offendingFields: [] };
}

/**
 * Append a NEW cadence snapshot after a late update (e.g. an injury downgrade). It supersedes the prior snapshot and
 * increments the cadence index; the prior snapshot object is returned UNCHANGED (append-only, never overwritten).
 */
export function appendCadenceSnapshot(prior: NbaPregameSnapshot, update: Omit<NbaPregameSnapshotInput, "supersedes" | "cadenceIndex">): NbaPregameSnapshot {
  return createSnapshot({ ...update, supersedes: prior.provenanceHash, cadenceIndex: prior.cadenceIndex + 1 });
}

/**
 * From an append-only cadence log, the authoritative snapshot for research is the LATEST (highest cadenceIndex) one
 * that is itself eligible. Earlier eligible snapshots are preserved as the record; they are never mutated away.
 */
export function latestEligibleSnapshot(cadence: readonly NbaPregameSnapshot[]): NbaPregameSnapshot | null {
  const eligible = cadence.filter((s) => snapshotEligibility(s).eligible);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (b.cadenceIndex > a.cadenceIndex ? b : a));
}
