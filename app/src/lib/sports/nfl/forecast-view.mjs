/**
 * NFL FORECAST VIEW — the ONE consumption layer every public NFL surface reads (hub slate, game page, Top boards).
 * NFL-local; CONTRACT-001 owns the cross-sport contract. Pure: documents in, view out; no I/O, no clock.
 *
 * Every displayed number names its source, and each family has exactly one source of record (NFL_SOURCES below), so
 * a player's projection is the same object wherever it appears — the game page and the boards read the same row.
 *
 *   game outcome (win chance, projected score, margin, total)  → the published forecast of record
 *                                                                 (nfl-regular-season-public-v1)
 *   simulated outcomes (distributions, sampled games)           → World Model V2, whose scores are drawn from that
 *                                                                 forecast's own margin and total
 *   passing / rushing / receiving yards, receptions             → World Model V2 player distributions (one coherent
 *                                                                 game per world; QB-aware)
 *   anytime touchdown                                           → the published opportunity touchdown model (World
 *                                                                 Model V2's touchdown scorer failed its evaluation)
 *   passing touchdowns, first touchdown scorer                  → not published (no evaluated model)
 *
 * Changing a family's source is a one-line change here, guarded by tests, recorded in the roadmap — never a silent
 * mix. Nothing in this file promotes a model: every NFL output remains PUBLIC_EXPERIMENTAL ("under forward
 * evaluation"); product eligibility is decided elsewhere and is unchanged.
 */

import { PUBLIC_BOARD_CLEARED } from "./board-ranking.mjs";

export const NFL_FORECAST_VIEW_VERSION = 1;

export const SOURCES = Object.freeze({
  record: Object.freeze({ key: "record", label: "Game Time Forecast", modelId: "nfl-regular-season-public-v1" }),
  worldModel: Object.freeze({ key: "worldModel", label: "World Model V2", modelId: "nfl-world-model-v2" }),
  opportunityTd: Object.freeze({ key: "opportunityTd", label: "Touchdown model", modelId: "nfl-opportunity-td (player board)" }),
  /* FALLBACK, never silent: a game with no World Model V2 simulation (e.g. a new week before its input packet is
     exported) shows the player board's own published / estimate families, and every list names this source. */
  playerBoard: Object.freeze({ key: "playerBoard", label: "Player board model (no simulation for this game yet)", modelId: "player board" }),
});

/** Player families, in display order. `source: null` = not published, with the reason shown instead of a number. */
export const PLAYER_FAMILIES = Object.freeze([
  Object.freeze({ key: "passingYards", title: "Passing yards", short: "Pass yds", unit: "yds", kind: "yards", source: "worldModel" }),
  Object.freeze({ key: "rushingYards", title: "Rushing yards", short: "Rush yds", unit: "yds", kind: "yards", source: "worldModel" }),
  Object.freeze({ key: "receivingYards", title: "Receiving yards", short: "Rec yds", unit: "yds", kind: "yards", source: "worldModel" }),
  Object.freeze({ key: "receptions", title: "Receptions", short: "Rec", unit: "rec", kind: "count", source: "worldModel" }),
  Object.freeze({ key: "anytimeTd", title: "Anytime touchdown", short: "Anytime TD", unit: "%", kind: "probability", source: "opportunityTd" }),
  Object.freeze({ key: "passingTd", title: "Passing touchdowns", short: "Pass TD", unit: "TD", kind: "count", source: null, withheld: "Passing touchdowns are credited to the quarterback in every simulated game, but their distribution has not been evaluated yet, so no projection is published." }),
  Object.freeze({ key: "firstTd", title: "First touchdown scorer", short: "First TD", unit: "%", kind: "probability", source: null, withheld: "First-touchdown odds need the order of scoring plays. Our simulated games record who scored, not in what order, so no first-touchdown probability is published." }),
]);
export const BOARD_FAMILIES = Object.freeze(PLAYER_FAMILIES.map((f) => f.key));

/** One consistent rounding rule for every surface. */
export function formatValue(kind, v) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (kind === "probability") return `${(v * 100).toFixed(1)}%`;
  if (kind === "count") return (Math.round(v * 10) / 10).toFixed(1);
  return String(Math.round(v));
}

/**
 * Players cleared for a public ranked list: the ONE shared allowlist (board-ranking.mjs PUBLIC_BOARD_CLEARED) plus World
 * Model V2's own "ACTIVE" (on the active roster, no injury designation). Out / Inactive / Questionable / Doubtful never rank.
 */
export const CLEARED = Object.freeze([...PUBLIC_BOARD_CLEARED, "ACTIVE"]);

const WM_FAMILY = { passingYards: "passingYards", rushingYards: "rushingYards", receivingYards: "receivingYards", receptions: "receptions" };

/**
 * The view of one game.
 * @param {{forecast: object, world?: object|null, board?: object|null}} docs
 */
