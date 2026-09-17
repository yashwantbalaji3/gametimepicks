/**
 * COMPARE URL STATE (v1.4 · §37 §74 §75) — parse and write shareable query state. Pure.
 *
 *   /compare/players/nfl/?a=<slug>&b=<slug>&stat=<family slug>&season=<season id>
 *   /compare/teams/mlb/?a=<slug>&b=<slug>&season=<season id>
 *
 * Slugs resolve through the EXACT selector index (slug → canonical id). There is no case folding, trimming beyond
 * URL decoding, prefix match or name lookup: an unknown slug is an invalid selection, reported, never guessed.
 * Name search in the selector is a UI filter for FINDING a candidate; once chosen, only the canonical id is used.
 * Display order is the query's a/b order; identity (pairKey) is order-free.
 */
import { familyBySlug, statSlug, statFamily } from "./stat-families.mjs";

/**
 * @param {string} search location.search (with or without "?")
 * @param {{ kind: "team"|"player", sport: string, entries: Array<[string, string, ...any[]]> }} index
 */
export function parseCompareQuery(search, index) {
  const q = new URLSearchParams(search ?? "");
  const bySlug = new Map(index.entries.map((e) => [e[0], e[1]]));
  const side = (key) => {
    const raw = q.get(key);
    if (raw == null || raw === "") return { slug: null, id: null, invalid: false };
    return bySlug.has(raw) ? { slug: raw, id: bySlug.get(raw), invalid: false } : { slug: raw, id: null, invalid: true };
  };
  const a = side("a");
  const b = side("b");
  let stat = null, statInvalid = false;
  if (index.kind === "player") {
    const raw = q.get("stat");
    if (raw) {
      const f = familyBySlug(index.sport, raw);
      if (f) stat = f.key; else statInvalid = true;
    }
  }
  const season = q.get("season") || null;
  return { a, b, stat, statInvalid, season };
}

/** Canonical query string for a state (stable parameter order; empty values omitted). */
export function writeCompareQuery({ aSlug, bSlug, stat, season }) {
  const p = [];
  if (aSlug) p.push(["a", aSlug]);
  if (bSlug) p.push(["b", bSlug]);
  if (stat) { const f = statFamily(stat); if (f) p.push(["stat", statSlug(f)]); }
  if (season) p.push(["season", season]);
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}` : "";
}
