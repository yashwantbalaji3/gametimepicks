/**
 * NBA SIMULATION THEATER V2 · THREE-LAYER PROJECTED BOX SCORE (2026-10-20). Pure: no I/O, no browser APIs. Client-safe:
 * imported by the dev-route island, so it names no engine id, artifact or data path (nba-theater.test.mjs scans the graph).
 *
 * Founder rule (Cross-Product Prediction Consistency, 2026-10-20): ONE official forecast across the site. This box score
 * keeps three things apart that a single table could blur, and labels each one on every column:
 *
 *   LAYER "official"   OFFICIAL PROJECTION. Read ONLY from manifest.representative (the official snapshot, through
 *                      official-representative.mjs): per player `players[id].families[fam].{median, expected}` for
 *                      MIN · PTS · REB · AST · 3PM · PRA · P+R · P+A — whichever families the snapshot carries (a column
 *                      appears only if at least one player has it). Values are printed exactly (fmtExpectation, two
 *                      decimals), never rounded into, summed into, or replaced by the run. Player projections are NOT
 *                      summed into team totals (a column of medians is not a team score). Contract (official-snapshot
 *                      PR #1149): the official side is the Elo favoured side; the TEAM score / margin / total and the
 *                      win probability are WITHHELD (null, reasons in official.withheld): the box prints "Withheld"
 *                      with the snapshot's own reason and never a number.
 *   LAYER "simulated"  SIMULATED GAME — ONE RUN. The selected stored run's whole numbers, from box-score.mjs nbaBoxScore()
 *                      with every one of its fail-closed invariants (player pts = team pts = Σ periods, 2·2PM + 3·3PM +
 *                      FTM = PTS, 3PM ≤ 3PA, minutes = 240 + 25·OT exactly, team fgm = Σ 2PM + Σ 3PM, …). FGM is the
 *                      exact sum 2PM + 3PM of the run's own counts (an identity, not an estimate).
 *   LAYER "estimated"  ESTIMATED · NOT OFFICIAL. One derived field only: the starter / bench ROLE grouping (ROLE_METHOD
 *                      below), from the receipt's per-player starterRate input. Never shown as official, never a number.
 *   "not-modelled"     FGA · FTA · STL · BLK · TO: listed as columns that say "not modelled" — never filled in.
 *
 * WHAT-IF SAFETY. The official layer depends on the manifest only — never on the selected sample — so selecting a what-if
 * run cannot change an official number (projected-box.test.mjs proves the official layer is byte-identical across every
 * stored run, official or hypothetical, and that building a box never mutates the manifest).
 *
 * Fail closed: if the run's box score fails any invariant, or an official value is not a finite non-negative number,
 * { ok: false, errors, box: null } and the UI shows "Box score unavailable".
 */
import { BOX_SCORE_KINDS, NBA_BOX_WATERMARK, NBA_BOX_WATERMARK_WHAT_IF, nbaBoxScore } from "./box-score.mjs";

export const NBA_PROJECTED_BOX_SCHEMA = "nba-projected-box@1";

export const LAYER = Object.freeze({ OFFICIAL: "official", SIMULATED: "simulated", ESTIMATED: "estimated", NOT_MODELLED: "not-modelled" });
export const LAYER_LABEL = Object.freeze({
  official: "Official projection",
  simulated: "Simulated game — one run",
  estimated: "Estimated · not official",
  "not-modelled": "Not modelled",
});
export const LAYER_NOTE = Object.freeze({
  official: "The official forecast for each player (the official player model): the median, or mean, of his outcome. Can be fractional. Not summed into team totals.",
  simulated: "One stored run of the supporting simulation, a different model from the official projection: whole numbers that add up exactly (player points = team score).",
  estimated: "Starter / bench grouping estimated from each player's recent starts. Not a recorded lineup and not official.",
  "not-modelled": "The simulation does not produce these statistics, so none is shown.",
});

/** Which official statistic the official columns print. */
export const OFFICIAL_STATS = Object.freeze(["median", "mean"]);
export const DEFAULT_OFFICIAL_STAT = "median";
/** Which layers the table shows (a reader on a phone can show one layer at a time). */
export const LAYER_VIEWS = Object.freeze(["both", "official", "simulated"]);
export const DEFAULT_LAYER_VIEW = "both";

