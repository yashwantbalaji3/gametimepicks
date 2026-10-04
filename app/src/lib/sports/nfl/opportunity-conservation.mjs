/**
 * P694 — OPPORTUNITY CONSERVATION FOR THE PUBLISHED NFL PLAYER BOARD.
 *
 * THE QUESTION. A player's `share` in the share-level forward forecast is his fraction of a team
 * opportunity pool: targets, carries, pass attempts. Two players cannot between them hold 184% of
 * a team's carries. So for every published team-market, Σshare over the rows a reader actually
 * sees is a physical quantity with a ceiling, and nothing in the pipeline had ever computed it.
 *
 * WHY IT DRIFTS. The forecast is produced with `shrinkK: 0` — deliberately, it is the candidate
 * the P300 second look scored — so nothing pulls a share toward zero and a departed or retired
 * player keeps his. The producer knows this and says so: "a departed player's share never fades,
 * so he stays a candidate and grades VOID." Σshare over the RAW pool measured 2.4–3.5 per
 * team-market on week 3.
 *
 * The board then applies a roster gate, which is the right fix in the right place — 52 rows dropped
 * on one event, Brandon Lloyd (last played 2014) and Mario Manningham (2013) among them. But a gate
 * removes rows; it does not reconcile what is left. Whether the survivors sum to 0.7 or 1.8 is
 * whatever the roster happens to leave behind.
 *
 * WHAT THIS MODULE DOES, AND DELIBERATELY DOES NOT DO. It MEASURES. Renormalising the survivors
 * would change every published number on every board and is a model promotion, not a bug fix; it
 * needs a preregistered bar and a founder decision, not an afternoon. So the contract here is:
 * compute the quantity, name the states, and let a threshold be set against evidence rather than
 * invented. `OVER_ALLOCATED` is a finding, not a refusal.
 *
 * UNDER-allocation is NOT symmetric with over-allocation. Σ < 1 is legitimate: the residual is the
 * unmodelled tail of a roster, exactly where a genuinely unplaced new arrival's volume belongs.
 * Σ > 1 has no such reading — it is opportunity that does not exist.
 *
 * ⚠ ONE NORMALISER, NOT TWO. The board is ESPN-keyed (WSH, LAR); the forecast is nflverse-keyed
 * (WAS, LA). The first cut of this audit joined the raw abbreviations and reported WSH and LAR as
 * NO_JOIN with 40 unjoined rows between them — a defect in the audit reported as a defect in the
 * board. `nflverseTeam` is the mapping the board itself uses, imported rather than restated,
 * because a second copy of a rule is how the two drift apart in the first place.
 */
import { nflverseTeam } from "./snap-share.mjs";

/** anytime_td carries no share column (a different model owns it); it is not a share market. */
export const SHARE_MARKETS = Object.freeze(["player_receptions", "player_reception_yds", "player_rush_yds", "player_pass_yds"]);

/** Markets that draw on the SAME team pool, so their sums are one quantity, not two. */
export const OPPORTUNITY_POOL = Object.freeze({
  player_receptions: "targets",
  player_reception_yds: "targets",
  player_rush_yds: "carries",
  player_pass_yds: "passAttempts",
});

export const CONSERVATION_STATES = Object.freeze(["CONSERVED", "OVER_ALLOCATED", "UNDER_ALLOCATED", "NO_JOIN"]);

/**
 * Σ > 1 + EPS is impossible opportunity. EPS absorbs the artifact's own 4-decimal rounding across
 * a couple of dozen rows, and nothing more — it is not a tolerance for the defect.
 */
export const EPS = 0.005;

/** Below this the pool is mostly unmodelled; reported so a collapse cannot hide behind "Σ ≤ 1 is fine". */
export const THIN_BELOW = 0.75;

export function classify(sum, joined) {
  if (!joined) return "NO_JOIN";
  if (sum > 1 + EPS) return "OVER_ALLOCATED";
  if (sum < THIN_BELOW) return "UNDER_ALLOCATED";
  return "CONSERVED";
}

