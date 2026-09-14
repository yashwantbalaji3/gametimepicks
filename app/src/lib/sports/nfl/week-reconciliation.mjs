/**
 * NFL WEEK RECONCILIATION — THE GRADING RULES (P296).
 *
 * We publish distributions, not over/under calls, so "hit or miss" has to be defined from what a reader
 * was actually shown, and defined before anyone looks at a result:
 *
 *   winner              the side we gave the higher win chance won (a tie is void)
 *   ranges              the final number landed inside the range printed on the page — the 8-in-10 band —
 *                       with the bounds rounded exactly as the page rounded them (whole yards, one decimal
 *                       for catches). About 8 in 10 SHOULD land inside; far more means the ranges were too
 *                       wide, far fewer too narrow. A rate of 100% is not a triumph.
 *   likeliest scorer    per game, the player we rated likeliest to score: credited with a rushing, receiving
 *                       or return touchdown in the official record (settleAnytimeTd — a passer is not a scorer)
 *   voids               a player with no line anywhere in the official box score did not play: void, not a miss
 *   context only        whose total was closer to the final, ours or the sportsbooks' — never in a success rate
 *
 * Every function here is pure. The builder (scripts/nfl/build-nfl-week-reconciliation.mjs) does the I/O.
 */
import { settleAnytimeTd } from "./td-engine.mjs";

export const RECONCILIATION_RULES = Object.freeze({
  source: "Every prediction is graded exactly as it was published before its kickoff, against the official final box score.",
  winner: "A hit when the team we gave the higher win chance won. A tie is void.",
  ranges: "Every total, margin and player number we publish comes with a range that 8 in 10 of our simulations landed inside. A hit is a final number inside that range, as it was shown on the page. About 8 in 10 should land inside: far more means our ranges were too wide, far fewer means too narrow.",
  likeliestScorer: "In each game, the player we gave the best chance to score a touchdown. A hit if the official record credits him with a rushing, receiving or return touchdown — throwing one does not count.",
  voids: "A player with no line at all in the official box score did not play, so his predictions are void, not misses. A game that is not final yet is pending.",
  estimates: "Rushing and passing yards were shown as unvalidated estimates. They are graded the same way and labelled.",
  sportsbook: "For context only, not part of any success rate: whether our projected total or the sportsbooks' total was closer to the final.",
  sharpness: "A range can always be made to land 8 in 10 times by making it wider. So beside each success rate we show the typical miss (how far the middle of our range was from the final number) and the average width of the range. Getting better means both shrink while about 8 in 10 still land inside.",
});

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * How close and how narrow a set of graded range rows was: typical miss (mean |middle − actual|), average width
 * (high − low), and lean (mean middle − actual: negative means our middle ran low). Voids never count.
 */
export function rangeSharpness(rows) {
  const graded = rows.filter((r) => r.outcome !== "VOID" && Number.isFinite(r.actual) && Number.isFinite(r.median) && Number.isFinite(r.low) && Number.isFinite(r.high));
  if (!graded.length) return null;
  const mean = (f) => graded.reduce((a, r) => a + f(r), 0) / graded.length;
  return { typicalMiss: round1(mean((r) => Math.abs(r.median - r.actual))), rangeWidth: round1(mean((r) => r.high - r.low)), lean: round1(mean((r) => r.median - r.actual)) };
}

const num = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * The official lines a reconciliation needs, from an ESPN event summary. PENDING unless the game is final.
 * @returns {{state: "PENDING", status: string} | {state: "FINAL", finalScore: {home: number, away: number}, players: Record<string, object>, scorers: Array<{playerId: string, creditType: string}>}}
 */
export function officialFromEspnSummary(json) {
  const comp = json?.header?.competitions?.[0];
  const type = comp?.status?.type;
  if (!type?.completed || !/FINAL/.test(String(type.name ?? ""))) return { state: "PENDING", status: type?.name ?? "UNAVAILABLE" };
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  const finalScore = { home: num(home?.score), away: num(away?.score) };
  if (finalScore.home == null || finalScore.away == null) return { state: "PENDING", status: "FINAL_WITHOUT_SCORE" };

  const players = {};
  const scorers = [];
  const credit = (playerId, creditType, tds) => { if ((tds ?? 0) > 0) scorers.push({ playerId, creditType }); };
  for (const team of json.boxscore?.players ?? []) {
    for (const cat of team.statistics ?? []) {
      const at = (stats, label) => { const i = (cat.labels ?? []).indexOf(label); return i >= 0 ? num(stats?.[i]) : null; };
      for (const a of cat.athletes ?? []) {
        const id = String(a.athlete?.id ?? "");
        if (!id) continue;
        const p = (players[id] ??= { name: a.athlete.displayName ?? null, team: team.team?.abbreviation ?? null, passYds: 0, rushYds: 0, recYds: 0, receptions: 0 });
        const s = a.stats;
        if (cat.name === "passing") { p.passYds = at(s, "YDS") ?? 0; credit(id, "PASS", at(s, "TD")); }
        else if (cat.name === "rushing") { p.rushYds = at(s, "YDS") ?? 0; credit(id, "RUSH", at(s, "TD")); }
        else if (cat.name === "receiving") { p.recYds = at(s, "YDS") ?? 0; p.receptions = at(s, "REC") ?? 0; credit(id, "RECEIVE", at(s, "TD")); }
        else if (["kickReturns", "puntReturns", "interceptions"].includes(cat.name)) credit(id, "RETURN", at(s, "TD"));
        else if (cat.name === "defensive") credit(id, "RECOVERY", at(s, "TD"));
      }
    }
  }
  return { state: "FINAL", finalScore, players, scorers };
}

