/**
 * EventIdentity — the sport-independent answer to "which real-world event is this?".
 *
 * WHY THIS EXISTS
 * Sprint 041 fixed a defect where two halves of an MLB doubleheader collapsed onto one StatsAPI
 * `gamePk`: one game's markets were joined to the other game's model output, and a third game was
 * simulated but unreachable. Measured across 58 committed boards: 3 affected, 4 collisions, 1 orphan.
 *
 * The root cause was not baseball. It was treating a PROVIDER'S identifier as the identity of the
 * event, and deriving that identifier from an assumption ("a team plays once per date") that happened
 * to hold most days. Every sport has an equivalent trap — UFC rematches between the same two fighters,
 * soccer fixtures replayed after abandonment, NBA doubleheaders in tournament formats.
 *
 * So identity is modelled here as OURS, with provider identifiers demoted to aliases:
 *
 *     eventId          the identity we control
 *     providerIds[]    what each upstream source happens to call it
 *
 * A provider id is a lookup key, never the primary key. That single inversion is what makes the
 * Sprint 041 class of bug structurally expressible-and-catchable rather than a per-sport surprise.
 *
 * SCOPE
 * This module is deliberately data-only: types, a deterministic id, and validation. It performs no
 * I/O, knows no sport, and imports nothing from `lib/mlb`. Sport-specific resolution lives in
 * adapters (see `mlb-adapter.ts`), which is what keeps the universal layer from slowly re-acquiring
 * baseball assumptions.
 */

/** Where an event sits in its lifecycle. Deliberately coarse — surfaces need the distinction, not detail. */
export type EventStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "cancelled"
  | "unknown";

/**
 * A side of the event.
 *
 * `role` is not `home`/`away` only: combat sports and individual sports have competitors with no
 * home side, and forcing them into a home/away shape is exactly the kind of borrowed assumption this
 * module exists to avoid.
 */
export interface EventParticipant {
  readonly role: "home" | "away" | "competitor";
  readonly name: string;
  readonly abbreviation?: string | null;
  /** Per-provider identifiers for this participant, e.g. `{ statsapi: "119" }`. */
  readonly providerIds?: Readonly<Record<string, string>>;
}

/** One upstream source's name for this event. An ALIAS, never the identity. */
export interface ProviderRef {
  /** Stable source key: "statsapi", "odds-api", "api-football", "espn". */
  readonly provider: string;
  readonly id: string;
  /** What the provider calls this kind of id — "game", "fixture", "fight", "event". */
  readonly kind?: string;
}

export interface EventProvenance {
  /** Which adapter produced this identity. */
  readonly source: string;
  /** When it was resolved. */
  readonly resolvedAt: string;
  /**
   * HOW it was resolved. Carried because the Sprint 041 defect was invisible precisely because the
   * resolution method was not recorded — "matched on team name alone" would have been a visible
   * red flag on a doubleheader date.
   */
  readonly method: string;
}

export interface EventIdentity {
  /** OUR identifier. Deterministic; see `deriveEventId`. */
  readonly eventId: string;
  readonly sport: string;
  readonly league: string | null;
  readonly participants: readonly EventParticipant[];
  /** ISO 8601 scheduled start, or null when genuinely unknown. Never guessed. */
  readonly scheduledStart: string | null;
  readonly status: EventStatus;
  /** Every upstream alias. May be empty while an event is known to us but not yet matched. */
  readonly providerIds: readonly ProviderRef[];
  readonly provenance: EventProvenance;
}

// ── identity derivation ────────────────────────────────────────────────────────────────────────

const slug = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Derive a deterministic event id.
 *
 * Includes the scheduled start to the MINUTE, which is what separates the two halves of a
 * doubleheader, a rematch from its original bout, and a replayed fixture from the abandoned one.
 * Date alone is what failed in Sprint 041.
 *
 * Participants are sorted so that argument order cannot change the id — two adapters describing the
 * same event must agree, or the whole point is lost.
 */