/**
 * @param board   a published nfl-player-board artifact
 * @param shareOf (espnId, team, market) => number|null|undefined — the forecast's own share column
 * @returns one row per (team, pool) with the sum, the states, and the join coverage that produced it
 */
export function conservationForBoard({ board, shareOf }) {
  const byKey = new Map(); // `${team}|${pool}` → {team, pool, markets:Set, sum, joined, missed, players:[]}
  for (const p of board?.players ?? []) {
    const espnId = String(p.playerId ?? "").replace(/^nfl-athlete-/, "");
    for (const market of Object.keys(p.markets ?? {})) {
      const pool = OPPORTUNITY_POOL[market];
      if (!pool) continue;
      const key = `${p.team}|${pool}`;
      let rec = byKey.get(key);
      if (!rec) { rec = { team: p.team, pool, markets: new Set(), sum: 0, joined: 0, missed: 0, players: [] }; byKey.set(key, rec); }
      rec.markets.add(market);
      // receptions and reception_yds are ONE target share; counting both would double every WR.
      if (rec.players.some((x) => x.playerId === p.playerId)) continue;
      const share = shareOf(espnId, nflverseTeam(p.team), market);
      if (typeof share !== "number" || !Number.isFinite(share) || share < 0) { rec.missed += 1; continue; } // a negative share is not a share
      rec.joined += 1;
      rec.sum += share;
      rec.players.push({ playerId: p.playerId, name: p.name, share });
    }
  }
  const rows = [...byKey.values()].map((r) => ({
    team: r.team,
    pool: r.pool,
    markets: [...r.markets].sort(),
    sum: Number(r.sum.toFixed(4)),
    joined: r.joined,
    missed: r.missed,
    state: classify(r.sum, r.joined),
    /* The single biggest holder, because an over-allocation caused by one implausible row is a
       different defect from one spread over twenty. */
    largest: r.players.length ? r.players.reduce((a, b) => (b.share > a.share ? b : a)) : null,
    /* Every holder, not just the biggest. A consumer asking "what would removing one of these do?"
       cannot answer it from `largest` alone, and rebuilding the pool join on its own side would be
       a second normaliser for one rule. */
    players: r.players.slice().sort((a, b) => b.share - a.share),
  }));
  rows.sort((a, b) => b.sum - a.sum || a.team.localeCompare(b.team));
  return {
    providerEventId: board?.providerEventId ?? null,
    matchup: board?.matchup ?? null,
    kickoffUtc: board?.kickoffUtc ?? null,
    rows,
    worst: rows.length ? rows[0].sum : null,
    overAllocated: rows.filter((r) => r.state === "OVER_ALLOCATED").length,
  };
}

/** Slate fold. An empty slate is NO_BOARDS — a result, never a pass. */
export function foldConservation(perBoard) {
  if (!perBoard.length) return { state: "NO_BOARDS", boards: 0, teamPools: 0, overAllocated: 0, worst: null };
  const teamPools = perBoard.reduce((s, b) => s + b.rows.length, 0);
  const overAllocated = perBoard.reduce((s, b) => s + b.overAllocated, 0);
  const worst = perBoard.reduce((a, b) => (b.worst != null && (a == null || b.worst > a) ? b.worst : a), null);
  return { state: overAllocated ? "OVER_ALLOCATED" : "CONSERVED", boards: perBoard.length, teamPools, overAllocated, worst };
}