export const OFFICIAL_COLUMNS = Object.freeze([
  Object.freeze({ key: "minutes", label: "MIN", title: "Minutes" }),
  Object.freeze({ key: "pts", label: "PTS", title: "Points" }),
  Object.freeze({ key: "reb", label: "REB", title: "Rebounds" }),
  Object.freeze({ key: "ast", label: "AST", title: "Assists" }),
  Object.freeze({ key: "threePm", label: "3PM", title: "Three-pointers made" }),
  Object.freeze({ key: "pra", label: "PRA", title: "Points + rebounds + assists" }),
  Object.freeze({ key: "ptsReb", label: "P+R", title: "Points + rebounds" }),
  Object.freeze({ key: "ptsAst", label: "P+A", title: "Points + assists" }),
]);

/** Simulated columns, in display order; each shown only if the run's box score has its source column(s). */
export const SIMULATED_COLUMNS = Object.freeze([
  Object.freeze({ key: "minutes", label: "MIN", title: "Minutes (0.01)" }),
  Object.freeze({ key: "pts", label: "PTS", title: "Points" }),
  Object.freeze({ key: "reb", label: "REB", title: "Rebounds (game total)" }),
  Object.freeze({ key: "ast", label: "AST", title: "Assists" }),
  Object.freeze({ key: "threePm", label: "3PM", title: "Three-pointers made" }),
  Object.freeze({ key: "threePa", label: "3PA", title: "Three-pointers attempted" }),
  Object.freeze({ key: "twoPm", label: "2PM", title: "Two-point field goals made" }),
  Object.freeze({ key: "fgm", label: "FGM", title: "Field goals made = 2PM + 3PM (exact sum of this run's counts)", from: Object.freeze(["twoPm", "threePm"]) }),
  Object.freeze({ key: "ftm", label: "FTM", title: "Free throws made" }),
]);

export const NOT_MODELLED_COLUMNS = Object.freeze([
  Object.freeze({ key: "fga", label: "FGA", why: "field-goal attempts are not simulated (only makes and three-point attempts)" }),
  Object.freeze({ key: "fta", label: "FTA", why: "free-throw attempts are not simulated (only makes)" }),
  Object.freeze({ key: "stl", label: "STL", why: "steals are not simulated" }),
  Object.freeze({ key: "blk", label: "BLK", why: "blocks are not simulated" }),
  Object.freeze({ key: "tov", label: "TO", why: "turnovers are not simulated" }),
]);
export const NOT_MODELLED_TEXT = "not modelled";

/**
 * ESTIMATED ROLE (layer "estimated"). Source: the receipt's per-player `starterRate` (share of the player's last ≤ 10
 * played games that he started; lib/sports/nba/sim-v1-profile.mjs) and `expectedMinutes`, carried verbatim by the adapter
 * as manifest.roleInputs. Rule, per team, over the players the engine simulated: rank by starterRate (desc), then
 * expectedMinutes (desc), then athlete id; the top five with starterRate ≥ 0.5 are "starter (est.)", every other
 * simulated player is "bench (est.)". Fewer than five may qualify (then fewer are labelled). If no player of a team has a
 * starterRate, roles are not derivable and the team is one "Players" group.
 */
export const ROLE_METHOD = Object.freeze({
  id: "nba-role-estimate@1",
  source: "receipt input starterRate (share of the player's last ≤ 10 played games started) and expectedMinutes",
  rule: "per team: rank simulated players by starterRate desc, expectedMinutes desc, athlete id; top 5 with starterRate ≥ 0.5 = starter (est.); the rest = bench (est.)",
  threshold: 0.5,
  slots: 5,
  label: "Estimated from recent starts · not a recorded lineup · not official",
});
export const ROLE_LABEL = Object.freeze({ starter: "Starter (est.)", bench: "Bench (est.)" });

export const GROUPS = Object.freeze({
  starters: "Likely starters · estimated",
  bench: "Bench · estimated",
  players: "Players",
  dnp: "Did not play in this run",
  unavailable: "Not simulated · availability",
});

/** "Representative ≠ median": the explanation printed on every box score (no "projected" wording: a what-if shows it too). */
export const REPRESENTATIVE_VS_MEDIAN = Object.freeze({
  title: "One simulated game is not the median",
  lead: "The official projection and the simulated game answer different questions.",
  points: Object.freeze([
    "Official projection: for each player, the middle (median) or average (mean) of his outcome under the official player model. It summarises a distribution, can be fractional, and the player medians do not add up to a team score.",
    "Simulated game — one run: a single complete game drawn from the supporting simulation, which is a different model. Every number is a whole number and they add up exactly: player points sum to the team score and the quarters sum to the final.",
    "So a player can score well above or below his official projection in the run, and a team's run total can differ from any sum of projections. Neither is rounded into the other.",
  ]),
});
export const WHAT_IF_NOTE = "This is a hypothetical what-if run. Choosing it changes only the simulated-game columns; the official projection columns are the same for every run.";

