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
  for (const [id, p] of players) for (const a of p.aliases) {
    if (!nameIndex.has(a)) nameIndex.set(a, new Set());
    nameIndex.get(a).add(id);
  }
  return {
    version: NFL_PLAYER_IDENTITY_VERSION,
    players,
    nameIndex,
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
  const ids = [...(registry.nameIndex.get(key) ?? [])];
  if (ids.length === 0) return { state: "UNRESOLVED", reason: `no registry player under "${name}" — never minted from a label` };
  const scoped = teamAbbr ? ids.filter((id) => registry.players.get(id).teamAbbr === teamAbbr) : ids;
  if (scoped.length === 1) return { state: "RESOLVED", playerId: scoped[0], basis: teamAbbr ? "unique-name-in-team" : "unique-name" };
  if (scoped.length === 0) return { state: "UNRESOLVED", reason: `"${name}" exists but not on ${teamAbbr} per current membership — roster-effective lineage refuses the stale team context` };
  return { state: "AMBIGUOUS", reason: `"${name}" matches ${scoped.length} players — ambiguity quarantines, never picks`, candidates: scoped };
}