export function gameView({ forecast: f, world = null, board = null }) {
  const s = f.forecastSummary;
  const home = f.home.abbr; const away = f.away.abbr;
  const favourite = s.winProbability.home >= s.winProbability.away ? home : away;
  const usableWorld = world && world.identity?.providerEventId === f.providerEventId ? world : null;
  const view = {
    version: NFL_FORECAST_VIEW_VERSION,
    providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc, venue: f.venue ?? null,
    away: f.away, home: f.home, week: f.week, seasonType: f.seasonType,
    record: {
      source: SOURCES.record, modelId: f.model?.id ?? SOURCES.record.modelId, generatedAt: f.generatedAt,
      favourite, winProbability: { home: s.winProbability.home, away: s.winProbability.away, tieAfterRegulation: s.winProbability.tieMass ?? null },
      projectedScore: s.projectedScore, margin: s.margin, total: s.total, scoreRange: s.scoreRange ?? null,
      teamInputs: f.teamInputs ?? null,
    },
    simulation: usableWorld ? {
      source: SOURCES.worldModel, version: usableWorld.model.version, simulationId: usableWorld.simulationId, generatedAt: usableWorld.run.generatedAt,
      runs: usableWorld.run.runs, inputs: usableWorld.run.inputs,
      winProbability: usableWorld.game.winProbability, overtime: usableWorld.game.overtime,
      margin: usableWorld.game.margin, total: usableWorld.game.total, histograms: usableWorld.game.histograms ?? null,
      teams: { away: usableWorld.game.away, home: usableWorld.game.home },
      sampledWorlds: usableWorld.sampledWorlds, quarterbacks: usableWorld.quarterbacks ?? null,
      availability: usableWorld.availability, unsupported: usableWorld.unsupported, limitations: usableWorld.limitations,
      diagnostics: { teamWorldsChecked: usableWorld.diagnostics.teamWorldsChecked, invariantViolations: usableWorld.diagnostics.invariantViolations },
    } : null,
    players: playerRows({ forecast: f, world: usableWorld, board }),
  };
  return view;
}

/**
 * One row per player, each family carrying its own source. A player in both documents is matched by ESPN athlete id
 * (`nfl-athlete-<id>`). Availability: the stricter of the two documents' states, so a player either source holds out
 * is never ranked.
 */
export function playerRows({ forecast: f, world, board }) {
  const rows = new Map();
  const opp = (team) => (team === f.home.abbr ? f.away.abbr : f.home.abbr);
  const get = (id, base) => {
    if (!rows.has(id)) rows.set(id, { playerId: id, name: base.name, position: base.position ?? null, team: base.team, opponent: opp(base.team), providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc, availability: [], families: {} });
    return rows.get(id);
  };
  for (const p of world?.players ?? []) {
    const r = get(p.playerId, p);
    r.availability.push({ source: "worldModel", state: p.availability, status: p.injuryStatus ?? null });
    for (const [fam, wk] of Object.entries(WM_FAMILY)) {
      const d = p.families?.[wk];
      if (!d) continue;
      /* projected value: the median for yards (skewed); the expected count for receptions (a whole-number median ties) */
      r.families[fam] = { source: "worldModel", value: fam === "receptions" ? d.mean : d.median, mean: d.mean, p10: d.p10, p25: d.p25, p75: d.p75, p90: d.p90, atLeast: d.atLeast ?? null, simulationId: world.simulationId, version: world.model.version, asOf: world.run.generatedAt };
    }
  }
  if (!world) {
    const BOARD_MARKET = { passingYards: "player_pass_yds", rushingYards: "player_rush_yds", receivingYards: "player_reception_yds", receptions: "player_receptions" };
    for (const p of board?.players ?? []) {
      for (const [fam, mk] of Object.entries(BOARD_MARKET)) {
        const st = board.families?.[mk]?.state;
        const d = p.markets?.[mk];
        if (!(st === "PUBLISHED" || st === "ESTIMATE") || !d || !Number.isFinite(d.median)) continue;
        const r = get(p.playerId, p);
        r.families[fam] = { source: "playerBoard", value: fam === "receptions" ? d.mean : d.median, mean: d.mean, p10: d.p10, p90: d.p90, asOf: board.generatedAt, familyState: st };
      }
    }
  }
  const atdPublished = board?.families?.anytime_td?.state === "PUBLISHED";
  for (const p of board?.players ?? []) {
    const pr = p.markets?.anytime_td?.probability;
    if (!atdPublished || !Number.isFinite(pr)) {
      if (rows.has(p.playerId)) rows.get(p.playerId).availability.push({ source: "opportunityTd", state: p.participation });
      continue;
    }
    const r = get(p.playerId, p);
    r.availability.push({ source: "opportunityTd", state: p.participation });
    r.families.anytimeTd = { source: "opportunityTd", value: pr, asOf: board.generatedAt, modelBasis: board.families.anytime_td.basis ?? null };
  }
  return [...rows.values()].map((r) => ({ ...r, cleared: r.availability.every((a) => CLEARED.includes(a.state)), availabilityLabel: availabilityLabel(r.availability) }));
}

