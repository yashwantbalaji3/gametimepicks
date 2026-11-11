/**
 * SIMULATION THEATER · an EXPERIMENTAL starting QB's lines (founder P0 2026-11-11 ~17:40Z). PURE and import-free.
 *
 * The simulation names every identified starter, an experimental (tier b / d) one included — the flag gates display,
 * never the simulation. In a build WITHOUT GTP_NFL_QB_FALLBACK_PUBLIC=1 no page shows such a QB's numbers: his run-box
 * lines read "Starting QB · experimental projection in research" with "—" for every number (the TEAM line keeps the
 * run's totals), and the simulation report drops his distributions. The teams come from the receipt's own recorded
 * decision (`inputSnapshotIds.starters`).
 */
export const EXPERIMENTAL_PASSER = "Starting QB · experimental projection in research";

/** Teams whose simulated starter is experimental, per the receipt's recorded decision. */
export function experimentalStarterTeams(receipt) {
  const st = receipt?.inputSnapshotIds?.starters;
  if (!st || typeof st !== "object") return [];
  return Object.entries(st).filter(([, d]) => d?.experimental === true).map(([abbr]) => abbr).sort();
}

/** The stored run boxes with each listed team's starter name masked on every line (pure). */
export function maskExperimentalStarters(runBoxes, receipt, teams = experimentalStarterTeams(receipt)) {
  if (!runBoxes?.boxes || !teams.length) return runBoxes;
  const ids = new Map(teams.map((t) => [t, receipt.inputSnapshotIds.starters[t]?.starterQb]).filter(([, id]) => id));
  const boxes = {};
  for (const [k, box] of Object.entries(runBoxes.boxes)) {
    const next = { ...box };
    for (const side of ["away", "home"]) {
      const s = box?.[side];
      const id = s ? ids.get(s.abbr) : null;
      if (!id) continue;
      const mask = (rows) => (rows ?? []).map((r) => (r.id === id ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "name" ? EXPERIMENTAL_PASSER : k === "position" ? null : typeof v === "number" ? "—" : v])) : r));
      next[side] = { ...s, passing: mask(s.passing), rushing: mask(s.rushing), receiving: mask(s.receiving), tdScorers: mask(s.tdScorers), turnovers: mask(s.turnovers) };
    }
    boxes[k] = next;
  }
  return { ...runBoxes, boxes };
}

/** The receipt as the public simulation report may show it: every experimental starter's distributions removed (pure). */
export function maskExperimentalReceipt(receipt) {
  const teams = experimentalStarterTeams(receipt);
  if (!teams.length) return receipt;
  const ids = new Set(teams.map((t) => receipt.inputSnapshotIds.starters[t]?.starterQb).filter(Boolean));
  const sed = receipt.scoringEventDistributions;
  return {
    ...receipt,
    playerStatDistributions: (receipt.playerStatDistributions ?? []).filter((p) => !ids.has(p.playerId)),
    ...(sed ? { scoringEventDistributions: { ...sed, firstTdScorer: (sed.firstTdScorer ?? []).filter((x) => !ids.has(x.playerId)) } } : {}),
    experimentalStartersHidden: teams,
  };
}