export function deriveEventId(input: {
  sport: string;
  league?: string | null;
  participants: readonly { name: string }[];
  scheduledStart: string | null;
}): string {
  const parts = [...input.participants.map((p) => slug(p.name))].sort();
  /*
   * THE ID IS A FUNCTION OF THE INSTANT, not of how the instant was spelled.
   *
   * This did string surgery on the ISO text — strip a trailing `:ss`, drop separators, lowercase the
   * T. It worked only for the exact form `...THH:MM:SSZ`, and silently produced a DIFFERENT id for
   * every other valid spelling of the same moment:
   *
   *   2026-08-21T19:00:00Z        -> ...t1900   (correct)
   *   2026-08-21T19:00Z           -> ...t19     (the regex ate the MINUTES, there being no seconds)
   *   2026-08-21T19:00:00+00:00   -> ...t190000+00
   *   2026-08-21T20:00:00+01:00   -> ...t200000+01   (the same instant, carrying a local hour)
   *
   * That is not cosmetic. It is the join key every sport in this repo uses, and it broke the first
   * real EPL settlement: the fixture capture writes full ISO and ESPN's results capture writes
   * `19:00Z` without seconds, so the same match minted `...t1900` on one side and `...t19` on the
   * other. The result quarantined as "no scheduled fixture with this canonical identity" and Arsenal
   * 3-0 Coventry could not be graded at all.
   *
   * Parsing to a UTC instant and formatting to the minute makes every spelling of one moment yield
   * one id. The well-formed `...THH:MM:SSZ` case is unchanged, which is what every committed id in
   * the repo was built from.
   */
  const when = (() => {
    if (!input.scheduledStart) return "unscheduled";
    const t = Date.parse(input.scheduledStart);
    /* Unparseable stays verbatim-ish rather than silently becoming "unscheduled" — an id that cannot
       be built is a caller problem, and quietly relabelling it would hide the bad input. */
    if (!Number.isFinite(t)) return slug(input.scheduledStart);
    const d = new Date(t);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}t${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
  })();
  const sport = slug(input.sport);
  const league = input.league ? slug(input.league) : null;
  // Omit the league segment when it slugs to the same token as the sport ("mlb"/"MLB"), so the id
  // reads `mlb:teams:when` rather than `mlb:mlb:teams:when`. Still deterministic and still unique —
  // the segment only collapses when it carried no information the sport segment did not already.
  const segments = league && league !== sport ? [sport, league] : [sport];
  return [...segments, parts.join("-v-"), when].join(":");
}

// ── alias resolution ───────────────────────────────────────────────────────────────────────────

/**
 * A one-way alias index that refuses to resolve a corrupted mapping.
 *
 * SPRINT 043. Consumers join artifacts by building `Map<providerId, canonicalId>` with `.set()`,
 * which is last-write-wins and therefore reproduces the Sprint 041 defect at every read site. On
 * 2026-07-28 two provider events resolved to the same `gamePk`, so both inherited the same
 * simulation — a plain Map had no way to notice, in either direction.
 *
 * This index tracks both directions and refuses any alias touched by a many-to-one mapping. The
 * consumer then gets `null` — visibly missing data — instead of another event's model output
 * presented as this event's. Wrong-but-plausible is the more expensive failure: nobody investigates it.
 */
export interface AliasIndex<T> {
  /** The canonical value for an alias, or null when unknown OR ambiguous. Never guesses. */
  resolve(alias: string): T | null;
  /** Aliases suppressed because they mapped to more than one canonical value. */
  readonly ambiguousAliases: readonly string[];
  /** Canonical values claimed by more than one alias — the Sprint 041 signature. */
  readonly collidedTargets: readonly string[];
  /** True when every alias resolves one-to-one. */
  readonly isInjective: boolean;
}

/**
 * Build an alias index from (alias, canonical) pairs.
 *
 * `key` reduces a canonical value to a comparable string, so this serves numeric `gamePk`s, string
 * fixture ids, or whole identity objects without the index knowing which sport it serves.
 */