/**
 * SESSION 5 — FROM MEASUREMENT TO PUBLICATION SAFETY (founder policy, October roadmap §7.2).
 *
 * The rule above was a finding, not a refusal: 23 of 32 Week-4 carries pools published Σshare > 1
 * (ARI 1.864 — Love 0.57 + Conner 0.44 + Benson 0.30 + Allgeier 0.26 …). The share-level model
 * publishes each player's share WHEN HE PLAYS (shrinkK 0, no reconciliation step), so a committee
 * backfield sums past the carries the team will have. Each row's marginal was validated; the set a
 * reader sees together was not, and it claims opportunity that does not exist.
 *
 * The policy is WITHHOLD, never renormalise. Dividing by the sum would change every published
 * number and is a model change behind its own replay + forward bars (§20). So a family whose numbers
 * come straight from shares (the caller passes exactly those markets — today rushing, plus passing
 * if the QB1 rule could not resolve a pool) is removed for the TEAM whose pool is OVER_ALLOCATED by
 * the same `classify` / `EPS` as the audit. No new threshold. The other team's pool, and every family
 * produced by an allocating engine (v1 receiving conserves targets by construction), are untouched.
 *
 * Pure. Mutates nothing; returns the rows to keep and a typed record of what went and why.
 *
 * @param players  board rows ({ playerId, name, team, markets })
 * @param shareOf  (espnId, nflverseTeam, market) => number|null — the forecast's own share column
 * @param markets  the share-sourced markets to enforce (never a market an allocating engine owns)
 * @returns { players, withheld: [{ team, pool, markets, sum, players:[{playerId,name,share}] }], pools }
 */
export function withholdOverAllocatedPools({ players, shareOf, markets }) {
  const enforce = new Set((markets ?? []).filter((m) => OPPORTUNITY_POOL[m]));
  if (!enforce.size) return { players: players.map((p) => ({ ...p, markets: { ...p.markets } })), withheld: [], pools: [] };
  const scoped = { players: players.map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets ?? {}).filter(([m]) => enforce.has(m))) })) };
  const { rows } = conservationForBoard({ board: scoped, shareOf });
  const withheld = rows.filter((r) => r.state === "OVER_ALLOCATED");
  const drop = new Set();
  for (const r of withheld) for (const m of r.markets) drop.add(`${r.team}|${m}`);
  const kept = players.map((p) => ({
    ...p,
    markets: Object.fromEntries(Object.entries(p.markets ?? {}).filter(([m]) => !drop.has(`${p.team}|${m}`))),
  }));
  return {
    players: kept,
    withheld: withheld.map((r) => ({ team: r.team, pool: r.pool, markets: r.markets, sum: r.sum, players: r.players })),
    pools: rows.map((r) => ({ team: r.team, pool: r.pool, markets: r.markets, sum: r.sum, joined: r.joined, missed: r.missed, state: r.state })),
  };
}

/** Reader-facing reason for a withheld pool — one sentence, no internal names. */
export function overAllocationReason({ team, pool, sum }) {
  const what = pool === "carries" ? "carries" : pool === "passAttempts" ? "pass attempts" : "targets";
  return `withheld for ${team}: the players' modelled shares add up to ${Math.round(sum * 100)}% of the team's ${what}, more than exists — shown again once the shares are reconciled`;
}

/**
 * SESSION 11 — FORWARD-ONLY PROPORTIONAL CONSERVATION (founder direction, 2026-10-04; versioned).
 *
 * THE SEMANTICS THAT JUSTIFY IT. In the share-level forecast a player's `share` is his decayed fraction of
 * his team's rush attempts / targets / pass attempts, and his expected volume is `share × team volume`
 * (forward-player-props-share-level.mjs `moments`). Every carry belongs to exactly one player, so over the
 * players who will actually take the field the shares partition ONE finite budget: Σ ≤ 1. The forecast
 * breaks that because each share is measured over the games THAT player appeared in (a back's share when
 * the other back was hurt, or at his previous club) and nothing reconciles the set (shrinkK 0).
 *
 * THE RULE, per (team, pool), over the CLEARED rows only (the availability gate runs first —
 * board-ranking.mjs PUBLIC_BOARD_CLEARED; a blocked player's carries are not in the reconciled set):
 *   S = Σ share;  S ≤ 1 + EPS → untouched (OTHER = 1 − S is the unmodelled residual, never scaled up);
 *   S > 1 + EPS → every cleared share × 1/S, so Σ = 1 and every player keeps his modelled RELATIVE role.
 * Per-team, never across teams. No clipping, no capping, no row deleted.
 *
 * WHAT MOVES. Expected volume is linear in share, so the projected MEAN scales exactly by 1/S. The
 * per-player rate state that shapes the spread is not in the forecast artifact, so the quantiles are
 * rescaled by the same factor — a scale approximation, recorded as such on every normalised pool.
 *
 * FAIL-CLOSED: a pool with a row whose share cannot be joined (or is negative / non-finite) cannot be
 * reconciled honestly, so it is WITHHELD exactly as before (withholdOverAllocatedPools' record shape).
 *
 * FORWARD-ONLY: applied by the board producer to upcoming events; frozen boards, the committed forward
 * forecast (graded blind) and settled rows are never touched.
 */
