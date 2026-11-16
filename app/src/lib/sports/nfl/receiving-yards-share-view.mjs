/**
 * NFL RECEIVING-YARDS SHARE VIEW (ledger N8 parity fix). PURE: no I/O, no clock. PRIVATE_RESEARCH.
 *
 * WHY THIS EXISTS. The board's receiving yards come from the props-v1 engine (player-props-v1.mjs), which earned
 * PUBLISHED on the 2025 retrospective of app/scripts/nfl/evaluate-nfl-player-props.mjs. That evaluator hands the
 * engine each candidate's RAW walk-forward decayed target share (candidatesFor). Since 0e2d90300a (2026-10-01) the
 * served role-share builder (build-nfl-role-shares.mjs) divides every listed share of a team by the list's sum
 * whenever that sum — over every rostered player at or above MIN_SHARE 0.005, injured and depth players included —
 * exceeds 1. The served receivers were therefore scaled down by a team-wide factor (×1/1.07 in week 4, ×1/1.18 by
 * week 9, up to ×1/1.56) the evaluated pipeline never applied.
 *
 * WHAT THE EVALUATED PIPELINE ACTUALLY DOES WITH Σ > 1. The engine allocates targets with a Dirichlet over the
 * MODELLED receivers (share ≥ THRESH.targetShare 0.05) plus OTHER = max(0, 1 − Σ listed), then a multinomial over
 * the team's simulated pass attempts. So when the modelled receivers' raw shares sum above 1 the engine already
 * normalises them — among the modelled receivers only, never over the 0.005 roster list — and OTHER gets ~nothing.
 *
 * THE RULE THIS VIEW APPLIES (receiving yards only):
 *   rawShare_i   = the builder's decayed target share BEFORE its roster-wide normalisation (current roster, pregame);
 *   modelled     = { i : rawShare_i ≥ threshold }  (the evaluator's / event window's THRESH.targetShare);
 *   S            = Σ_{modelled} rawShare_i;
 *   ENGINE INPUT = rawShare_i for every modelled receiver — byte-for-byte the evaluator's input (candidatesFor);
 *   share_i      = rawShare_i × (S > 1 ? 1/S : 1)  — ACCOUNTING only: the engine's own expected share (its Dirichlet
 *                  normalises by S, up to the 1e-3 OTHER floor), so Σ share ≤ 1;
 *   residual     = 1 − Σ_{modelled} share_i ≥ 0   — OTHER/UNALLOCATED, kept explicit.
 * Expected targets_i = share_i × E[pass attempts], so Σ expected targets = (1 − residual) × E[pass attempts] ≤
 * E[pass attempts]; per simulated game the allocation (allocateOpportunities) never hands out more than the attempts,
 * whatever the input shares sum to. Never pre-scale the engine input: same means, but ~S× the share variance.
 *
 * Every other consumer of role-shares-v1/current.json (anytime TD, receptions, rushing/passing props, sim-v2, the
 * end-zone vault, participation, lane status) keeps reading the normalised shared artifact, byte-identical.
 *
 * LEAKAGE CHECK (done before choosing this rule): the evaluator's candidate set and shares use only the walk-forward
 * state folded from games strictly before the predicted game (evaluate-nfl-player-props.mjs candidatesFor reads
 * `state` only; the game's own rows are read after simulation, for scoring; foldGame runs after scoring). The
 * participation-truth snap sheets enter ONLY the scoring step (a DNP voids the row) — the same settlement rule the
 * served rows are graded under. Parity therefore imports no postgame information.
 */

export const RECYDS_SHARE_VIEW_ARTIFACT = "nfl-role-shares-receiving-yards-view";
export const RECYDS_SHARE_VIEW_VERSION = 1;
/** The pipeline version every receiving-yards number computed through this view carries (board family + row). */
export const RECYDS_PIPELINE_VERSION = "props-v1+recyds-share-view-v1";
export const RECYDS_RULE = "raw decayed target shares (pre roster-wide normalisation); modelled receivers (share ≥ threshold) scaled by 1/Σ only when their own Σ exceeds 1; residual = 1 − Σ kept as OTHER";

/** The qualification statement the board family carries beside the version: what evidence exists, and what does not.
    PUBLIC text (the board refuses any internal path), so it names evidence without paths. */
export const RECYDS_QUALIFICATION = Object.freeze({
  evidence: "RETROSPECTIVE_ONLY",
  retrospective: "props-v1 2025 held-out evaluation (n=3575): the allocation rule this pipeline restores",
  forwardValidation: "NONE: this pipeline version has no forward evidence yet; its registered forward test (series s4) counts only from the first week after its pinned registration",
});

