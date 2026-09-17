/**
 * Provider alias engine — canonical → aliases and alias → canonical, validated both ways.
 *
 * Same fail-closed semantics as `buildAliasIndex` in lib/identity/event-identity.ts (Sprint 043), which
 * this does not replace: an alias claimed by more than one canonical entity resolves to NOTHING (never
 * last-write-wins), and the collision is reported. Where the two differ is scope. Here a canonical entity
 * legitimately has several aliases (an NFL player has ESPN, gsis and PFR ids), so "one target, many
 * aliases" is normal — but ONE canonical entity holding TWO ids from the same provider namespace is
 * refused, because that is two provider entities merged into one (the "names look identical" hazard).
 *
 * The key is sport-scoped: ESPN team ids are league-scoped numbers (NFL team 28 and an EPL club 28 are
 * different teams), so `resolve` takes the sport.
 *
 * Aliases NEVER resolve by display name. There is no name path in this module.
 */

export const RESOLUTION = Object.freeze({ RESOLVED: "RESOLVED", UNKNOWN: "UNKNOWN", AMBIGUOUS: "AMBIGUOUS" });

export const aliasKey = (sportId, provider, entityType, id) => `${sportId}|${provider}|${entityType}|${id}`;

/**
 * LINEAGE namespaces may hold several ids for one entity (every superseded shipped EPL fixture id of one
 * match — a fixture moved twice has two). Reverse uniqueness still applies: an old id resolves to ONE game.
 */
export const LINEAGE_NAMESPACES = Object.freeze(new Set(["gametime_epl_event"]));

/**
 * @param {Array<{ sportId: string, id: string, providerAliases: Array<{provider:string, entityType:string, id:string}> }>} records
 *   any mix of team / player / game / season / league records
 */
export function buildAliasIndex(records) {
  /** @type {Map<string, Set<string>>} alias key → canonical ids */
  const byAlias = new Map();
  /** @type {Map<string, Array<{provider:string, entityType:string, id:string}>>} `${sport}|${type}|${canonical}` → aliases */
  const byCanonical = new Map();
  const sameProviderDuplicates = [];
  const duplicateCanonical = [];

  for (const r of records) {
    const type = r.providerAliases?.[0]?.entityType ?? null;
    for (const a of r.providerAliases ?? []) {
      const k = aliasKey(r.sportId, a.provider, a.entityType, a.id);
      if (!byAlias.has(k)) byAlias.set(k, new Set());
      byAlias.get(k).add(r.id);
    }
    if (type == null) continue;
    const ck = `${r.sportId}|${type}|${r.id}`;
    if (byCanonical.has(ck)) duplicateCanonical.push(ck);
    byCanonical.set(ck, [...(r.providerAliases ?? [])]);
    const perProvider = new Map();
    for (const a of r.providerAliases ?? []) {
      const pk = `${a.provider}|${a.entityType}`;
      perProvider.set(pk, [...(perProvider.get(pk) ?? []), a.id]);
    }
    for (const [pk, ids] of perProvider) {
      if (ids.length > 1 && !LINEAGE_NAMESPACES.has(pk.split("|")[0])) sameProviderDuplicates.push({ canonical: ck, provider: pk, ids: [...ids].sort() });
    }
  }

  const collisions = [...byAlias]
    .filter(([, ids]) => ids.size > 1)
    .map(([alias, ids]) => ({ alias, canonicalIds: [...ids].sort() }))
    .sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));

  /**
   * @param {string} sportId @param {string} provider @param {string} entityType @param {string|number} providerId
   * @returns {{ status: "RESOLVED", id: string } | { status: "UNKNOWN" } | { status: "AMBIGUOUS", candidates: string[] }}
   */
  function resolve(sportId, provider, entityType, providerId) {
    const ids = byAlias.get(aliasKey(sportId, provider, entityType, String(providerId)));
    if (!ids || ids.size === 0) return { status: RESOLUTION.UNKNOWN };
    if (ids.size > 1) return { status: RESOLUTION.AMBIGUOUS, candidates: [...ids].sort() };
    return { status: RESOLUTION.RESOLVED, id: [...ids][0] };
  }

  /** Every alias of every canonical entity must resolve back to exactly that entity. */
  function roundTrip() {
    let checked = 0;
    const failures = [];
    for (const [ck, aliases] of byCanonical) {
      const [sportId, , id] = ck.split("|");
      for (const a of aliases) {
        checked += 1;
        const r = resolve(sportId, a.provider, a.entityType, a.id);
        if (r.status !== RESOLUTION.RESOLVED || r.id !== id) failures.push({ canonical: ck, alias: `${a.provider}|${a.entityType}|${a.id}`, got: r });
      }
    }
    return { checked, failures };
  }

  /** Deterministic reverse-index rows: [sportId, provider, entityType, providerId, canonicalId]. Collided aliases are excluded. */
  function rows() {
    const out = [];
    for (const [k, ids] of byAlias) {
      if (ids.size !== 1) continue;
      const [sportId, provider, entityType, providerId] = k.split("|");
      out.push([sportId, provider, entityType, providerId, [...ids][0]]);
    }
    return out.sort((a, b) => {
      for (let i = 0; i < 5; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      return 0;
    });
  }

  return {
    resolve,
    roundTrip,
    rows,
    collisions,
    sameProviderDuplicates,
    duplicateCanonical,
    get size() { return byAlias.size; },
  };
}
