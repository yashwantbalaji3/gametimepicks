/**
 * Canonical NFL player identity (Program 169 · Release A). PRIVATE contract, public-safe data.
 *
 * ONE registry keyed by DURABLE provider athlete ids (`nfl-athlete-<espnId>`). Names are
 * presentation, never identity: a prop label, a box-score line, or a depth-chart string joins a
 * player ONLY through this registry, and an unresolved or ambiguous name QUARANTINES rather than
 * minting a player (the Sprint-045/UFC join lesson, applied before the first prop exists).
 *
 * Roster-effective discipline: membership rows carry the capture's own stamps (sourceAsOf ≤
 * fetchedAt enforced). A player appearing on two teams inside ONE capture is an identity defect
 * and quarantines both rows; across captures, the newest effective row wins while the full
 * membership history is preserved (traded/waived/elevated players cannot silently keep the old
 * team context).
 */

export const NFL_PLAYER_IDENTITY_VERSION = 1;

export const normalizePlayerName = (n) =>
  String(n ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A name with its GENERATIONAL SUFFIX removed — "james cook iii" → "james cook".
 *
 * ⚠ WHY THIS EXISTS, MEASURED (2026-09-25). The first full-week prop sweep quarantined twelve
 * distinct player labels as "unresolved against either roster". EIGHT of them were a suffix
 * disagreement, in BOTH directions, between the sportsbook and ESPN:
 *
 *   the book said            the roster said
 *   James Cook               James Cook III
 *   Aaron Jones              Aaron Jones Sr.
 *   Chris Godwin             Chris Godwin Jr.
 *   Deebo Samuel             Deebo Samuel Sr.
 *   Erick All                Erick All Jr.
 *   Kevin Austin             Kevin Austin Jr.
 *   Thomas Fidone            Thomas Fidone II
 *   Oronde Gadsden II        Oronde Gadsden
 *
 * Each of those is a real, priced market on a player the boards publish, and every one of them
 * reached a reader as "Not offered" — a MEASURED NEGATIVE ABOUT THE BOOKS that was in fact a
 * failure of our own join. That is the worst kind of wrong answer this grammar can produce, because
 * it is stated with confidence and points at the wrong party.
 *
 * ⚠ AND IT STAYS FAIL-CLOSED. This never becomes the primary key: the exact name is tried first,
 * and the stripped form is consulted only on a miss, and only ACCEPTED when it identifies exactly
 * ONE athlete in the scope being searched. A father and son on one roster ("Marvin Harrison" and
 * "Marvin Harrison Jr.") collapse to the same stripped key and therefore QUARANTINE, which is the
 * correct answer and the same one they get today.
 *
 * The suffix must be the LAST token and cannot be the whole name, so a player known only as "V" is
 * not erased. Four of the twelve — Dallen Bentley, James Jordan, Jared Wiley, Zonovan Knight —
 * match nothing even stripped; they stay unresolved, which is what fail-closed means.
 */
const GENERATIONAL_SUFFIX = /^(jr|sr|ii|iii|iv|v)$/;
export const stripGenerationalSuffix = (nameKey) => {
  const parts = String(nameKey ?? "").split(" ").filter(Boolean);
  if (parts.length < 3) return String(nameKey ?? "");
  return GENERATIONAL_SUFFIX.test(parts[parts.length - 1]) ? parts.slice(0, -1).join(" ") : String(nameKey ?? "");
};

/** Validate + normalize one raw roster row. Total {ok,row}|{ok:false,reason}. */
export function normalizeRosterRow(raw, { teamAbbr, capturedAt }) {
  const espnId = raw?.id != null ? String(raw.id) : null;
  const name = raw?.fullName ?? raw?.displayName ?? null;
  if (!espnId || !/^\d+$/.test(espnId)) return { ok: false, reason: "missing/non-durable athlete id — identity is never minted from a name" };
  if (!name) return { ok: false, reason: `athlete ${espnId} has no display name — presentation-incomplete rows quarantine` };
  if (!teamAbbr) return { ok: false, reason: "row arrived without a team context" };
  return {
    ok: true,
    row: {
      playerId: `nfl-athlete-${espnId}`,
      providerId: espnId,
      name,
      nameKey: normalizePlayerName(name),
      teamAbbr,
      position: raw?.position?.abbreviation ?? raw?.position ?? null,
      jersey: raw?.jersey ?? null,
      status: raw?.status?.type ?? raw?.status ?? null,
      effectiveAsOf: capturedAt,
    },
  };
}

/**
 * Build the registry from one or more roster captures (each { generatedAt, teams: [{ teamAbbr,
 * players: [raw...] }] }), newest capture last. Population-exact: every input row lands in the
 * registry or in `quarantined` with its reason.
 */
export function buildPlayerRegistry(captures) {
  const players = new Map(); // playerId → { ...row, memberships: [{teamAbbr, effectiveAsOf}] }
  const quarantined = [];
  let input = 0;
  for (const cap of captures ?? []) {
    const seenThisCapture = new Map(); // playerId → teamAbbr (same-capture collision check)
    for (const team of cap?.teams ?? []) {
      for (const raw of team?.players ?? []) {
        input += 1;
        const norm = normalizeRosterRow(raw, { teamAbbr: team.teamAbbr, capturedAt: cap.generatedAt });
        if (!norm.ok) { quarantined.push({ teamAbbr: team.teamAbbr ?? null, reason: norm.reason, raw: raw?.id ?? raw?.fullName ?? null }); continue; }
        const r = norm.row;
        const prior = seenThisCapture.get(r.playerId);
        if (prior && prior !== r.teamAbbr) {
          quarantined.push({ playerId: r.playerId, reason: `athlete on two teams (${prior}, ${r.teamAbbr}) inside one capture — identity defect, both rows quarantined` });
          players.delete(r.playerId);
          continue;
        }
        seenThisCapture.set(r.playerId, r.teamAbbr);
        const existing = players.get(r.playerId);
        const memberships = existing?.memberships ?? [];
        const last = memberships[memberships.length - 1];
        if (!last || last.teamAbbr !== r.teamAbbr) memberships.push({ teamAbbr: r.teamAbbr, effectiveAsOf: r.effectiveAsOf });
        const aliases = new Set(existing?.aliases ?? []);
        aliases.add(r.nameKey);
        players.set(r.playerId, { ...r, memberships, aliases: [...aliases] });
      }
    }
  }
  // name index for presentation-side lookups (prop labels): nameKey → Set(playerId)
  const nameIndex = new Map();
  /* The SECOND index, consulted only when the first misses — see stripGenerationalSuffix. It is a
     separate map rather than extra entries in the first, so an exact match can never be beaten by
     a stripped one and the fallback stays visibly a fallback. */
  const suffixIndex = new Map();
  for (const [id, p] of players) for (const a of p.aliases) {
    if (!nameIndex.has(a)) nameIndex.set(a, new Set());
    nameIndex.get(a).add(id);
    const stripped = stripGenerationalSuffix(a);
    if (!suffixIndex.has(stripped)) suffixIndex.set(stripped, new Set());
    suffixIndex.get(stripped).add(id);
  }
  return {
    version: NFL_PLAYER_IDENTITY_VERSION,
    players,
    nameIndex,
    suffixIndex,
    quarantined,
    accounting: { input, registered: players.size, quarantined: quarantined.length },
  };
}

/**
 * Resolve a display reference (e.g. a sportsbook prop label) to ONE canonical player, or say why
 * not. Team context narrows ambiguity but never invents a match.
 */
export function resolvePlayerRef(registry, { name, teamAbbr = null }) {
  const key = normalizePlayerName(name);
  if (!key) return { state: "UNRESOLVED", reason: "empty name after normalization" };
  const exact = [...(registry.nameIndex.get(key) ?? [])];
  const scopeTo = (list) => (teamAbbr ? list.filter((id) => registry.players.get(id).teamAbbr === teamAbbr) : list);
  const exactScoped = scopeTo(exact);
  if (exactScoped.length === 1) return { state: "RESOLVED", playerId: exactScoped[0], basis: teamAbbr ? "unique-name-in-team" : "unique-name" };

  /*
   * THE SUFFIX FALLBACK, and it is ONLY reached when the exact name did not identify one player.
   * It accepts a unique match and nothing else: two candidates under one stripped key quarantine
   * exactly as they would have before. See stripGenerationalSuffix for the eight real markets this
   * recovered and the four it correctly still refuses.
   */
  if (exactScoped.length === 0) {
    const loose = scopeTo([...(registry.suffixIndex?.get(stripGenerationalSuffix(key)) ?? [])]);
    if (loose.length === 1) {
      return { state: "RESOLVED", playerId: loose[0], basis: teamAbbr ? "generational-suffix-in-team" : "generational-suffix" };
    }
    if (loose.length > 1) {
      return { state: "AMBIGUOUS", reason: `"${name}" matches ${loose.length} players once a generational suffix is set aside — ambiguity quarantines, never picks`, candidates: loose };
    }
  }

  const ids = exact;
  if (ids.length === 0) return { state: "UNRESOLVED", reason: `no registry player under "${name}" — never minted from a label` };
  const scoped = exactScoped;
  if (scoped.length === 0) return { state: "UNRESOLVED", reason: `"${name}" exists but not on ${teamAbbr} per current membership — roster-effective lineage refuses the stale team context` };
  return { state: "AMBIGUOUS", reason: `"${name}" matches ${scoped.length} players — ambiguity quarantines, never picks`, candidates: scoped };
}
