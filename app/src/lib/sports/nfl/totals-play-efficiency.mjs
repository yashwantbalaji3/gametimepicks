/**
 * MATCHUP TOTALS HEAD v3 — PLAY EFFICIENCY (P295).
 *
 * The totals head the historical replay found ELIGIBLE on 5,878 never-examined games (2000–2021):
 *
 *   total ~ Normal(L + cS·(s − L) + cE·E + cPlays·P, sigma)
 *
 *   s  = mean of the two teams' decayed (points for + against) per game — the v1 rating
 *   L  = the league's current mean of those ratings (the intercept IS the league level, so league-wide
 *        scoring drift can never become a constant bias again — the defect v1 carried)
 *   E  = both offences' decayed EPA per play plus both defences' EPA per play allowed, each measured
 *        against the league's current mean
 *   P  = both offences' decayed plays per game against the league mean (pace)
 *
 * It learns game by game: every rating folds in each date's finals before the next date's games are
 * predicted. Parameters come ONLY from the committed evaluation receipt (devFits) and the frozen block
 * of its preregistration; the caller must refuse unless the receipt's v3 verdict is ELIGIBLE.
 *
 * This file is the replay's recurrence (scripts/research/nfl/replay-matchup-totals.mjs) written once
 * for production. totals-play-efficiency.test.mjs proves it reproduces the receipt's held-out figures,
 * season by season — that proof is what makes this the evaluated model rather than a lookalike.
 */

export const NFL_TOTALS_V3_HEAD_ID = "matchup-totals-v3-play-efficiency";
export const TOTALS_REPLAY_RECEIPT = "data/internal/research/nfl/reports/matchup-totals-historical-replay-evaluation.json";
export const TOTALS_REPLAY_PREREG = "data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json";
export const GAMES_HISTORY = "data/internal/research/nfl/replay/games-history-v1.json";
export const EFFICIENCY_HISTORY = "data/internal/research/nfl/replay/team-game-efficiency-v1.json";
export const CURRENT_SEASON = "data/internal/research/nfl/replay/current-season.json";

/** The calendar date a kickoff belongs to in US Eastern time — the replay folds by game DAY, and an
 *  8:20pm ET kickoff is already tomorrow in UTC. */
export function etDateOf(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.parse(iso)));
}

/**
 * ESPN (the schedule) and nflverse (the ratings) spell two franchises differently: WSH/WAS and LAR/LA.
 * An unmapped code finds no rating and silently takes the league average — the P170-B join failure —
 * so every schedule abbreviation passes through here, and the caller also refuses any team the fold
 * has never rated (`hasTeam`).
 */
const ESPN_TO_NFLVERSE = Object.freeze({ WSH: "WAS", LAR: "LA" });
export const toNflverseAbbr = (abbr) => ESPN_TO_NFLVERSE[abbr] ?? abbr;

/**
 * The gate. READY only on the replay receipt's own ELIGIBLE verdict with every parameter present.
 * @returns {{state: "READY", fit: {cS: number, cE: number, cPlays: number, sigma: number}, frozen: object, receiptStamp: string} | {state: "REFUSED", reason: string}}
 */
export function totalsV3Gate(receipt, prereg) {
  if (receipt?.artifact !== "matchup-totals-historical-replay-evaluation") {
    return { state: "REFUSED", reason: "no historical replay evaluation on file" };
  }
  if (receipt.verdicts?.v3PlayEfficiency !== "ELIGIBLE") {
    return { state: "REFUSED", reason: `v3 play-efficiency verdict is ${receipt.verdicts?.v3PlayEfficiency ?? "ABSENT"}` };
  }
  const f = receipt.devFits?.v3PlayEfficiency ?? {};
  const frozen = prereg?.frozen;
  if (![f.cS, f.cE, f.cPlays, f.sigma].every(Number.isFinite)) return { state: "REFUSED", reason: "the replay receipt is missing fitted v3 parameters" };
  if (!Number.isFinite(frozen?.halfLifeGames) || !Number.isFinite(frozen?.seedLeagueMean) || !frozen?.franchiseMap) {
    return { state: "REFUSED", reason: "the replay preregistration's frozen block is incomplete" };
  }
  return {
    state: "READY",
    fit: { cS: f.cS, cE: f.cE, cPlays: f.cPlays, sigma: f.sigma },
    frozen,
    receiptStamp: `${receipt.artifact}@${receipt.generatedAt}`,
  };
}