export const OFFICIAL_STATE = Object.freeze({ AVAILABLE: "AVAILABLE", NO_OFFICIAL: "NO_OFFICIAL" });
export const TEAM_SCORE_STATE = Object.freeze({ AVAILABLE: "AVAILABLE", WITHHELD: "WITHHELD" });
export const WITHHELD_TEXT = "Withheld";
const DEFAULT_WITHHELD_REASON = "the official forecast publishes no team score, margin or total for this game";

const SIDES = Object.freeze(["away", "home"]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v) => (isNum(v) ? v : null);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * The official GAME-level line (layer "official"). Depends on the manifest only. Contract (official-snapshot PR #1149,
 * nba-official-composition@1): official = the Elo favoured side (`winnerSide` "HOME" | "AWAY") + v0.1 player families;
 * `team.{home,away,margin,total}` are null, `projectedScore.state` is "WITHHELD", and `withheld` holds the reason texts
 * (teamScores, winProbability, playerRanges, markets). A withheld figure is printed as "Withheld" with its reason —
 * never a number, even when a raw value (e.g. the Elo pHome) rides in the block.
 */
export function officialGameLine(manifest) {
  const rep = manifest?.representative ?? null;
  const o = rep?.official ?? null;
  if (!o) return { state: OFFICIAL_STATE.NO_OFFICIAL, refusal: rep?.refusal ?? null, winnerSide: null, winProbability: null, modelVersion: null, composition: null, snapshotId: null, teamScores: null, playerRanges: null };
  const w = isObj(o.withheld) ? o.withheld : {};
  const t = isObj(o.team) ? o.team : {};
  const term = (k) => (isObj(t[k]) ? { median: numOrNull(t[k].median), mean: numOrNull(t[k].expected) } : { median: null, mean: null });
  const terms = { away: term("away"), home: term("home"), margin: term("margin"), total: term("total") };
  const any = Object.values(terms).some((x) => x.median != null || x.mean != null);
  const teamWithheld = !any || o.projectedScore?.state === TEAM_SCORE_STATE.WITHHELD || typeof w.teamScores === "string";
  const side = String(o.winnerSide ?? "").toLowerCase();
  const pHome = numOrNull(o.pHomePublished ?? o.pHome);
  const pAway = numOrNull(o.pAway);
  const winWithheld = typeof w.winProbability === "string" || pHome == null;
  return {
    state: OFFICIAL_STATE.AVAILABLE,
    refusal: null,
    snapshotId: o.snapshotId ?? null,
    modelVersion: o.modelVersion ?? null,
    composition: o.composition ?? null,
    publication: o.publication ?? null,
    winnerSide: side === "home" || side === "away" ? side : null,
    winProbability: winWithheld
      ? { state: TEAM_SCORE_STATE.WITHHELD, reason: typeof w.winProbability === "string" ? w.winProbability : "the official forecast publishes no win probability for this game", home: null, away: null }
      : { state: TEAM_SCORE_STATE.AVAILABLE, reason: null, home: pHome, away: pAway },
    teamScores: teamWithheld
      ? { state: TEAM_SCORE_STATE.WITHHELD, reason: typeof w.teamScores === "string" ? w.teamScores : DEFAULT_WITHHELD_REASON, away: null, home: null, margin: null, total: null }
      : { state: TEAM_SCORE_STATE.AVAILABLE, reason: null, ...terms },
    playerRanges: typeof w.playerRanges === "string" ? w.playerRanges : null,
  };
}

/** One player's official projection (layer "official"), by athlete id only (never matched by name). */
function officialFor(rep, id, errors, who) {
  if (!rep?.players || id == null) return null;
  const e = rep.players[String(id)];
  if (!isObj(e) || !isObj(e.families)) return null;
  const values = {};
  for (const c of OFFICIAL_COLUMNS) {
    const f = e.families[c.key];
    if (!isObj(f)) continue;
    for (const k of ["median", "expected"]) {
      if (f[k] != null && !(isNum(f[k]) && f[k] >= 0)) errors.push({ code: "OFFICIAL_VALUE", detail: `${who}: official ${c.key}.${k} = ${JSON.stringify(f[k])}` });
    }
    values[c.key] = { median: numOrNull(f.median), mean: numOrNull(f.expected) };
  }
  const conditioning = e.conditioning ?? Object.values(e.families).find((f) => f?.conditioning)?.conditioning ?? null;
  return { values, playRate: numOrNull(e.playRate), conditioning };
}

