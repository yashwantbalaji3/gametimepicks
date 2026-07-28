/**
 * Settlement lineage — every settled result must be reconstructable end to end.
 *
 * WHY THIS EXISTS, CONCRETELY
 * The Sprint 044 audit traced three historical event-identity collisions through to settlement and
 * found 49 settled legs carrying a WRONG outcome. All three collisions were doubleheaders; in each the
 * surviving `gamePk` was game 2, so game 1's predictions were graded against game 2's box score.
 * Because both halves of a doubleheader share rosters, those legs graded to Win/Loss rather than
 * erroring — the failure was plausible, not missing, which is why it survived for months.
 *
 * The lesson is not "check for doubleheaders". It is that a settled result which cannot be traced back
 * through prediction → event → market → source is unfalsifiable. Nobody can tell a correct result from
 * a confidently wrong one without the chain, and an unfalsifiable win rate is not evidence.
 *
 * So this validator requires the whole chain to be present and internally consistent, and fails on the
 * specific shapes that produced the 49 bad legs.
 *
 * Sport-independent: no imports from any sport's modules.
 */
import { buildAliasIndex } from "./event-identity";

/** One settled result together with the chain that produced it. */
export interface SettlementLineage {
  /** The prediction being settled. Unique per settled row. */
  readonly predictionId: string;
  /** OUR canonical event id — never a provider id. */
  readonly eventId: string;
  /** The market the prediction was made against. */
  readonly marketId: string;
  readonly outcome: string;
  /** Where the result came from — an official box score, never a model's own output or a web snippet. */
  readonly settlementSource: string;
  /** When settlement ran. Must not precede the event. */
  readonly settledAt: string;
  /** When the event started, for the ordering check. Null makes ordering unprovable, not fine. */
  readonly eventStart?: string | null;
  /** The provider identifier the settlement actually joined on, when it used one. */
  readonly joinedProviderId?: string | null;
}

export type LineageViolationCode =
  /** A required link in the chain is absent. */
  | "MISSING_LINEAGE"
  /** Two settled rows claim the same predictionId. */
  | "DUPLICATE_PREDICTION"
  /** One provider id was joined to more than one event — the defect that produced the 49 bad legs. */
  | "DUPLICATE_MAPPING"
  /** The settlement joined on a provider id no event claims. */
  | "UNRESOLVED_PROVIDER"
  /** Settled before the event started, or another impossible ordering. */
  | "IMPOSSIBLE_RELATIONSHIP"
  /** The result came from something that is not an official source. */
  | "UNTRUSTED_SOURCE";

export interface LineageViolation {
  readonly code: LineageViolationCode;
  readonly message: string;
  readonly subjects: readonly string[];
}

/**
 * Sources that may settle a result.
 *
 * An allowlist rather than a denylist: a source nobody thought to forbid is exactly the one that ends
 * up settling a leg from a search-result snippet. Adding an entry here should require justifying it.
 */
export const OFFICIAL_SETTLEMENT_SOURCES: readonly string[] = [
  "mlb-statsapi-boxscore",
  "mlb-statsapi-linescore",
  "nba-stats-boxscore",
  "api-football-fixtures",
  "espn-official-scores",
  "operator-official-input",
];

const parse = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Validate a set of settled results.
 *
 * Returns every violation rather than stopping at the first — a settlement run wants the full picture,
 * and reporting one problem at a time turns a single audit into six.
 */
