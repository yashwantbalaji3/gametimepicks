/**
 * RESEARCH SLUGS (v1.3) — presentation, never identity.
 *
 *   public slug ──exact generated registry──▶ canonical id
 *
 * A slug is derived from the platform's display label (safe ASCII, lower case) purely so a URL is readable.
 * Nothing ever resolves an INCOMING slug by name: the route's generateStaticParams enumerates the registry,
 * dynamicParams is false, and an unknown slug is a 404. There is no fuzzy lookup to fall back to.
 *
 * Collisions are decided per (kind, sport) over the WHOLE eligible set, never by ingestion order: when two or
 * more entities share a base slug, EVERY one of them carries its canonical id's numeric tail
 * (`john-smith-4035671`, `john-smith-15894`), so which one "got the plain slug" can never depend on order.
 *
 * Pure: no filesystem, no clock.
 */

/** Safe-ASCII slug of a display label. Returns "" when nothing ASCII survives (the caller then uses the id tail). */
export function slugifyLabel(label) {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks: "Rodríguez" → "Rodriguez"
    .replace(/[ß]/g, "ss")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .replace(/['’`.]/g, "") // "Ja'Marr" → "jamarr", "St. Brown" → "st-brown"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The provider id carried by a canonical id (`nfl-athlete-4035671` → `4035671`). */
export function idTail(canonicalId) {
  const m = /-(\d+)$/.exec(String(canonicalId));
  if (!m) throw new Error(`research slug: canonical id ${JSON.stringify(canonicalId)} has no numeric provider tail`);
  return m[1];
}

/**
 * Assign slugs to one (kind, sport) group.
 * @param {Array<{ id: string, label: string }>} entities
 * @returns {Map<string, string>} canonical id → slug (unique within the group)
 */
export function assignSlugs(entities) {
  const byBase = new Map();
  for (const e of entities) {
    const base = slugifyLabel(e.label) || `id-${idTail(e.id)}`;
    const list = byBase.get(base);
    if (list) list.push(e.id); else byBase.set(base, [e.id]);
  }
  const out = new Map();
  for (const [base, ids] of byBase) {
    if (new Set(ids).size !== ids.length) throw new Error(`research slug: duplicate canonical id in ${base}`);
    for (const id of ids) out.set(id, ids.length === 1 ? base : `${base}-${idTail(id)}`);
  }
  // A suffixed slug could, in principle, equal another entity's plain slug ("x-12" named literally "X 12").
  const seen = new Map();
  for (const [id, slug] of out) {
    if (seen.has(slug)) throw new Error(`research slug: ${slug} claimed by ${seen.get(slug)} and ${id}`);
    seen.set(slug, id);
  }
  return out;
}