/** The estimated role per simulated athlete id of one side (ROLE_METHOD), or null when not derivable. */
export function estimateRoles(simIds, inputs) {
  const ranked = simIds
    .map((id) => ({ id, sr: numOrNull(inputs?.[id]?.starterRate), em: numOrNull(inputs?.[id]?.expectedMinutes) }))
    .filter((x) => x.sr != null);
  if (!ranked.length) return null;
  ranked.sort((a, b) => (b.sr - a.sr) || ((b.em ?? -1) - (a.em ?? -1)) || String(a.id).localeCompare(String(b.id)));
  const starters = new Set(ranked.filter((x) => x.sr >= ROLE_METHOD.threshold).slice(0, ROLE_METHOD.slots).map((x) => x.id));
  return Object.fromEntries(simIds.map((id) => [id, { role: starters.has(id) ? "starter" : "bench", starterRate: numOrNull(inputs?.[id]?.starterRate) }]));
}

export const SUPPORTING_SIMULATION = "supporting simulation";

/**
 * How close this run is to the official projection (official-representative@2: the normalised distance over the
 * official player terms, side-constrained to runs the Elo side won). Reported, never hidden: on the 2026-10-20 slate
 * the official representatives sit at 1.32–1.53 against a 0.5 tolerance, i.e. the closest stored run is still far.
 */
export function runFit(rep, runIndex) {
  if (!rep || rep.state === "NO_OFFICIAL" || !rep.official) return { role: "what-if", distance: null, tolerance: rep?.tolerance ?? null, withinTolerance: false, rule: rep?.rule ?? null, text: FIT_TEXT.none() };
  const entry = (rep.runs ?? []).find((r) => r.runIndex === runIndex) ?? null;
  const official = rep.state === "SELECTED" && rep.officialRunIndex === runIndex;
  const distance = numOrNull(official ? rep.distance : entry?.distance);
  const tolerance = numOrNull(rep.tolerance);
  const within = official ? rep.withinTolerance === true : distance != null && tolerance != null && distance <= tolerance;
  const text = official ? (within ? FIT_TEXT.officialWithin(distance, tolerance) : FIT_TEXT.officialFar(distance, tolerance)) : FIT_TEXT.whatIf(distance, tolerance);
  return { role: official ? "official-representative" : "what-if", distance, tolerance, withinTolerance: within, rule: rep.rule ?? null, text };
}
const f2 = (v) => (isNum(v) ? v.toFixed(2) : "—");
export const FIT_TEXT = Object.freeze({
  officialWithin: (d, t) => `Closest stored run to the official projection (distance ${f2(d)}, within the ${f2(t)} tolerance).`,
  officialFar: (d, t) => `Closest stored run, still far from the official projection (distance ${f2(d)}; tolerance ${f2(t)}). No stored run is closer, so read its numbers as one possible game, not as the forecast.`,
  whatIf: (d, t) => `What-if · hypothetical · distance ${f2(d)} from the official projection (tolerance ${f2(t)}).`,
  none: () => "No official projection to measure this run against: it is a hypothetical what-if.",
});

/**
 * @param {any} sample    one manifest sample (adapter-nba-sim-v1.mjs)
 * @param {any} manifest  the adapted manifest, with `representative` and `roleInputs` when available
 * @param {{ hypothetical?: boolean }} [opts]  a what-if run (labels only: the numbers do not depend on it)
 * @returns {{ ok: boolean, errors: {code: string, detail: string}[], box: object|null }}
 */