const finite = (x) => typeof x === "number" && Number.isFinite(x);

const byDateThenId = (a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1);

/**
 * The role-share builder's TARGET estimate per current-roster player, BEFORE its roster-wide normalisation — the
 * same fold (stint reset on a team change, preseason = membership only, per-game share observations tagged with
 * their season), the same corpus order (2023–2025, then the 2026 partition), the same params and MIN_SHARE as
 * build-nfl-role-shares.mjs, which this module does NOT import or edit (it is a frozen component of the served
 * series). Because it is a second copy, `viewFromCorpus` proves it: normalising this list by the builder's rule must
 * reproduce current.json's targets block exactly, team by team, or that team gets no view (its receiving yards
 * are then withheld, never served from a guess).
 *
 * `shares` = role-shares.mjs exports {SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare}.
 */
export function rawTargetShares({ historicalGames, currentGames, roster, params, minShare, predictSeason, shares }) {
  const { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } = shares;
  const state = new Map();
  const fold = (game) => {
    const isPre = (game.seasonType ?? 0) === 1;
    for (const teamAbbr of new Set((game.players ?? []).map((p) => p.teamAbbr))) {
      const { totals, rows } = teamGameTotals(game, teamAbbr);
      for (const r of rows) {
        let st = state.get(r.playerId);
        if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: {} }; state.set(r.playerId, st); }
        if (isPre) continue;
        for (const family of SHARE_FAMILIES) {
          if (!(totals[family] > 0)) continue;
          (st.obs[family] ??= []).push([familyNumerator(r, family) / totals[family], game.season]);
        }
      }
    }
  };
  for (const g of [...historicalGames].sort(byDateThenId)) fold(g);
  for (const g of [...currentGames].filter((x) => x.season === predictSeason).sort(byDateThenId)) fold(g);
  const halfLifeGames = params.halfLifeGames === "inf" ? Infinity : params.halfLifeGames;
  const teams = {};
  for (const t of roster.teams ?? []) {
    const players = [];
    for (const p of t.players ?? []) {
      const playerId = `nfl-athlete-${p.id}`;
      const st = state.get(playerId);
      if (!st || st.team !== t.teamAbbr) continue;
      const obs = (st.obs.targets ?? []).map(([share, season]) => ({ share, season }));
      if (!obs.length) continue;
      const est = decayedShare({ observations: obs, predictSeason, halfLifeGames, shrinkK: params.shrinkK, boundaryDecay: params.boundaryDecay });
      if (est.share >= minShare) players.push({ playerId, share: Number(est.share.toFixed(8)) });
    }
    players.sort((a, b) => b.share - a.share || (a.playerId < b.playerId ? -1 : 1));
    teams[t.teamAbbr] = players;
  }
  return teams;
}

/** The builder's own normalisation of one raw list (Σ > 1 → divide, round to 8 dp), for the reproduction check. */
export function normaliseLikeBuilder(players) {
  const out = players.map((p) => ({ ...p }));
  const sum = out.reduce((s, p) => s + p.share, 0);
  if (sum > 1) out.forEach((p) => { p.share = Number((p.share / sum).toFixed(8)); });
  return out;
}

/**
 * The whole view document: per team, the raw block — only for teams whose raw list reproduces current.json's
 * targets players exactly under the builder's normalisation. `current` = role-shares-v1/current.json.
 */
export function viewFromCorpus({ current, historicalGames, currentGames, roster, shares }) {
  const raw = rawTargetShares({ historicalGames, currentGames, roster, params: current.params, minShare: current.minShare, predictSeason: current.predictSeason, shares });
  const teams = {};
  const unreproduced = [];
  for (const [abbr, block] of Object.entries(current.teams ?? {})) {
    const expected = (block.targets?.players ?? []).map((p) => [p.playerId, p.share]);
    const got = normaliseLikeBuilder(raw[abbr] ?? []).map((p) => [p.playerId, p.share]);
    if (JSON.stringify(expected) === JSON.stringify(got)) teams[abbr] = { targets: viewBlockFromRaw(raw[abbr] ?? []) };
    else unreproduced.push(abbr);
  }
  return {
    schemaVersion: 1,
    artifact: RECYDS_SHARE_VIEW_ARTIFACT,
    version: RECYDS_SHARE_VIEW_VERSION,
    dataClass: "PRIVATE_RESEARCH",
    pairedWith: { artifact: current.artifact, generatedAt: current.generatedAt, rosterAsOf: current.rosterAsOf },
    family: "targets",
    rule: "rawShare = the builder's decayed target share before its roster-wide Σ>1 normalisation; a team is listed only when normalising its raw list by the builder's rule reproduces current.json's targets players exactly",
    teams,
    unreproducedTeams: unreproduced.sort(),
  };
}