/* The player families a board can publish, with the stat that settles each and how the page rounds it. */
export const PLAYER_PROPS = Object.freeze([
  { key: "player_receptions", label: "Receptions", stat: "receptions", round: (v) => Math.round(v * 10) / 10 },
  { key: "player_reception_yds", label: "Receiving yards", stat: "recYds", round: Math.round },
  { key: "player_rush_yds", label: "Rushing yards", stat: "rushYds", round: Math.round },
  { key: "player_pass_yds", label: "Passing yards", stat: "passYds", round: Math.round },
]);

/**
 * Grade one game. Never throws: missing pieces become PENDING, VOID or a named note.
 * @param {{forecast: object, board: object|null, boardRefused?: string|null, official: object}} a
 */
export function gradeGame({ forecast, board, boardRefused = null, official }) {
  const s = forecast.forecastSummary;
  const pickHome = s.winProbability.home >= s.winProbability.away;
  const published = {
    generatedAt: forecast.generatedAt,
    projectedScore: { away: s.projectedScore.away, home: s.projectedScore.home },
    pick: { abbr: pickHome ? forecast.home.abbr : forecast.away.abbr, probability: pickHome ? s.winProbability.home : s.winProbability.away },
    total: { median: s.total.median, low: s.total.p10, high: s.total.p90 },
    margin: { median: s.margin.median, low: s.margin.p10, high: s.margin.p90 },
    sportsbookTotal: forecast.marketComparison?.marketTotal ?? null,
  };
  const base = {
    providerEventId: String(forecast.providerEventId),
    matchup: forecast.matchup,
    kickoffUtc: forecast.kickoffUtc,
    away: { abbr: forecast.away.abbr, name: forecast.away.name },
    home: { abbr: forecast.home.abbr, name: forecast.home.name },
    published,
  };
  if (official?.state !== "FINAL") return { ...base, state: "PENDING", final: null, team: [], players: [], touchdowns: [], boardNote: null };

  const { home, away } = official.finalScore;
  const total = home + away;
  const margin = home - away;
  const inside = (v, lo, hi) => v >= lo && v <= hi;
  const winnerSide = margin > 0 ? "home" : margin < 0 ? "away" : "tie";
  const oursOff = Math.abs(published.total.median - total);
  const booksOff = published.sportsbookTotal == null ? null : Math.abs(published.sportsbookTotal - total);
  const team = [
    { prop: "winner", outcome: winnerSide === "tie" ? "VOID" : (winnerSide === "home") === pickHome ? "HIT" : "MISS" },
    { prop: "total_range", outcome: inside(total, published.total.low, published.total.high) ? "HIT" : "MISS", actual: total },
    { prop: "margin_range", outcome: inside(margin, published.margin.low, published.margin.high) ? "HIT" : "MISS", actual: margin },
    { prop: "closer_than_sportsbook", outcome: booksOff == null ? "NO_LINE" : oursOff < booksOff ? "HIT" : oursOff > booksOff ? "MISS" : "PUSH", oursOff, booksOff },
  ];

  const players = [];
  const touchdowns = [];
  for (const p of board?.players ?? []) {
    const espnId = String(p.playerId ?? "").replace(/^nfl-athlete-/, "");
    const line = official.players[espnId] ?? null;
    for (const prop of PLAYER_PROPS) {
      const m = p.markets?.[prop.key];
      const status = board.families?.[prop.key]?.state;
      if (!m || !Number.isFinite(m.p10) || !Number.isFinite(m.p90) || (status !== "PUBLISHED" && status !== "ESTIMATE")) continue;
      const low = prop.round(m.p10);
      const high = prop.round(m.p90);
      const actual = line ? line[prop.stat] ?? 0 : null;
      players.push({
        name: p.name, team: p.team, prop: prop.key, status,
        median: Number.isFinite(m.median) ? prop.round(m.median) : null, low, high, actual,
        outcome: line ? (inside(actual, low, high) ? "HIT" : "MISS") : "VOID",
      });
    }
    const td = p.markets?.anytime_td;
    if (td && Number.isFinite(td.probability) && board.families?.anytime_td?.state === "PUBLISHED") {
      const settled = settleAnytimeTd({ playerId: espnId, officialScorers: official.scorers, playerStatus: line ? "ACTIVE" : "DNP" });
      touchdowns.push({ name: p.name, team: p.team, probability: td.probability, outcome: settled.outcome === "WIN" ? "SCORED" : settled.outcome === "LOSS" ? "DID_NOT_SCORE" : "VOID" });
    }
  }
  const likeliest = [...touchdowns].sort((a, b) => b.probability - a.probability || String(a.name).localeCompare(String(b.name)))[0];
  if (likeliest) likeliest.likeliest = true;

  return {
    ...base,
    state: "FINAL",
    final: { away, home, total, margin },
    team,
    players,
    touchdowns,
    boardNote: board ? null : (boardRefused ?? "no player board was published for this game"),
  };
}