export const CONSERVATION_VERSION = "nfl-share-conservation-v1";
export const CONSERVATION_METHOD = "proportional share normalisation per team pool over cleared players (mean exact; quantiles rescaled by the same factor)";
const SCALED_FIELDS = Object.freeze(["mean", "p10", "p25", "median", "p75", "p90"]);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * @param players   board rows ({ playerId, name, team, participation, markets })
 * @param shareOf   (espnId, nflverseTeam, market) => number|null
 * @param markets   share-sourced markets to enforce
 * @param eligible  (row) => boolean — the public availability gate; only these rows form the pool
 * @returns { players, normalized:[{team,pool,markets,originalSum,normalizedSum,factor,players}], withheld, pools }
 */
export function normalizeOverAllocatedPools({ players, shareOf, markets, eligible }) {
  if (typeof eligible !== "function") throw new Error("normalizeOverAllocatedPools: eligible(row) is required — availability gates the pool first");
  const enforce = new Set((markets ?? []).filter((m) => OPPORTUNITY_POOL[m]));
  const copy = players.map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets ?? {}).map(([m, v]) => [m, { ...v }])) }));
  if (!enforce.size) return { players: copy, normalized: [], withheld: [], pools: [] };
  const scoped = { players: copy.filter((p) => eligible(p)).map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets).filter(([m]) => enforce.has(m))) })) };
  const { rows } = conservationForBoard({ board: scoped, shareOf });
  const normalized = [];
  const withheld = [];
  const drop = new Set();
  for (const r of rows) {
    if (r.state !== "OVER_ALLOCATED") continue;
    if (r.missed > 0) { withheld.push({ team: r.team, pool: r.pool, markets: r.markets, sum: r.sum, players: r.players }); for (const m of r.markets) drop.add(`${r.team}|${m}`); continue; }
    const exact = r.players.reduce((s, x) => s + x.share, 0);
    const factor = 1 / exact;
    const ids = new Set(r.players.map((x) => x.playerId));
    for (const p of copy) {
      if (p.team !== r.team || !ids.has(p.playerId) || !eligible(p)) continue;
      for (const m of r.markets) {
        const mk = p.markets[m];
        if (!mk) continue;
        for (const f of SCALED_FIELDS) if (typeof mk[f] === "number" && Number.isFinite(mk[f])) mk[f] = r4(mk[f] * factor);
        mk.conservation = { version: CONSERVATION_VERSION, factor: r4(factor) };
      }
    }
    normalized.push({
      team: r.team, pool: r.pool, markets: r.markets,
      originalSum: r4(exact), normalizedSum: r4(r.players.reduce((s, x) => s + x.share * factor, 0)), factor: r4(factor),
      players: r.players.map((x) => ({ playerId: x.playerId, name: x.name, share: x.share, normalizedShare: r4(x.share * factor) })),
    });
  }
  const kept = copy.map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets).filter(([m]) => !drop.has(`${p.team}|${m}`))) }));
  const norm = new Map(normalized.map((n) => [`${n.team}|${n.pool}`, n]));
  return {
    players: kept,
    normalized,
    withheld,
    pools: rows.map((r) => {
      const n = norm.get(`${r.team}|${r.pool}`);
      const sum = n ? n.normalizedSum : r.sum;
      return { team: r.team, pool: r.pool, markets: r.markets, sum, originalSum: r.sum, residualOther: r4(Math.max(0, 1 - sum)), joined: r.joined, missed: r.missed, state: n ? "NORMALIZED" : r.state };
    }),
  };
}
