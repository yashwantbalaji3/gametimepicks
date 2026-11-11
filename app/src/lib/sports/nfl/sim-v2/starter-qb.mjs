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
 * Founder decision 2026-11-11: the board's starter (depth chart + availability) is projected by evidence tier; a tier
 * (a)/(b) starter is the simulation's passer even when his history with this club put him outside the role-share pool
 * (he is added with the team's passing). Founder P0 2026-11-11 (~17:40Z): every IDENTIFIED starter is simulated by name,
 * an experimental (b)/(d) one included — the flag GTP_NFL_QB_FALLBACK_PUBLIC gates display only, never the simulation, so
 * flag ON and OFF show the same game; OFF, the Theater masks such a passer's name (lib/simulation-theater/qb-fallback-mask.mjs).
 * Only an UNCONFIRMED starter's passing goes to OTHER.
 */
export const SIM_STARTER = Object.freeze({ STARTER: "STARTER", WITHHELD: "WITHHELD" });

/** @returns {{ state: string, starterQb: string|null, reason: string|null }} */
export function simStarterDecision(board, abbr) {
  const rule = (board?.integrity?.qbStarter ?? []).find((q) => q.team === abbr);
  if (!board) return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: `no player board for ${abbr}: starting QB not confirmed` };
  if (!rule) return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: `the board records no starting-QB decision for ${abbr}: starting QB not confirmed` };
  if (rule.state === "APPLIED" && rule.starter?.playerId) return { state: SIM_STARTER.STARTER, starterQb: rule.starter.playerId, starterName: rule.starter.name ?? null, tier: rule.tier ?? null, basis: rule.basis ?? null, ...(rule.starterShare ? { starterShare: rule.starterShare } : {}), reason: null };
  if (rule.experimental && rule.starter?.playerId) return { state: SIM_STARTER.STARTER, starterQb: rule.starter.playerId, starterName: rule.starter.name ?? null, tier: rule.tier ?? null, experimental: true, reason: null };
  if (rule.state === "SINGLE_PASSER" && (rule.passers ?? []).length === 1) return { state: SIM_STARTER.STARTER, starterQb: rule.passers[0], reason: null };
  return { state: SIM_STARTER.WITHHELD, starterQb: null, reason: rule.reason ?? `starting QB not confirmed for ${abbr} (board rule ${rule.state})` };
}

/** The playersFromRoleShares options for a decision. */
export const starterOptions = (d) => (d.state === SIM_STARTER.STARTER ? { starterQb: d.starterQb, starterName: d.starterName ?? null, strictStarter: true } : { withholdPassers: true });