const PROPS = [
  { id: "winner", label: "Picked the winner", group: "team" },
  { id: "total_range", label: "Total points landed in our range", group: "team", target: 0.8 },
  { id: "margin_range", label: "Winning margin landed in our range", group: "team", target: 0.8 },
  ...PLAYER_PROPS.map((p) => ({ id: p.key, label: `${p.label} landed in our range`, group: "player", target: 0.8 })),
  { id: "likeliest_scorer", label: "Our likeliest touchdown scorer scored", group: "player" },
];

/** Success rates per prop and overall, over FINAL games only. */
export function summariseWeek(games) {
  const final = games.filter((g) => g.state === "FINAL");
  const outcomesFor = (id) => {
    if (id === "likeliest_scorer") {
      return final.flatMap((g) => g.touchdowns.filter((t) => t.likeliest))
        .map((t) => (t.outcome === "SCORED" ? "HIT" : t.outcome === "DID_NOT_SCORE" ? "MISS" : "VOID"));
    }
    const teamRows = final.flatMap((g) => g.team.filter((t) => t.prop === id)).map((t) => t.outcome);
    const playerRows = final.flatMap((g) => g.players.filter((r) => r.prop === id)).map((r) => r.outcome);
    return [...teamRows, ...playerRows];
  };
  /* The rows a range prop's sharpness is measured on, in one shape: {median, low, high, actual, outcome}. */
  const rangeRowsFor = (id) => {
    if (id === "total_range" || id === "margin_range") {
      const key = id === "total_range" ? "total" : "margin";
      return final.map((g) => ({ ...g.published[key], actual: g.final[key], outcome: g.team.find((t) => t.prop === id)?.outcome }));
    }
    return final.flatMap((g) => g.players.filter((r) => r.prop === id));
  };
  const props = PROPS.map((p) => {
    const o = outcomesFor(p.id);
    const hits = o.filter((x) => x === "HIT").length;
    const checks = hits + o.filter((x) => x === "MISS").length;
    const statuses = [...new Set(final.flatMap((g) => g.players.filter((r) => r.prop === p.id).map((r) => r.status)))];
    const sharpness = p.target ? rangeSharpness(rangeRowsFor(p.id)) : null;
    /* Winner: how many picks the published chances expected to come true, so 8 of 15 reads against a real bar. */
    const expected = p.id === "winner"
      ? { expectedHits: round1(final.filter((g) => g.team.find((t) => t.prop === "winner")?.outcome !== "VOID").reduce((a, g) => a + g.published.pick.probability, 0)) }
      : {};
    return { ...p, checks, hits, voids: o.filter((x) => x === "VOID").length, rate: checks ? hits / checks : null, ...(statuses.length ? { status: statuses.includes("ESTIMATE") ? "ESTIMATE" : "PUBLISHED" } : {}), ...(sharpness ?? {}), ...expected };
  });
  const checks = props.reduce((a, p) => a + p.checks, 0);
  const hits = props.reduce((a, p) => a + p.hits, 0);
  const closer = final.flatMap((g) => g.team.filter((t) => t.prop === "closer_than_sportsbook"));
  const tds = final.flatMap((g) => g.touchdowns).filter((t) => t.outcome !== "VOID");
  return {
    gamesFinal: final.length,
    gamesPending: games.length - final.length,
    overall: { checks, hits, rate: checks ? hits / checks : null },
    props,
    context: {
      closerThanSportsbook: {
        oursCloser: closer.filter((c) => c.outcome === "HIT").length,
        booksCloser: closer.filter((c) => c.outcome === "MISS").length,
        even: closer.filter((c) => c.outcome === "PUSH").length,
        noLine: closer.filter((c) => c.outcome === "NO_LINE").length,
      },
      touchdowns: {
        playersGraded: tds.length,
        expectedScorers: Math.round(tds.reduce((a, t) => a + t.probability, 0) * 10) / 10,
        actualScorers: tds.filter((t) => t.outcome === "SCORED").length,
      },
    },
  };
}