export function nbaProjectedBox(sample, manifest, { hypothetical = false } = {}) {
  const sim = nbaBoxScore(sample, manifest, { kind: BOX_SCORE_KINDS.SAMPLE });
  if (!sim.ok) return { ok: false, errors: sim.errors, box: null };
  const b = sim.box;
  const errors = [];
  const rep = manifest.representative ?? null;
  const game = officialGameLine(manifest);

  const simKeys = new Set(b.columns.map((c) => c.key));
  const simColumns = SIMULATED_COLUMNS.filter((c) => (c.from ? c.from.every((k) => simKeys.has(k)) : simKeys.has(c.key)));
  const hasFgm = simColumns.some((c) => c.key === "fgm");
  // official columns: the families at least one player of this game carries
  const offPlayers = rep?.players && isObj(rep.players) ? rep.players : null;
  const offColumns = game.state === OFFICIAL_STATE.AVAILABLE && offPlayers
    ? OFFICIAL_COLUMNS.filter((c) => Object.values(offPlayers).some((p) => isObj(p?.families?.[c.key])))
    : [];

  const teams = {};
  for (const side of SIDES) {
    const t = b.teams[side];
    const simIds = t.rows.map((r) => r.providerAthleteId).filter((id) => id != null);
    const roles = estimateRoles(simIds, manifest.roleInputs?.[side]);
    const rows = [];
    for (const r of t.rows) {
      const who = `${side} ${r.name}`;
      const simulated = r.status === "dnp" ? null : Object.fromEntries(simColumns.map((c) => [c.key, c.key === "fgm" ? r.twoPm + r.threePm : r[c.key]]));
      rows.push({
        providerAthleteId: r.providerAthleteId, name: r.name, side, status: r.status,
        role: roles && r.providerAthleteId != null ? roles[r.providerAthleteId]?.role ?? null : null,
        official: officialFor(rep, r.providerAthleteId, errors, who),
        simulated,
        reason: null, injuryStatus: null,
      });
    }
    for (const r of t.notSimulated) {
      rows.push({
        providerAthleteId: r.providerAthleteId, name: r.name, side, status: "not-simulated", role: null,
        official: officialFor(rep, r.providerAthleteId, errors, `${side} ${r.name}`),
        simulated: null, reason: r.reason, injuryStatus: r.injuryStatus,
      });
    }
    const group = (r) => (r.status === "not-simulated" ? "unavailable" : r.status === "dnp" ? "dnp" : roles ? (r.role === "starter" ? "starters" : "bench") : "players");
    const order = roles ? ["starters", "bench", "dnp", "unavailable"] : ["players", "dnp", "unavailable"];
    const groups = order
      .map((id) => ({ id, label: GROUPS[id], layer: id === "starters" || id === "bench" ? LAYER.ESTIMATED : null, rows: rows.filter((r) => group(r) === id) }))
      .filter((g) => g.rows.length);
    const simTotals = Object.fromEntries(simColumns.map((c) => [c.key, c.key === "fgm" ? t.totals.twoPm + t.totals.threePm : t.totals[c.key]]));
    const pts = game.teamScores?.state === TEAM_SCORE_STATE.AVAILABLE ? game.teamScores[side] : null;
    teams[side] = {
      side, abbr: t.abbr, name: t.name,
      groups,
      rolesDerivable: !!roles,
      totals: {
        simulated: simTotals,
        // official team totals: points only, and only when the official forecast publishes a team score
        official: { state: game.teamScores?.state ?? null, pts },
      },
    };
  }
  // the run's own identity checks that this layer adds (beyond nbaBoxScore): FGM = 2PM + 3PM, row and team
  if (hasFgm) {
    for (const side of SIDES) {
      const rowsFgm = teams[side].groups.flatMap((g) => g.rows).reduce((a, r) => a + (r.simulated?.fgm ?? 0), 0);
      if (rowsFgm !== teams[side].totals.simulated.fgm) errors.push({ code: "FGM_SUM", detail: `${side}: Σ player FGM ${rowsFgm} ≠ team ${teams[side].totals.simulated.fgm}` });
    }
  }
  if (errors.length) return { ok: false, errors, box: null };

  const columns = [
    ...offColumns.map((c) => ({ layer: LAYER.OFFICIAL, key: c.key, label: c.label, title: c.title, sortable: true })),
    ...simColumns.map((c) => ({ layer: LAYER.SIMULATED, key: c.key, label: c.label, title: c.title, sortable: true, derived: c.from ? "2PM + 3PM" : null })),
    ...NOT_MODELLED_COLUMNS.map((c) => ({ layer: LAYER.NOT_MODELLED, key: c.key, label: c.label, title: `${c.label}: ${NOT_MODELLED_TEXT} (${c.why})`, sortable: false })),
  ];
  const placed = new Set(SIDES.flatMap((s) => teams[s].groups.flatMap((g) => g.rows.map((r) => String(r.providerAthleteId)))));
  const officialUnplaced = Object.keys(offPlayers ?? {}).filter((id) => !placed.has(id)).length;
  const conditioning = [...new Set(Object.values(offPlayers ?? {}).map((p) => p?.conditioning ?? Object.values(p?.families ?? {}).find((f) => f?.conditioning)?.conditioning).filter(Boolean))];
  return {
    ok: true,
    errors: [],
    box: {
      schema: NBA_PROJECTED_BOX_SCHEMA,
      hypothetical: !!hypothetical,
      layers: {
        official: {
          label: LAYER_LABEL.official, note: LAYER_NOTE.official, state: game.state,
          available: offColumns.length > 0, conditioning, refusal: game.refusal, unplaced: officialUnplaced,
        },
        simulated: {
          label: LAYER_LABEL.simulated, note: LAYER_NOTE.simulated, runIndex: b.header.runIndex, title: b.header.title, hypothetical: !!hypothetical,
          // the run comes from a DIFFERENT model than the official projection: name it on the layer
          source: manifest.modelVersion ? `${manifest.modelVersion} (${SUPPORTING_SIMULATION})` : SUPPORTING_SIMULATION,
          fit: runFit(rep, b.header.runIndex),
          invariantsChecked: [...b.invariantsChecked, ...(hasFgm ? ["FGM_SUM"] : [])],
        },
        estimated: {
          label: LAYER_LABEL.estimated, note: LAYER_NOTE.estimated, fields: SIDES.some((s) => teams[s].rolesDerivable) ? ["role"] : [], method: ROLE_METHOD,
        },
        notModelled: { label: LAYER_LABEL["not-modelled"], note: LAYER_NOTE["not-modelled"], columns: NOT_MODELLED_COLUMNS.map((c) => ({ label: c.label, why: c.why })) },
      },
      officialGame: game,
      columns,
      teams,
      sim: b,
      watermark: hypothetical ? NBA_BOX_WATERMARK_WHAT_IF : NBA_BOX_WATERMARK,
    },
  };
}

