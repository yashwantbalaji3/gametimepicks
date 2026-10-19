/**
 * FORECAST IDENTITY (Session 13 · A3).
 *
 * forecastId = "fl1-" + 64-bit FNV-1a over the stable identity tuple:
 *
 *     sport | eventId | subjectType | subjectId | family | forecastKind
 *
 * Why these and nothing else:
 *   - all six are owner identifiers (provider event ids, canonical player/team ids, family keys), never display
 *     text — a renamed player or a re-worded matchup cannot fork a forecast;
 *   - the model version is NOT in the identity. A subject/family/event has exactly ONE forecast of record (the
 *     last pre-start publication). If the id included the version, a later owner restatement that re-labelled
 *     the version would mint a second observation of the same forecast — the double count this ledger exists to
 *     prevent. The version is an IMMUTABLE field on the row instead, so changing it is an append-only violation,
 *     not a silent new row.
 *
 * REPUBLICATION QUALIFIER (founder decision 2026-10-19, option B). The one exception to "one forecast per subject /
 * family / event": an owner that re-publishes a POSTPONED game on a later slate (Homer Nukes put ALCS game 849817 on
 * the 10-16 board, the game did not play that day, and the 10-18 board published it again at different probabilities).
 * The original publication keeps the plain identity — so every committed id is unchanged — and is VOID (postponed).
 * Each re-publication is its own forecast, identified by the tuple plus `slate:<YYYY-MM-DD>` (the slate it was
 * published on). `identityQualifier` is optional and only an adapter's explicit republication rule passes it; without
 * it the key is byte-identical to before.
 *
 * Pure (no node:crypto) so the same id is computable in a browser, a build script and a test.
 */

const MASK64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function fnv1a64(text) {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(String(text));
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, "0");
}

export const IDENTITY_FIELDS = Object.freeze(["sport", "eventId", "subjectType", "subjectId", "family", "forecastKind"]);

export function identityKey(parts) {
  for (const k of IDENTITY_FIELDS) {
    const v = parts?.[k];
    if (typeof v !== "string" || v.length === 0) throw new Error(`forecast identity: ${k} is required (got ${JSON.stringify(v)})`);
    if (v.includes("|")) throw new Error(`forecast identity: ${k} may not contain "|"`);
  }
  const base = IDENTITY_FIELDS.map((k) => parts[k]).join("|");
  const q = parts?.identityQualifier;
  if (q == null) return base;
  if (typeof q !== "string" || !/^slate:\d{4}-\d{2}-\d{2}$/.test(q)) throw new Error(`forecast identity: identityQualifier must be "slate:YYYY-MM-DD" (got ${JSON.stringify(q)})`);
  return `${base}|${q}`;
}

export function forecastIdFor(parts) {
  return `fl1-${fnv1a64(identityKey(parts))}`;
}