/**
 * View side: the block for one team's TARGETS family, from the builder's list BEFORE its roster-wide
 * normalisation. `rawPlayers` = [{playerId, share}] (share already rounded the way the builder rounds it).
 */
export function viewBlockFromRaw(rawPlayers) {
  const players = [...(rawPlayers ?? [])]
    .filter((p) => p?.playerId && finite(p.share) && p.share >= 0)
    .map((p) => ({ playerId: p.playerId, rawShare: p.share }))
    .sort((a, b) => b.rawShare - a.rawShare || (a.playerId < b.playerId ? -1 : 1));
  const listedSum = Number(players.reduce((s, p) => s + p.rawShare, 0).toFixed(8));
  return { players, listedSum, sharedArtifactNormalised: listedSum > 1 };
}

/**
 * The receiving-yards target shares for one team. `viewBlock` = viewBlockFromRaw output; `threshold` = the
 * modelled-receiver cut (THRESH.targetShare). Returns every listed player with rawShare and share (share is 0 for
 * a player below the threshold — he is not a modelled receiver), plus the team accounting.
 */
export function receivingYardsShares({ viewBlock, threshold }) {
  if (!finite(threshold) || threshold <= 0) throw new Error("receivingYardsShares: threshold must be a positive number");
  const listed = viewBlock?.players ?? [];
  const modelledRawSum = listed.filter((p) => p.rawShare >= threshold).reduce((s, p) => s + p.rawShare, 0);
  const scale = modelledRawSum > 1 ? 1 / modelledRawSum : 1;
  /* share = the ACCOUNTING share (what each receiver's expected targets are); engineShare = what the engine is fed —
     the RAW share, exactly as the evaluator feeds it. The engine's Dirichlet (κ·raw, OTHER = κ·max(0, 1 − S)) then
     normalises by S itself with total concentration κ·S; pre-scaling by 1/S would keep the means but lower the
     concentration to κ and widen every receiver's target-share spread by about S×. */
  const players = listed.map((p) => ({ playerId: p.playerId, rawShare: p.rawShare, modelled: p.rawShare >= threshold, share: p.rawShare >= threshold ? p.rawShare * scale : 0, engineShare: p.rawShare >= threshold ? p.rawShare : 0 }));
  const allocated = players.reduce((s, p) => s + p.share, 0);
  const residual = Math.max(0, 1 - allocated);
  return { players, modelledRawSum, scale, allocated, residual, threshold };
}

/**
 * Expected targets under the view, for a given expected team pass-attempt count: the coherence statement the
 * tests prove. Σ expectedTargets + residualTargets = expectedPassAttempts, residualTargets ≥ 0.
 */
export function expectedTargets({ shares, expectedPassAttempts }) {
  if (!finite(expectedPassAttempts) || expectedPassAttempts < 0) throw new Error("expectedTargets: expectedPassAttempts must be ≥ 0");
  const players = shares.players.filter((p) => p.modelled).map((p) => ({ playerId: p.playerId, expectedTargets: p.share * expectedPassAttempts }));
  const sum = players.reduce((s, p) => s + p.expectedTargets, 0);
  return { players, sum, residualTargets: expectedPassAttempts - sum, expectedPassAttempts };
}

/**
 * Event-window side: the engine roleRates for the RECEIVING-YARDS run of one team. `base` = the roleRates the
 * shared artifact composes (composeRoleRates in run-nfl-event-window.mjs); `currentTeam` = that team's block of
 * role-shares-v1/current.json (for rates and the other families' normalised shares); `viewTeam` = that team's
 * block of the view. Pass/rush shares stay the shared artifact's; only targets come from the view.
 * Returns {state: "READY", roleRates, shares} or {state: "REFUSED", reason}.
 */
