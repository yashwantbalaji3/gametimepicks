/** Private joint input adapter. Never treats depth rank as proof of availability. */
const SHARES = ["qbShare", "carryShare", "targetShare", "tdShare"];
const ELIGIBLE = new Set(["ACTIVE_PROJECTED", "ACTIVE_CONFIRMED"]);
export function applyJointParticipation(players, pool) {
  const byId = new Map((pool?.players ?? []).map(p => [p.playerId, p]));
  const decisions = [], removedMass = Object.fromEntries(SHARES.map(k => [k, 0]));
  const output = players.map(p => {
    const evidence = byId.get(p.playerId);
    const state = evidence?.state ?? "UNSUPPORTED";
    const exclude = state === "INACTIVE" || state === "UNSUPPORTED";
    const uncertain = !exclude && !ELIGIBLE.has(state);
    decisions.push({ playerId: p.playerId, state, excluded: exclude, uncertain, reason: evidence?.reason ?? "absent from current team roster" });
    if (!exclude) return { ...p };
    for (const key of SHARES) removedMass[key] += p[key] ?? 0;
    return { ...p, ...Object.fromEntries(SHARES.map(k => [k, 0])) };
  });
  return { players: output, decisions, removedMass, uncertaintyResolved: !decisions.some(p => p.uncertain),
    convention: "Excluded mass remains OTHER; uncertain players remain conditional research inputs, never assumed active" };
}

export function participationAwareQuarterback(snapshot, pool) {
  if (!snapshot?.quarterbacks?.length) return { state: "MISSING", reason: "no usable depth snapshot" };
  const byId = new Map((pool?.players ?? []).map(p => [p.playerId, p]));
  const ranks = [...new Set(snapshot.quarterbacks.map(p => p.rank))].sort((a, b) => a - b);
  const excluded = [];
  for (const rank of ranks) {
    const group = snapshot.quarterbacks.filter(p => p.rank === rank);
    if (group.length !== 1) return { state: "AMBIGUOUS", reason: "multiple quarterbacks at the same depth rank" };
    const qb = group[0], id = `nfl-athlete-${qb.playerId}`, evidence = byId.get(id);
    if (!evidence || evidence.state === "INACTIVE" || evidence.state === "UNSUPPORTED") { excluded.push(id); continue; }
    if (!ELIGIBLE.has(evidence.state)) return { state: "PARTICIPATION_UNCERTAIN", playerId: id, reason: `${evidence.state}: starter/backup scenarios require evidence-backed weights`, excluded };
    return { state: "PROJECTED_DEPTH_STARTER", playerId: id, name: qb.name, timestamp: snapshot.timestamp,
      depthRank: rank, participationState: evidence.state, excluded,
      limitation: "Projected eligible depth leader, not confirmed game-day starter or guaranteed workload" };
  }
  return { state: "NO_ELIGIBLE_DEPTH_QB", excluded, reason: "all depth quarterbacks unavailable or absent from current roster" };
}
