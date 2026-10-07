/**
 * Canonical soccer match identity (Stage 13 prep · Soccer R3). Pure.
 *
 * WHY. Stage 3A's forecast-of-record keys a question on `sport | eventId | subject | family` and cuts it off at the
 * event's ONE canonical (rescheduled) start. The soccer eventId is not stable across a schedule change:
 *   - EPL publishes DERIVED ids that embed the kickoff minute (event-id.mjs). The placeholder 14:00 Saturday slot is
 *     routinely moved to a TV slot, and every move mints a new id. On 2026-10-07, 267 of 380 EPL pairings carried
 *     more than one id across the fixture captures, and 8 forecast pairings were published under two ids.
 *   - A postponed match gets a new kickoff, so a new derived id (EPL) or, sometimes, a new ESPN event (others).
 * Fed straight to 3A, one match would be two questions; the copy under the old id never settles and sits PENDING
 * forever, and a postponed match's forecast leaves no record at all (R3).
 *
 * WHAT. In a single-table league (every pairing played once at each ground per season, no playoffs) the question
 * "this match" is exactly (competition, season, home club, away club). That key never changes when the date does.
 * Provider ids (derived or ESPN) become aliases of it. Nothing here renames a published id; a reader maps ids to
 * keys at read time. Anything that is not provably single-table (cups, two-legged ties, playoffs) is REFUSED, which
 * under the founder's Q5 means excluded and disclosed, never guessed.
 */
import { league } from "./leagues.mjs";

const slug = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Season label of a kickoff for an Aug–May league: Aug–Dec → "YYYY-YY", Jan–Jul → previous year's season. */
export function augMaySeason(kickoffUtc) {
  const t = Date.parse(kickoffUtc ?? "");
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** One club name → its canonical name in this league (the registry's ESPN→corpus aliases), or null. */
export function canonicalClub(leagueKey, name) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return null;
  return league(leagueKey).aliases?.[n] ?? n;
}

/** Why a competition cannot use the (season, home, away) key, or null when it can. */
export function singleTableRefusal(leagueKey) {
  const l = league(leagueKey);
  if (l.kind !== "club-league") return `${l.name} is a ${l.kind}: a pairing can repeat inside a season`;
  if (l.season?.model !== "aug-may") return `${l.name} runs a ${l.season?.model ?? "unknown"} season; its season label is not established here`;
  if (l.format?.playoffs || l.format?.knockout || (l.format?.legs ?? 1) !== 1) return `${l.name} has playoffs or knockout ties: a pairing can repeat inside a season`;
  return null;
}

/**
 * The canonical key of one match, or a refusal.
 * @param {{ league: string, homeClub: string, awayClub: string, season?: string|null, kickoffUtc?: string|null }} m
 * @returns {{ ok: true, key: string, season: string, home: string, away: string } | { ok: false, reason: string }}
 */
export function canonicalMatchKey(m) {
  let l;
  try { l = league(m?.league); } catch (e) { return { ok: false, reason: e.message }; }
  const refusal = singleTableRefusal(l.key);
  if (refusal) return { ok: false, reason: refusal };
  const home = canonicalClub(l.key, m.homeClub), away = canonicalClub(l.key, m.awayClub);
  if (!home || !away) return { ok: false, reason: "a side is missing" };
  if (slug(home) === slug(away)) return { ok: false, reason: `home and away are the same club (${home})` };
  const season = m.season ?? augMaySeason(m.kickoffUtc);
  if (!/^\d{4}-\d{2}$/.test(season ?? "")) return { ok: false, reason: "no season and no readable kickoff" };
  return { ok: true, key: `soccer:${l.key}:${season}:${slug(home)}~${slug(away)}`, season, home, away };
}

/**
 * Map every published provider id to its canonical key. A provider id that lands on two keys is a CONFLICT (the
 * provider re-used an id, or the sides were swapped) and is never resolved by guessing: it maps to nothing.
 * @param {Array<{ eventId: string, league: string, homeClub: string, awayClub: string, season?: string, kickoffUtc?: string }>} rows
 */
export function providerIdIndex(rows) {
  const keysById = new Map(), refused = [];
  for (const r of rows ?? []) {
    if (!r?.eventId) continue;
    const k = canonicalMatchKey(r);
    if (!k.ok) { refused.push({ eventId: r.eventId, reason: k.reason }); continue; }
    if (!keysById.has(r.eventId)) keysById.set(r.eventId, new Set());
    keysById.get(r.eventId).add(k.key);
  }
  const byId = new Map(), conflicts = [];
  for (const [id, keys] of keysById) {
    if (keys.size === 1) byId.set(id, [...keys][0]);
    else conflicts.push({ eventId: id, keys: [...keys].sort() });
  }
  const aliases = new Map();
  for (const [id, key] of byId) { if (!aliases.has(key)) aliases.set(key, []); aliases.get(key).push(id); }
  for (const ids of aliases.values()) ids.sort();
  return { byId, aliases, conflicts, refused };
}

/**
 * The canonical start of every match, from schedule-owner captures (the latest capture wins; a capture older than
 * another for the same key never overrides it). Only scheduled or played matches have a start: a match the owner
 * marks POSTPONED with no new date has none, so its forecasts stay pending, never graded and never a loss.
 * @param {Array<{ capturedAt?: string, generatedAt?: string, league: string, season?: string, rows: Array<{ homeClub, awayClub, kickoffIso?, kickoffUtc?, lifecycle? }> }>} captures
 * @returns {Map<string, string|null>} canonical key → ISO start, or null when postponed without a new date
 */
export function canonicalStarts(captures) {
  const best = new Map();
  for (const c of captures ?? []) {
    const at = Date.parse(c?.capturedAt ?? c?.generatedAt ?? ""); // the owner's capture files carry generatedAt
    if (!Number.isFinite(at)) continue;
    for (const r of c.rows ?? []) {
      const kickoff = r.kickoffIso ?? r.kickoffUtc ?? null;
      const k = canonicalMatchKey({ league: c.league, season: c.season, homeClub: r.homeClub, awayClub: r.awayClub, kickoffUtc: kickoff });
      if (!k.ok) continue;
      const postponed = /POSTPON|SUSPEND|CANCEL/i.test(String(r.lifecycle ?? ""));
      const start = postponed || !Number.isFinite(Date.parse(kickoff ?? "")) ? null : new Date(Date.parse(kickoff)).toISOString();
      const prev = best.get(k.key);
      if (!prev || at >= prev.at) best.set(k.key, { at, start });
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.start]));
}