export function buildAliasIndex<T>(
  pairs: readonly (readonly [alias: string, target: T])[],
  key: (target: T) => string = String,
): AliasIndex<T> {
  const byAlias = new Map<string, Map<string, T>>();
  const aliasesByTarget = new Map<string, Set<string>>();

  for (const [alias, target] of pairs) {
    if (!alias) continue;
    const k = key(target);
    if (!byAlias.has(alias)) byAlias.set(alias, new Map());
    byAlias.get(alias)!.set(k, target);
    if (!aliasesByTarget.has(k)) aliasesByTarget.set(k, new Set());
    aliasesByTarget.get(k)!.add(alias);
  }

  const ambiguousAliases = [...byAlias].filter(([, t]) => t.size > 1).map(([a]) => a).sort();
  const collidedTargets = [...aliasesByTarget].filter(([, a]) => a.size > 1).map(([t]) => t).sort();
  // Block BOTH sides: an alias that is itself fine but points at a target another alias also claims
  // is exactly the 2026-07-28 case, and resolving it would hand back a shared simulation.
  const blocked = new Set<string>([
    ...ambiguousAliases,
    ...collidedTargets.flatMap((t) => [...(aliasesByTarget.get(t) ?? [])]),
  ]);

  return {
    resolve(alias: string): T | null {
      if (blocked.has(alias)) return null;
      const targets = byAlias.get(alias);
      if (!targets || targets.size !== 1) return null;
      return [...targets.values()][0];
    },
    ambiguousAliases,
    collidedTargets,
    isInjective: ambiguousAliases.length === 0 && collidedTargets.length === 0,
  };
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

export type IdentityViolationCode =
  /** Two identities share an eventId — one identity would represent two real events. */
  | "DUPLICATE_EVENT_ID"
  /** One provider id is claimed by more than one event. The Sprint 041 signature. */
  | "PROVIDER_ID_COLLISION"
  /** A dependent record (market/simulation/settlement) points at no known event. */
  | "UNRESOLVED_REFERENCE"
  /** A dependent record resolves to more than one event. */
  | "AMBIGUOUS_REFERENCE"
  /** An event has a simulation nobody can reach through a market. */
  | "ORPHANED_SIMULATION"
  /** Structurally invalid identity — missing the fields that make it an identity at all. */
  | "MALFORMED_IDENTITY";

export interface IdentityViolation {
  readonly code: IdentityViolationCode;
  readonly message: string;
  /** The eventIds or provider refs involved, for actionable failure output. */
  readonly subjects: readonly string[];
}

const providerKey = (p: ProviderRef): string => `${p.provider}:${p.id}`;

/**
 * Validate a set of identities.
 *
 * Returns violations rather than throwing: a publication gate wants to report every problem at once,
 * not stop at the first. Callers decide whether to block.
 */
export function validateIdentities(identities: readonly EventIdentity[]): IdentityViolation[] {
  const violations: IdentityViolation[] = [];

  // INVARIANT 1 — one identity, one real event.
  const byEventId = new Map<string, EventIdentity[]>();
  for (const e of identities) {
    if (!e.eventId || !e.sport || e.participants.length === 0) {
      violations.push({
        code: "MALFORMED_IDENTITY",
        message: `identity missing eventId, sport, or participants: ${JSON.stringify(e.eventId ?? "(none)")}`,
        subjects: [e.eventId ?? "(none)"],
      });
      continue;
    }
    if (!byEventId.has(e.eventId)) byEventId.set(e.eventId, []);
    byEventId.get(e.eventId)!.push(e);
  }
  for (const [id, group] of byEventId) {
    if (group.length > 1) {
      violations.push({
        code: "DUPLICATE_EVENT_ID",
        message: `eventId "${id}" is claimed by ${group.length} identities — one identity cannot represent multiple events`,
        subjects: [id],
      });
    }
  }

  // INVARIANT 2 — a provider id maps to exactly one event. This is the Sprint 041 defect, generalised.
  const byProvider = new Map<string, Set<string>>();
  for (const e of identities) {
    for (const ref of e.providerIds ?? []) {
      const key = providerKey(ref);
      if (!byProvider.has(key)) byProvider.set(key, new Set());
      byProvider.get(key)!.add(e.eventId);
    }
  }
  for (const [key, events] of byProvider) {
    if (events.size > 1) {
      violations.push({
        code: "PROVIDER_ID_COLLISION",
        message: `provider ref "${key}" maps to ${events.size} events (${[...events].join(", ")}) — a provider id is an alias and must resolve to one event`,
        subjects: [key, ...events],
      });
    }
  }

  return violations;
}

/** A record that belongs to exactly one event: a market snapshot, model output, or settlement. */
export interface EventScopedRecord {
  /** Free-form label used in failure messages, e.g. "market:mk-abc" or "sim:824490". */
  readonly ref: string;
  /** The provider ref this record carries, if it identifies its event that way. */
  readonly providerRef?: ProviderRef;
  /** Or a direct eventId, when the record was produced downstream of resolution. */
  readonly eventId?: string;
}

/**
 * Validate that dependent records resolve to exactly one event each (invariants 3-5), and that no
 * event has a simulation unreachable from any market (invariant 6).
 *
 * `simulations` and `markets` are kept separate on purpose: an orphaned simulation is only detectable
 * by comparing the two, and Sprint 041 showed that a silently orphaned simulation is the visible
 * symptom of an upstream identity collapse.
 */
export function validateEventScopedRecords(input: {
  identities: readonly EventIdentity[];
  markets?: readonly EventScopedRecord[];
  simulations?: readonly EventScopedRecord[];
  settlements?: readonly EventScopedRecord[];
}): IdentityViolation[] {
  const violations: IdentityViolation[] = [];

  const eventIds = new Set(input.identities.map((e) => e.eventId));
  const byProvider = new Map<string, string[]>();
  for (const e of input.identities) {
    for (const ref of e.providerIds ?? []) {
      const key = providerKey(ref);
      byProvider.set(key, [...(byProvider.get(key) ?? []), e.eventId]);
    }
  }

  const resolve = (rec: EventScopedRecord): string[] => {
    if (rec.eventId) return eventIds.has(rec.eventId) ? [rec.eventId] : [];
    if (rec.providerRef) return byProvider.get(providerKey(rec.providerRef)) ?? [];
    return [];
  };

  const checkGroup = (records: readonly EventScopedRecord[] | undefined, label: string) => {
    for (const rec of records ?? []) {
      const hits = resolve(rec);
      if (hits.length === 0) {
        violations.push({
          code: "UNRESOLVED_REFERENCE",
          message: `${label} "${rec.ref}" resolves to no known event`,
          subjects: [rec.ref],
        });
      } else if (hits.length > 1) {
        violations.push({
          code: "AMBIGUOUS_REFERENCE",
          message: `${label} "${rec.ref}" resolves to ${hits.length} events (${hits.join(", ")})`,
          subjects: [rec.ref, ...hits],
        });
      }
    }
  };

  checkGroup(input.markets, "market");
  checkGroup(input.simulations, "simulation");
  checkGroup(input.settlements, "settlement");

  // INVARIANT 6 — a simulation with no market pointing at its event is orphaned.
  if (input.simulations && input.markets) {
    const marketEvents = new Set(input.markets.flatMap(resolve));
    for (const sim of input.simulations) {
      const hits = resolve(sim);
      if (hits.length === 1 && !marketEvents.has(hits[0])) {
        violations.push({
          code: "ORPHANED_SIMULATION",
          message: `simulation "${sim.ref}" is attached to event ${hits[0]} which no market reaches — this is how a collapsed identity shows itself`,
          subjects: [sim.ref, hits[0]],
        });
      }
    }
  }

  return violations;
}

/**
 * Publication gate (invariant 7): duplicate or ambiguous mappings must fail BEFORE anything ships.
 *
 * Throws rather than returning, because the one caller that matters is a pipeline step whose correct
 * behaviour on a violation is to stop.
 */
export function assertPublishable(violations: readonly IdentityViolation[]): void {
  if (violations.length === 0) return;
  const lines = violations.map((v) => `  [${v.code}] ${v.message}`).join("\n");
  throw new Error(
    `Event identity validation failed — refusing to publish:\n${lines}\n\n` +
      `A provider identifier is an alias, not an identity. See lib/identity/event-identity.ts.`,
  );
}