/**
 * Deterministic sort inside each group. `sort` = { layer: "official"|"simulated", key, dir, stat }. Rows with no value
 * in the sorted layer (a DNP's simulated stats, a player without an official projection) follow, by name.
 * @param {any[]} rows
 * @param {{ layer?: string, key?: string, dir?: string, stat?: string }} [sort]
 */
export function sortProjectedRows(rows, { layer = LAYER.SIMULATED, key = "minutes", dir = "desc", stat = DEFAULT_OFFICIAL_STAT } = {}) {
  const sgn = dir === "asc" ? 1 : -1;
  const v = (r) => {
    if (layer === LAYER.OFFICIAL) { const x = r.official?.values?.[key]; return x ? (stat === "mean" ? x.mean : x.median) : null; }
    const x = r.simulated?.[key];
    return isNum(x) ? x : null;
  };
  return [...rows].sort((a, b) => {
    const va = v(a);
    const vb = v(b);
    if ((va == null) !== (vb == null)) return va == null ? 1 : -1;
    if (va != null && vb != null && va !== vb) return (va - vb) * sgn;
    const ma = a.simulated?.minutes ?? -1;
    const mb = b.simulated?.minutes ?? -1;
    if (ma !== mb) return mb - ma;
    return a.name.localeCompare(b.name, "en") || String(a.providerAthleteId ?? "").localeCompare(String(b.providerAthleteId ?? ""));
  });
}

export const DEFAULT_PROJECTED_SORT = Object.freeze({ layer: LAYER.SIMULATED, key: "minutes", dir: "desc" });
/** The next sort after activating a column: the same column flips; a new one starts descending. */
export const nextProjectedSort = (cur, layer, key) => (cur?.layer === layer && cur?.key === key ? { layer, key, dir: cur.dir === "desc" ? "asc" : "desc" } : { layer, key, dir: "desc" });

/** A short stable key of the official layer (FNV-1a over its JSON): equal for every run of one game. */
export function officialLayerKey(box) {
  const s = JSON.stringify(officialLayerOf(box));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** The official numbers shown on a box score, as one plain object (used by the what-if test and the UI's data hook). */
export function officialLayerOf(box) {
  if (!box) return null;
  // keyed and ORDERED by side:athlete id (a row's group changes with the run — e.g. a DNP — its official values never do)
  const entries = [];
  for (const side of SIDES) for (const g of box.teams[side].groups) for (const r of g.rows) entries.push([`${side}:${r.providerAthleteId ?? r.name}`, r.official]);
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const players = Object.fromEntries(entries);
  return {
    game: box.officialGame,
    columns: box.columns.filter((c) => c.layer === LAYER.OFFICIAL),
    totals: Object.fromEntries(SIDES.map((s) => [s, box.teams[s].totals.official])),
    players,
  };
}