export function validateSettlementLineage(
  rows: readonly SettlementLineage[],
): LineageViolation[] {
  const violations: LineageViolation[] = [];

  // 1 — every link present. A chain missing a link cannot be checked further, so these rows are
  //     reported and then excluded from the relational checks below rather than crashing them.
  const structural = new Set<string>();
  for (const r of rows) {
    const missing = (
      [
        ["predictionId", r.predictionId],
        ["eventId", r.eventId],
        ["marketId", r.marketId],
        ["outcome", r.outcome],
        ["settlementSource", r.settlementSource],
        ["settledAt", r.settledAt],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) {
      structural.add(r.predictionId || "(no predictionId)");
      violations.push({
        code: "MISSING_LINEAGE",
        message: `settled row "${r.predictionId || "(no predictionId)"}" is missing ${missing.join(", ")} — the result cannot be reconstructed`,
        subjects: [r.predictionId || "(no predictionId)"],
      });
    }
  }
  const wellFormed = rows.filter((r) => !structural.has(r.predictionId || "(no predictionId)"));

  // 2 — one settled row per prediction.
  const seen = new Map<string, number>();
  for (const r of wellFormed) seen.set(r.predictionId, (seen.get(r.predictionId) ?? 0) + 1);
  for (const [id, n] of seen) {
    if (n > 1) {
      violations.push({
        code: "DUPLICATE_PREDICTION",
        message: `prediction "${id}" was settled ${n} times — one of them is graded against the wrong event or double-counted`,
        subjects: [id],
      });
    }
  }

  // 3 — a provider id must map to exactly one event. THIS is the 49-bad-legs check.
  const joins = wellFormed.flatMap((r) =>
    r.joinedProviderId ? [[r.joinedProviderId, r.eventId] as const] : [],
  );
  const index = buildAliasIndex<string>(joins);
  for (const providerId of index.ambiguousAliases) {
    const events = [...new Set(joins.filter(([a]) => a === providerId).map(([, e]) => e))];
    violations.push({
      code: "DUPLICATE_MAPPING",
      message: `provider id "${providerId}" was settled against ${events.length} different events (${events.join(", ")}) — at least one set of results is graded against the wrong event`,
      subjects: [providerId, ...events],
    });
  }

  // 4 — timing and source.
  for (const r of wellFormed) {
    const settledAt = parse(r.settledAt);
    if (settledAt == null) {
      violations.push({
        code: "IMPOSSIBLE_RELATIONSHIP",
        message: `settled row "${r.predictionId}" has an unparseable settledAt "${r.settledAt}"`,
        subjects: [r.predictionId],
      });
    } else {
      const start = parse(r.eventStart);
      if (start != null && settledAt < start) {
        violations.push({
          code: "IMPOSSIBLE_RELATIONSHIP",
          message: `settled row "${r.predictionId}" was settled at ${r.settledAt}, BEFORE its event started at ${r.eventStart} — the outcome did not exist yet`,
          subjects: [r.predictionId],
        });
      }
    }

    if (!OFFICIAL_SETTLEMENT_SOURCES.includes(r.settlementSource)) {
      violations.push({
        code: "UNTRUSTED_SOURCE",
        message: `settled row "${r.predictionId}" cites source "${r.settlementSource}", which is not an official settlement source`,
        subjects: [r.predictionId, r.settlementSource],
      });
    }
  }

  return violations;
}

/**
 * Cross-check settled rows against the events that are actually known.
 *
 * Kept separate from `validateSettlementLineage` because it needs the event universe, which a caller
 * mid-settlement may not have. A settled row pointing at an unknown event is how an orphan hides.
 */
export function validateAgainstKnownEvents(
  rows: readonly SettlementLineage[],
  knownEventIds: readonly string[],
): LineageViolation[] {
  const known = new Set(knownEventIds);
  return rows
    .filter((r) => r.eventId && !known.has(r.eventId))
    .map((r) => ({
      code: "UNRESOLVED_PROVIDER" as const,
      message: `settled row "${r.predictionId}" points at event "${r.eventId}", which no known event claims`,
      subjects: [r.predictionId, r.eventId],
    }));
}

/**
 * Refuse to publish settled results that cannot be reconstructed.
 *
 * Throws. A settlement run whose lineage is broken should stop, not annotate — the whole reason the 49
 * bad legs persisted is that nothing downstream treated a suspicious result as a failure.
 */
export function assertSettlementPublishable(violations: readonly LineageViolation[]): void {
  if (violations.length === 0) return;
  const lines = violations.map((v) => `  [${v.code}] ${v.message}`).join("\n");
  throw new Error(
    `Settlement lineage validation failed — refusing to publish:\n${lines}\n\n` +
      `Every settled result must trace prediction → event → market → official source. ` +
      `See lib/identity/settlement-lineage.ts.`,
  );
}