/** Rows of the committed games table ({columns, games: [[...]]}) as objects. */
export function gamesFromTable(table) {
  const cols = table?.columns ?? [];
  return (table?.games ?? []).map((g) => Object.fromEntries(cols.map((c, i) => [c, g[i]])));
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Fold finals walk-forward, one calendar date at a time, and return the state for a game on `beforeDate`.
 *
 * @param {object} a
 * @param {Array<{gameId: string, date: string, home: string, away: string, total: number}>} a.games finals, franchise-mapped
 * @param {Array<{gameId: string, team: string, oPlays: number, oEpa: number, dPlays: number, dEpa: number}>} a.efficiencyRows
 * @param {{halfLifeGames: number, seedLeagueMean: number, franchiseMap: Record<string, string>}} a.frozen
 * @param {{cS: number, cE: number, cPlays: number, sigma: number}} a.fit
 * @param {string|null} [a.beforeDate] YYYY-MM-DD; only dates strictly earlier fold in (null folds everything)
 * @param {(day: object[], predict: (home: string, away: string) => number) => void} [a.onDay] called before each date folds
 */
export function foldTotalsV3({ games, efficiencyRows, frozen, fit, beforeDate = null, onDay = null }) {
  const alpha = 1 - Math.exp(Math.log(0.5) / frozen.halfLifeGames);
  const franchise = (t) => frozen.franchiseMap[t] ?? t;
  const effBy = new Map((efficiencyRows ?? []).map((r) => [`${r.gameId}|${r.team}`, r]));
  const ordered = [...games].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));

  const R = new Map();
  const EFF = new Map();
  let allSum = 0;
  let allN = 0;
  let lastDateFolded = null;

  const snapshot = () => {
    const effNow = [...EFF.values()];
    const seed = allN ? allSum / allN : frozen.seedLeagueMean;
    return {
      seed,
      L: R.size ? mean([...R.values()]) : seed,
      effCount: effNow.length,
      LoE: effNow.length ? mean(effNow.map((v) => v.oE)) : 0,
      LdE: effNow.length ? mean(effNow.map((v) => v.dE)) : 0,
      Lpl: effNow.length ? mean(effNow.map((v) => v.pl)) : 0,
    };
  };
  const predictWith = (snap) => (homeRaw, awayRaw) => {
    const home = franchise(homeRaw);
    const away = franchise(awayRaw);
    const s = ((R.get(home) ?? snap.seed) + (R.get(away) ?? snap.seed)) / 2;
    const eh = EFF.get(home);
    const ea = EFF.get(away);
    const dev = (v, key, league) => (v ? v[key] - league : 0);
    const E = dev(eh, "oE", snap.LoE) + dev(ea, "dE", snap.LdE) + dev(ea, "oE", snap.LoE) + dev(eh, "dE", snap.LdE);
    const P = dev(eh, "pl", snap.Lpl) + dev(ea, "pl", snap.Lpl);
    return snap.L + fit.cS * (s - snap.L) + fit.cE * E + fit.cPlays * P;
  };

  for (let i = 0; i < ordered.length;) {
    let j = i;
    while (j < ordered.length && ordered[j].date === ordered[i].date) j += 1;
    const day = ordered.slice(i, j);
    if (beforeDate && day[0].date >= beforeDate) break;

    const snap = snapshot();
    if (onDay) onDay(day, predictWith(snap));

    for (const g of day) {
      for (const t of [franchise(g.home), franchise(g.away)]) {
        const r = R.get(t) ?? snap.seed;
        R.set(t, r + alpha * (g.total - r));
      }
      allSum += g.total;
      allN += 1;
    }
    for (const g of day) {
      for (const t of [franchise(g.home), franchise(g.away)]) {
        const row = effBy.get(`${g.gameId}|${t}`);
        if (!row || !row.oPlays || !row.dPlays) continue;
        const obs = { oE: row.oEpa / row.oPlays, dE: row.dEpa / row.dPlays, pl: row.oPlays };
        const prev = EFF.get(t) ?? (snap.effCount ? { oE: snap.LoE, dE: snap.LdE, pl: snap.Lpl } : obs);
        EFF.set(t, { oE: prev.oE + alpha * (obs.oE - prev.oE), dE: prev.dE + alpha * (obs.dE - prev.dE), pl: prev.pl + alpha * (obs.pl - prev.pl) });
      }
    }
    lastDateFolded = day[0].date;
    i = j;
  }

  const finalSnap = snapshot();
  return {
    state: "READY",
    head: NFL_TOTALS_V3_HEAD_ID,
    gamesFolded: allN,
    lastDateFolded,
    leagueLevel: finalSnap.L,
    /** A team with no points AND no efficiency rating would silently take league means — callers refuse it. */
    hasTeam: (t) => R.has(franchise(t)) && EFF.has(franchise(t)),
    muFor: predictWith(finalSnap),
    sigma: fit.sigma,
  };
}

/**
 * Is the fold's evidence complete for a game on `beforeDate`? Every official final of the target season
 * before that date must be in the nflverse games (else the ratings miss a result) and must carry play
 * efficiency for both teams (else the efficiency ratings miss a game). Incomplete evidence is never
 * published as this head; the caller falls back to the incumbent and says why.
 *
 * @param {object} a
 * @param {Array<{gameId: string, espnId: string|null, season: number, date: string}>} a.games
 * @param {Array<{gameId: string, team: string}>} a.efficiencyRows
 * @param {Array<{providerEventId: string, dateUtc: string}>} a.officialFinals the season's official finals (any date)
 * @param {string} a.beforeDate
 */
export function totalsV3Coverage({ games, efficiencyRows, officialFinals, beforeDate, frozen }) {
  const franchise = (t) => frozen.franchiseMap[t] ?? t;
  const byEspn = new Map(games.filter((g) => g.espnId).map((g) => [String(g.espnId), g]));
  const effKeys = new Set((efficiencyRows ?? []).map((r) => `${r.gameId}|${r.team}`));
  const due = (officialFinals ?? []).filter((f) => etDateOf(f.dateUtc) < beforeDate);
  const missingGames = due.filter((f) => !byEspn.has(String(f.providerEventId))).map((f) => String(f.providerEventId));
  const missingEfficiency = due
    .map((f) => byEspn.get(String(f.providerEventId)))
    .filter((g) => g && !(effKeys.has(`${g.gameId}|${franchise(g.home)}`) && effKeys.has(`${g.gameId}|${franchise(g.away)}`)))
    .map((g) => g.gameId);
  return { officialFinalsDue: due.length, missingGames, missingEfficiency, complete: missingGames.length === 0 && missingEfficiency.length === 0 };
}
