/**
 * NFL SIM-V2 · THE STARTING QUARTERBACK, FROM THE BOARD'S DECISION (PD 2026-11-11, Week 10). PURE.
 *
 * The simulation uses exactly the starter the official player board decided (board-roster-integrity.mjs
 * applyQbStarterRule, recorded per team in `integrity.qbStarter`): the depth chart's QB1, or nobody. It never falls
 * back to the largest raw role share, which is how a backup (BAL Fagnano, NYG Winston) became a simulated starter
 * once injuries emptied the pool.
 *
 *   STARTER   rule APPLIED, or SINGLE_PASSER with exactly one passer → that quarterback takes all of the team's passing
 *   WITHHELD  anything else (starter not confirmed, rule unresolved, no passer, no board) → no named quarterback passes:
 *             the team's passing goes to the engine's anonymous OTHER slot, so the game is still simulated and no
 *             quarterback's line is invented
 *
 * The share floor (applyPasserShareFloor) is a rule about PUBLISHING a passer's yards, not about who starts, so a
 * chart-confirmed starter whose board line it withheld (NYG McCarthy) is still the simulation's starter.
 */
export const SIM_STARTER = Object.freeze({ STARTER: "STARTER", WITHHELD: "WITHHELD" });

/** @returns {{ state: string, starterQb: string|null, reason: string|null }} */
export function simStarterDecision(board, abbr) {
  const rule = (board?.integrity?.qbStarter ?? []).find((q) => q.team === abbr);
  if (!board) return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: `no player board for ${abbr}: starting QB not confirmed` };
  if (!rule) return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: `the board records no starting-QB decision for ${abbr}: starting QB not confirmed` };
  if (rule.state === "APPLIED" && rule.starter?.playerId) return { state: SIM_STARTER.STARTER, starterQb: rule.starter.playerId, reason: null };
  if (rule.state === "SINGLE_PASSER" && (rule.passers ?? []).length === 1) return { state: SIM_STARTER.STARTER, starterQb: rule.passers[0], reason: null };
  return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: rule.reason ?? `starting QB not confirmed for ${abbr} (board rule ${rule.state})` };
}

/** The playersFromRoleShares options for a decision. */
export const starterOptions = (d) => (d.state === SIM_STARTER.STARTER ? { starterQb: d.starterQb, strictStarter: true } : { withholdPassers: true });
