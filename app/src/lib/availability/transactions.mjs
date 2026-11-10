/**
 * TRANSACTION RECONCILIATION (founder decision 4, 2026-11-09). PURE, no I/O.
 *
 * Recovered IR and suspension designations stay in force until authoritative activation or reinstatement evidence
 * exists (eligibility contract v1, R1). The roster capture is one such source; ESPN's transactions feed is the other:
 * dated, team-attributed entries such as "Activated LB Yasir Abdullah and WR Beaux Collins from injured reserve." This
 * module turns those into activation FACTS a carry can end on, so a player who legitimately returned is not excluded
 * indefinitely.
 *
 * IDENTITY, STRICTLY. The feed carries no athlete id — only a team, a date and the sentence. A name resolves to an athlete
 * ONLY when it matches exactly one player on THAT team's captured roster (normalised: case, periods, apostrophes,
 * suffix spacing). No match, or more than one, is recorded as unmatched and clears nothing: an unverifiable activation is
 * not evidence (the injuries contract never name-matches across teams; this never does either).
 *
 * WHAT COUNTS: "Activated … from (the) injured reserve / reserve/injured / PUP / NFI / suspended list" and "Reinstated …
 * (from suspension / the suspended list / reserve/suspended)". Placements, signings, elevations, waivers and trades do
 * not activate anybody and are ignored. Dates are ESPN's (day resolution, stamped 08:00Z); an activation ends a
 * designation only when it is dated AFTER the designation was stated.
 */

export const TRANSACTIONS_SCHEMA = "gtp.transactions.activations@1";
export const ACTIVATION_KINDS = Object.freeze(["ACTIVATED_FROM_IR", "ACTIVATED_FROM_PUP", "ACTIVATED_FROM_NFI", "REINSTATED_FROM_SUSPENSION"]);

const LIST = /(injured reserve|reserve\/injured|physically unable to perform(?: list)?|pup(?: list)?|non-football injury(?: list)?|nfi(?: list)?|suspended list|reserve\/suspended(?: list)?|suspension)/i;
const kindOf = (verb, list) => {
  const l = String(list ?? "").toLowerCase();
  if (/suspen/.test(l) || /^reinstated$/i.test(verb)) return "REINSTATED_FROM_SUSPENSION";
  if (/unable|pup/.test(l)) return "ACTIVATED_FROM_PUP";
  if (/non-football|nfi/.test(l)) return "ACTIVATED_FROM_NFI";
  return "ACTIVATED_FROM_IR";
};
export const normName = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'’]/g, "").replace(/\s+/g, " ").trim();
const SENTENCE_BREAK = /(?<=\.)\s+(?=(?:Activated|Signed|Placed|Released|Waived|Elevated|Reinstated|Traded|Claimed|Re-signed|Promoted|Designated|Acquired|Recalled|Assigned|Terminated|Exercised|Agreed|Converted|Suspended|Fined|Named|Hired|Fired|Retired|Removed|Restored|Added|Moved|Announced|Reverted|Exchanged|Sent|Received|Converted)\b)/;
const POSITION = /^(QB|RB|FB|WR|TE|OT|OG|OL|C|G|T|DE|DT|DL|NT|LB|ILB|OLB|CB|S|SS|FS|DB|K|P|LS|KR|PR|F|PF|SF|SG|PG)\s+/;

/** The names an activation sentence activates (position prefixes stripped), or [] when it activates nobody. */
export function activatedNames(sentence) {
  const s = String(sentence ?? "").trim().replace(/\.$/, "");
  const m = /^(Activated|Reinstated)\s+(.+?)(?:\s+from\s+(?:the\s+)?(.+))?$/i.exec(s);
  if (!m) return null;
  const [, verb, who, from] = m;
  if (/^activated$/i.test(verb) && !LIST.test(from ?? "")) return null; // "Activated X to the active roster" etc. is not a return from a list
  if (/^reinstated$/i.test(verb) && from && !LIST.test(from)) return null;
  const names = who.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().replace(POSITION, "").trim()).filter(Boolean);
  return { kind: kindOf(verb, from), names };
}

/**
 * @param {{ transactions?: Array<{ date: string, description: string, team?: { id?: string|number } }> }} feed  ESPN transactions
 * @param {object} roster  the roster capture (NFL public / NBA research shape) used to resolve names to ids, per team
 * @param {{ sport: "nfl"|"nba" }} opts
 * @returns {{ schema: string, sport: string, activations: Array<{ athleteId: string, teamId: string, kind: string, date: string }>, unmatched: Array<{ name: string, teamId: string|null, kind: string, date: string, reason: string }> }}
 */
export function parseActivations(feed, roster, { sport }) {
  const byTeam = new Map();
  for (const t of roster?.teams ?? []) {
    const teamId = t?.providerTeamId != null ? String(t.providerTeamId) : null;
    if (!teamId) continue;
    const m = new Map();
    for (const p of t.players ?? []) {
      const id = p?.id ?? p?.providerAthleteId;
      const name = normName(p?.fullName ?? p?.displayName);
      if (id == null || !name) continue;
      (m.get(name) ?? m.set(name, []).get(name)).push(String(id));
    }
    byTeam.set(teamId, m);
  }
  const activations = [];
  const unmatched = [];
  for (const tx of feed?.transactions ?? []) {
    const date = tx?.date;
    if (!Number.isFinite(Date.parse(String(date ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")))) continue;
    const teamId = tx?.team?.id != null ? String(tx.team.id) : null;
    // sentences end before the next transaction verb ("… James Pearce Jr. from …" keeps its "Jr.")
    for (const sentence of String(tx?.description ?? "").split(SENTENCE_BREAK)) {
      const a = activatedNames(sentence);
      if (!a) continue;
      for (const name of a.names) {
        const ids = teamId ? byTeam.get(teamId)?.get(normName(name)) ?? [] : [];
        if (ids.length === 1) activations.push({ athleteId: ids[0], teamId, kind: a.kind, date });
        else unmatched.push({ name, teamId, kind: a.kind, date, reason: !teamId ? "NO_TEAM" : ids.length ? "AMBIGUOUS_NAME" : "NOT_ON_TEAM_ROSTER" });
      }
    }
  }
  const key = (x) => `${x.athleteId}|${x.date}|${x.kind}`;
  const seen = new Set();
  return { schema: TRANSACTIONS_SCHEMA, sport, activations: activations.filter((x) => (seen.has(key(x)) ? false : seen.add(key(x)))).sort((x, y) => x.date.localeCompare(y.date) || x.athleteId.localeCompare(y.athleteId)), unmatched };
}

/** The latest activation of an athlete dated strictly after `afterIso`, or null. */
export function activationAfter(activations, athleteId, afterIso) {
  const after = Date.parse(String(afterIso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  if (!Number.isFinite(after)) return null;
  const hits = (activations ?? []).filter((a) => String(a.athleteId) === String(athleteId) && Date.parse(String(a.date).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) > after);
  return hits.sort((x, y) => y.date.localeCompare(x.date))[0] ?? null;
}