function availabilityLabel(list) {
  const states = list.map((a) => a.state);
  if (states.some((s) => s === "OUT" || s === "INACTIVE")) return "Out";
  if (states.includes("DOUBTFUL")) return "Doubtful";
  if (states.includes("QUESTIONABLE")) return "Questionable";
  return null;
}

/**
 * Top boards across games, from the SAME rows the game pages render. Ranking metric per family: the projected
 * value shown (median yards; expected receptions; the probability for anytime TD), ties by the simulated average, then name.
 * Only cleared players, only games that have not kicked off at `now`; fewer than `size` rather than fill.
 */
export function topBoards(views, { now, size = 10 }) {
  const live = views.filter((v) => Date.parse(v.kickoffUtc) > Date.parse(now));
  const out = {};
  for (const fam of PLAYER_FAMILIES) {
    if (!fam.source) { out[fam.key] = { family: fam, rows: [], withheld: fam.withheld }; continue; }
    const rows = [];
    for (const v of live) for (const p of v.players) {
      const d = p.families[fam.key];
      if (!d || !p.cleared) continue;
      rows.push({ ...p, entry: d });
    }
    rows.sort((a, b) => b.entry.value - a.entry.value || (b.entry.mean ?? 0) - (a.entry.mean ?? 0) || a.name.localeCompare(b.name));
    out[fam.key] = { family: fam, rows: rows.slice(0, size).map((r, i) => ({ rank: i + 1, ...r })), withheld: null };
  }
  return { boards: out, games: live.length };
}

/** What each family's headline number is — printed under every list so a reader never has to guess. */
export const FAMILY_METRIC = Object.freeze({
  passingYards: "Projected = median passing yards across the simulated games; 80% of them fall in the range shown",
  rushingYards: "Projected = median rushing yards across the simulated games; 80% of them fall in the range shown",
  receivingYards: "Projected = median receiving yards across the simulated games; 80% of them fall in the range shown",
  receptions: "Projected = expected receptions (the average across the simulated games); 80% of them fall in the range shown",
  anytimeTd: "Chance to score at least one rushing or receiving touchdown if he plays — from the published touchdown model, not from the simulated games",
});

/**
 * Tab descriptors + rows for the shared FamilyTabs component. `lists` maps family → rows already ordered; the client
 * renders them verbatim. Game page: every player with the family (availability flagged). Boards: `topBoards` rows.
 */
export function familyTabs(rowsByFamily, { asOfByFamily = {}, sourcesByFamily = {} } = {}) {
  const families = PLAYER_FAMILIES.map((f) => ({
    key: f.key, title: f.title, kind: f.kind, unit: f.unit, withheld: f.source ? null : f.withheld,
    metric: FAMILY_METRIC[f.key] ?? "",
    sourceLabel: f.source ? (sourcesByFamily[f.key]?.length ? sourcesByFamily[f.key] : [f.source]).map((k) => SOURCES[k].label).join(" + ") : null,
    asOf: asOfByFamily[f.key] ?? null,
  }));
  return { families, lists: rowsByFamily };
}

const slim = (p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team, opponent: p.opponent, providerEventId: p.providerEventId, matchup: p.matchup, kickoffUtc: p.kickoffUtc, availabilityLabel: p.availabilityLabel });
const slimEntry = (e) => ({ value: e.value, p10: e.p10 ?? null, p90: e.p90 ?? null, mean: e.mean ?? null });

export function gameTabs(view) {
  const lists = {}; const asOf = {}; const src = {};
  for (const f of PLAYER_FAMILIES) {
    if (!f.source) continue;
    const rows = view.players.filter((p) => p.families[f.key]).sort((a, b) => b.families[f.key].value - a.families[f.key].value || a.name.localeCompare(b.name));
    lists[f.key] = rows.map((p) => ({ player: slim(p), entry: slimEntry(p.families[f.key]) }));
    asOf[f.key] = rows[0]?.families[f.key].asOf ?? null;
    src[f.key] = [...new Set(rows.map((p) => p.families[f.key].source))].sort();
  }
  return familyTabs(lists, { asOfByFamily: asOf, sourcesByFamily: src });
}

export function boardTabs(boards) {
  const lists = {}; const asOf = {}; const src = {};
  for (const [k, b] of Object.entries(boards)) {
    lists[k] = b.rows.map((r) => ({ rank: r.rank, player: slim(r), entry: slimEntry(r.entry) }));
    asOf[k] = b.rows.map((r) => r.entry.asOf).filter(Boolean).sort().at(-1) ?? null;
    src[k] = [...new Set(b.rows.map((r) => r.entry.source))].sort();
  }
  return familyTabs(lists, { asOfByFamily: asOf, sourcesByFamily: src });
}