export function composeReceivingYardsRoleRates({ base, currentTeam, viewTeam, thresholds }) {
  if (!viewTeam?.targets?.players) return { state: "REFUSED", reason: "no receiving-yards share view for this team" };
  if (!currentTeam?.rates?.players?.length) return { state: "REFUSED", reason: "no rates block for this team" };
  const shares = receivingYardsShares({ viewBlock: viewTeam.targets, threshold: thresholds.targetShare });
  const viewShare = new Map(shares.players.map((p) => [p.playerId, p]));
  const ratesById = new Map(currentTeam.rates.players.map((r) => [r.playerId, r]));
  const shareIn = (family, playerId) => currentTeam[family]?.players?.find((p) => p.playerId === playerId)?.share ?? 0;
  const meta = new Map();
  for (const f of ["passAttempts", "rushAttempts", "targets"]) for (const p of currentTeam[f]?.players ?? []) if (!meta.has(p.playerId)) meta.set(p.playerId, { name: p.name, shareBasis: p.shareBasis });
  const baseById = new Map((base?.players ?? []).map((p) => [p.playerId, p]));
  const ids = new Set([...baseById.keys(), ...shares.players.filter((p) => p.modelled).map((p) => p.playerId)]);
  const players = [];
  for (const playerId of ids) {
    const b = baseById.get(playerId);
    const rates = ratesById.get(playerId);
    if (!b && !rates) continue;
    const v = viewShare.get(playerId);
    const qbShare = b ? b.qbShare : shareIn("passAttempts", playerId);
    const carryShare = b ? b.carryShare : shareIn("rushAttempts", playerId);
    /* A non-modelled player's target share is never allocated (he has no targets family); it is kept on the same
       scale so `share` (the engine's sort key) is the shared artifact's whenever the view changes nothing. */
    const targetShare = v ? v.rawShare : 0; // the evaluator's input: raw for every listed player (only modelled ones are allocated)
    const families = new Set();
    if (qbShare >= thresholds.qbShare) families.add("passAttempts");
    if (carryShare >= thresholds.carryShare) families.add("rushAttempts");
    if (v?.modelled) families.add("targets");
    if (!families.size) continue;
    const m = meta.get(playerId) ?? {};
    const r = b ?? { playerId, name: m.name ?? null, shareBasis: m.shareBasis ?? null, compRate: rates.compRate, ypcmp: rates.ypcmp, intRate: rates.intRate, catchRate: rates.catchRate, ypr: rates.ypr, ypc: rates.ypc };
    players.push({ ...r, families, qbShare, carryShare, targetShare, share: Math.max(qbShare, carryShare, targetShare) });
  }
  return players.length ? { state: "READY", roleRates: { players }, shares } : { state: "REFUSED", reason: "no modelled player for this team" };
}

/**
 * Merge the receiving-yards run into the shared-artifact run: player_reception_yds comes from `recyds`, every
 * other market (passing, rushing, RECEPTIONS) stays `base`'s untouched object. A player the view models but the
 * base run did not carry is appended with the receiving-yards market only. Adds a `receivingYards` block naming
 * the pipeline version, the rule, the team accounting and each modelled receiver's inputs (share, catch rate,
 * yards per reception) so targets × catch rate × yards per catch can be checked against the served mean.
 */
export function mergeReceivingYards({ base, recyds, composed }) {
  if (base?.state !== "SIMULATED") return base;
  const out = { ...base, players: base.players.map((p) => ({ ...p, markets: { ...p.markets } })) };
  if (recyds?.state !== "SIMULATED" || composed?.state !== "READY") {
    for (const p of out.players) delete p.markets.player_reception_yds;
    out.receivingYards = { state: "REFUSED", pipelineVersion: RECYDS_PIPELINE_VERSION, reason: composed?.reason ?? recyds?.reason ?? "receiving-yards run did not simulate — the market is withheld rather than served from the normalised shares" };
    return out;
  }
  const recById = new Map(recyds.players.map((p) => [p.playerId, p]));
  for (const p of out.players) {
    const r = recById.get(p.playerId)?.markets?.player_reception_yds;
    if (r) p.markets.player_reception_yds = r;
    else delete p.markets.player_reception_yds;
  }
  for (const r of recyds.players) {
    if (!r.markets?.player_reception_yds || out.players.some((p) => p.playerId === r.playerId)) continue;
    out.players.push({ playerId: r.playerId, name: r.name, shareBasis: r.shareBasis, markets: { player_reception_yds: r.markets.player_reception_yds } });
  }
  const inputs = composed.roleRates.players.filter((p) => p.families.has("targets"))
    .map((p) => ({ playerId: p.playerId, rawShare: composed.shares.players.find((s) => s.playerId === p.playerId)?.rawShare ?? null, share: Number((composed.shares.players.find((s) => s.playerId === p.playerId)?.share ?? 0).toFixed(8)), engineShare: Number(p.targetShare.toFixed(8)), catchRate: p.catchRate, ypr: p.ypr }))
    .sort((a, b) => b.share - a.share || (a.playerId < b.playerId ? -1 : 1));
  out.receivingYards = {
    state: "SIMULATED",
    pipelineVersion: RECYDS_PIPELINE_VERSION,
    rule: RECYDS_RULE,
    seedBasis: recyds.seedBasis,
    team: {
      modelledRawSum: Number(composed.shares.modelledRawSum.toFixed(8)),
      scale: Number(composed.shares.scale.toFixed(8)),
      allocated: Number(composed.shares.allocated.toFixed(8)),
      residual: Number(composed.shares.residual.toFixed(8)),
    },
    receivers: inputs,
  };
  return out;
}

