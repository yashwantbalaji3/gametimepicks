/** Development adapter for independently fitted historical usage rates.
 * These are conditional role estimates, not a coherent lineup's probability mass.
 * Preserve underallocated families; proportionally project ONLY overfull families
 * onto unit mass. This does not establish who starts or participates. The adjustment
 * is explicit evidence in candidate receipts, never a silent public repair.
 */
export function reconcileJointRoster(players) {
  const keys = ["qbShare", "carryShare", "targetShare", "tdShare"];
  const rows = players.map(p => ({ ...p }));
  const adjustments = [];
  for (const key of keys) {
    const values = rows.map(p => p[key] ?? 0);
    if (values.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error(`invalid historical ${key}`);
    const before = values.reduce((a, b) => a + b, 0);
    if (before > 1) {
      for (const p of rows) p[key] = (p[key] ?? 0) / before;
      adjustments.push({ family: key, before, after: 1, method: "PROPORTIONAL_OVERFULL_ONLY", limitation: "historical role weights; not confirmed participation" });
    }
  }
  return { players: rows, adjustments };
}

export function conditionQuarterbackShares(players, depth, starterShare) {
  if (!Number.isFinite(starterShare) || starterShare <= 0 || starterShare >= 1) throw new Error("invalid fitted starter share");
  if (depth.state !== "PROJECTED_DEPTH_STARTER") return { players, applied: false, reason: depth.state };
  const starter = players.find(p => p.playerId === depth.playerId && (p.qbShare ?? 0) > 0);
  if (!starter) return { players, applied: false, reason: "DEPTH_STARTER_WITHOUT_PRIOR_QB_EVIDENCE" };
  const others = players.filter(p => p.playerId !== depth.playerId);
  const otherMass = others.reduce((s, p) => s + (p.qbShare ?? 0), 0);
  return { applied: true, reason: "PREGAME_DEPTH_CONDITIONING", players: players.map(p => ({ ...p,
    qbShare: p.playerId === depth.playerId ? starterShare : (p.qbShare ?? 0) / Math.max(1, otherMass) * (1 - starterShare),
  })) };
}
