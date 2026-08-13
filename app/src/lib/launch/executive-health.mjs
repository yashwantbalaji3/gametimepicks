/**
 * Executive health strip (Program 172 · Release J).
 *
 * Nine lanes, one line each, every one DERIVED from a receipt on disk and carrying the path that
 * proves it. The rule this encodes: a lane is green only when its own evidence says so, and the
 * absence of evidence is UNKNOWN — never green, never a silent zero.
 *
 * It is deliberately a pure function over already-loaded artifacts: the /launch page owns file
 * reading, so this module can be unit-tested against fixtures without touching disk.
 */

export const HEALTH_STATES = Object.freeze(["HEALTHY", "HOLDING", "DEGRADED", "BLOCKED_EXTERNAL", "INCIDENT", "UNKNOWN"]);

/** Severity for sorting: the worst lane must surface first, never be buried under greens. */
const SEVERITY = { INCIDENT: 0, DEGRADED: 1, BLOCKED_EXTERNAL: 2, UNKNOWN: 3, HOLDING: 4, HEALTHY: 5 };

const hoursSince = (iso, nowIso) => {
  const t = Date.parse(iso ?? "");
  const n = Date.parse(nowIso ?? "");
  return Number.isFinite(t) && Number.isFinite(n) ? (n - t) / 3.6e6 : null;
};

/**
 * @param {object} a artifacts: { nowIso, etDate, adminStatus, productReceipt, nflLane, nflStatus,
 *                                settlementReceipt, bankBuilderSummary, buildInfo }
 */
export function buildExecutiveHealth(a) {
  const { nowIso, etDate } = a;
  const lane = (id, label, state, detail, evidence, nextAction = null) => ({ id, label, state, detail, evidence, nextAction });
  const lanes = [];

  // 1. MLB daily — the slate's own date is the only thing that may say "today"
  const slate = a.adminStatus?.slate?.mlbSlate ?? null;
  lanes.push(slate === etDate
    ? lane("mlb-daily", "MLB Daily", "HEALTHY", `slate ${slate} · ${a.adminStatus?.slate?.mlbGames ?? "?"} games`, "app/public/data/admin/status.json")
    : lane("mlb-daily", "MLB Daily", slate ? "DEGRADED" : "UNKNOWN",
      slate ? `slate is ${slate}, today is ${etDate} — the morning chain has not published yet` : "no slate pointer readable",
      "app/public/data/admin/status.json", "wait for morning-projections; if it misses its window, dispatch the guarded recovery"));

  // 2/3/4. the three signature products, straight off the dated receipt
  const receiptFor = (product) => (a.productReceipt?.products ?? []).find((p) => p.product === product) ?? null;
  for (const [id, label, product] of [["bank-builder", "Bank Builder", "bank-builder"], ["moonshot", "Moonshot", "moonshot"], ["vault", "End Zone Vault", "end-zone-vault"]]) {
    const p = receiptFor(product);
    if (!p) { lanes.push(lane(id, label, "UNKNOWN", `no receipt for ${etDate}`, `data/internal/products/receipts/${etDate}.json`, "run the daily product receipt")); continue; }
    const state = p.state === "ACTIVE" ? "HEALTHY"
      : p.state === "NO_PLAY" ? "HOLDING"
        : p.state === "INPUTS_MISSING" || p.state === "NOT_RUN" ? "DEGRADED"
          : p.state === "INCIDENT" ? "INCIDENT" : "UNKNOWN";
    lanes.push(lane(id, label, state, `${p.state} — ${p.reason}`, `data/internal/products/receipts/${etDate}.json`,
      state === "DEGRADED" ? "the product cannot evaluate until its slate exists" : null));
  }

  // 5. NFL daily — held is a legitimate healthy-ish state, but it must say what it waits on
  const nflTeam = a.nflStatus?.teamSimulation ?? null;
  lanes.push(nflTeam
    ? lane("nfl-daily", "NFL Daily", nflTeam.state === "LIVE" ? "HEALTHY" : "HOLDING",
      `${nflTeam.state} — ${nflTeam.headline}`, "app/public/data/nfl/model-status.json", nflTeam.nextGate ?? null)
    : lane("nfl-daily", "NFL Daily", "UNKNOWN", "no derived NFL status", "app/public/data/nfl/model-status.json"));

  // 6. Results / settlement
  const s = a.settlementReceipt;
  lanes.push(s
    ? lane("settlement", "Results & Settlement", s.accounting?.reconciles ? (s.accounting.settled > 0 ? "HEALTHY" : "HOLDING") : "INCIDENT",
      s.accounting?.reconciles
        ? `${s.accounting.settled} settled · ${s.accounting.pending} pending (gap 0)`
        : "population does not reconcile",
      `data/internal/nfl/settlement/${s.date}.json`,
      s.accounting?.pending > 0 ? "pending events settle after official results land" : null)
    : lane("settlement", "Results & Settlement", "UNKNOWN", "no settlement receipt", "data/internal/nfl/settlement/"));

  // 7. Automation — cadence is proven by receipts, never by a workflow file
  const cadence = a.nflLane?.cadence ?? null;
  lanes.push(lane("automation", "Automation", cadence?.state === "PROVEN" ? "HEALTHY" : "HOLDING",
    cadence ? `${cadence.state} — ${cadence.detail}` : "no cadence evidence",
    "app/public/data/admin/nfl-lane.json", cadence?.state === "PROVEN" ? null : "needs terminal scheduled receipts"));

  // 8. Public site — the build marker is the only honest freshness source
  const builtH = hoursSince(a.buildInfo?.builtAt, nowIso);
  lanes.push(builtH == null
    ? lane("public-site", "Public Site", "UNKNOWN", "no build marker", "app/public/data/build-info.json")
    : lane("public-site", "Public Site", builtH <= 26 ? "HEALTHY" : "DEGRADED",
      `built ${builtH.toFixed(1)}h ago`, "app/public/data/build-info.json", builtH > 26 ? "redeploy — the export is over a day old" : null));

  // 9. Credits — one cumulative allowance, and the remaining figure is the operator's headroom
  const c = a.nflLane?.credits ?? null;
  lanes.push(c && c.state === "AUTHORIZED"
    ? lane("credits", "Credits", c.remainingProgram > 0 ? "HEALTHY" : "BLOCKED_EXTERNAL",
      `${c.programSpend} of ${c.ceiling} spent · ${c.remainingProgram} remaining`, "data/internal/research/odds/nfl/p171-ledger.json",
      c.remainingProgram > 0 ? null : "cumulative ceiling reached — no further paid call may run")
    : lane("credits", "Credits", "UNKNOWN", c?.detail ?? "no credit ledger", "data/internal/research/odds/nfl/p171-ledger.json"));

  for (const l of lanes) if (!HEALTH_STATES.includes(l.state)) throw new Error(`lane ${l.id} produced ${l.state} outside the closed set`);
  const worst = lanes.reduce((w, l) => (SEVERITY[l.state] < SEVERITY[w] ? l.state : w), "HEALTHY");
  return {
    generatedAt: nowIso,
    etDate,
    lanes,
    /** worst-of, so one incident cannot be averaged away by eight greens */
    overall: worst,
    ordered: [...lanes].sort((x, y) => SEVERITY[x.state] - SEVERITY[y.state]),
  };
}