/**
 * ALERTING. Every receiving-yards withholding condition is one line `RECYDS_<CODE> <detail>` appended to the file
 * named by GTP_RECYDS_ALERTS (set by the event-window workflow). The workflow's last data step reads the file with
 * recydsAlertSummary and FAILS the run if any line is present — after every other market's outputs are committed
 * and pushed — so the run conclusion is failure (cron-watchdog) and the standard failure webhook fires.
 */
export const RECYDS_ALERT_CODES = Object.freeze(["RECYDS_VIEW_MISSING", "RECYDS_VIEW_UNREPRODUCED", "RECYDS_WITHHELD"]);
export const recydsAlertLine = (code, detail) => {
  if (!RECYDS_ALERT_CODES.includes(code)) throw new Error(`unknown receiving-yards alert code ${code}`);
  return `${code} ${String(detail ?? "").replace(/\s+/g, " ").trim()}`;
};
/** Parse an alert file's text → {count, byCode, lines, errorLine}; count 0 = nothing to alert. Unknown lines are ignored. */
export function recydsAlertSummary(text) {
  const re = new RegExp(`^(${RECYDS_ALERT_CODES.join("|")})\\b`);
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter((l) => re.test(l));
  const byCode = Object.fromEntries(RECYDS_ALERT_CODES.map((c) => [c, lines.filter((l) => l.startsWith(`${c} `) || l === c).length]));
  const parts = Object.entries(byCode).filter(([, n]) => n).map(([c, n]) => `${c}×${n}`);
  return { count: lines.length, byCode, lines, errorLine: lines.length ? `receiving yards withheld or unproven this window (${parts.join(", ")}): ${lines.slice(0, 3).join(" | ")}${lines.length > 3 ? ` (+${lines.length - 3} more)` : ""}` : null };
}

/** The board's standard per-team withheld wording ("withheld for <team>: …"), for a team whose view run refused. */
export const recydsWithheldReason = (team) => `withheld for ${team}: receiving yards could not be computed with the evaluated share rule this window (no paired receiving-yards share view) — shown again at the next window that has one`;

/**
 * Board side: the fields to merge onto the player_reception_yds family, from the event artifact's perTeam props.
 * {} for an artifact from before the fix (no team carries a receivingYards block) — its board is unchanged.
 * Otherwise: pipelineVersion + qualification, a withheldTeams entry (standard reason, never a blank) per refused
 * team, and state WITHHELD with that reason when no team is left.
 */
export function receivingYardsFamilyAnnotation({ family, perTeam }) {
  if (!family || family.state === "WITHHELD") return {};
  const sims = Object.entries(perTeam ?? {}).filter(([, tv]) => tv?.props?.state === "SIMULATED");
  const blocks = sims.filter(([, tv]) => tv.props.receivingYards);
  if (!blocks.length) return {};
  const out = { pipelineVersion: RECYDS_PIPELINE_VERSION, qualification: RECYDS_QUALIFICATION };
  const refused = blocks.filter(([, tv]) => tv.props.receivingYards.state !== "SIMULATED").map(([team, tv]) => ({ team, sum: null, reason: recydsWithheldReason(team), detail: tv.props.receivingYards.reason ?? null }));
  if (refused.length) out.withheldTeams = [...(family.withheldTeams ?? []), ...refused];
  if (refused.length === sims.length) { out.state = "WITHHELD"; out.reason = refused.map((r) => r.reason).join(" · "); }
  return out;
}

/** Board side: the pipeline version a props artifact's receiving yards were computed under (null = the s1 pipeline). */
export function receivingYardsPipelineOf(props) {
  return props?.receivingYards?.state === "SIMULATED" ? props.receivingYards.pipelineVersion ?? null : null;
}
