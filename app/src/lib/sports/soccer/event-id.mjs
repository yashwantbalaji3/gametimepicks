/**
 * Soccer event ids — the two published schemes, known in ONE place (Soccer V2 · C-2). Pure.
 *
 * Published ids are never renamed: graded ledgers, saved items and receipts key on them. So instead of a
 * migration, the registry records each competition's scheme (leagues.mjs `idScheme`) and this module is the
 * only code that builds or reads an id of either kind:
 *   derived  soccer:<league>:<home-slug>-v-<away-slug>:<yyyymmddthhmm>  — the platform identity (EPL; built by
 *            lib/soccer/epl-identity.ts through deriveEventId, which stays the owner of that construction)
 *   espn     soccer:<league>:<ESPN event id>                            — Ligue 1 and every registry-driven league
 */
import { league, SOCCER_LEAGUES } from "./leagues.mjs";

/** The id for an ESPN-scheme competition. Refuses a league whose published ids use the derived scheme. */
export function espnSoccerEventId(key, espnEventId) {
  const l = league(key);
  if (l.idScheme !== "espn") throw new Error(`espnSoccerEventId: ${key} publishes ${l.idScheme} ids — build them through its identity adapter`);
  const id = String(espnEventId ?? "").trim();
  if (!/^\d+$/.test(id)) throw new Error(`espnSoccerEventId: "${espnEventId}" is not an ESPN event id`);
  return `soccer:${l.key}:${id}`;
}

const KEYS = new Set(SOCCER_LEAGUES.map((l) => l.key));

/**
 * Read an id of either scheme → { league, scheme, espnEventId, kickoffMinute } or null. The scheme is checked
 * against the registry, so an id whose shape disagrees with its league's registered scheme is refused (null).
 */
export function parseSoccerEventId(id) {
  const m = /^soccer:([a-z0-9-]+):(.+)$/.exec(String(id ?? ""));
  if (!m || !KEYS.has(m[1])) return null;
  const scheme = league(m[1]).idScheme;
  if (scheme === "espn") return /^\d+$/.test(m[2]) ? { league: m[1], scheme, espnEventId: m[2], kickoffMinute: null } : null;
  const d = /^[a-z0-9-]+-v-[a-z0-9-]+:(\d{8}t\d{4})$/.exec(m[2]);
  return d ? { league: m[1], scheme, espnEventId: null, kickoffMinute: d[1] } : null;
}
