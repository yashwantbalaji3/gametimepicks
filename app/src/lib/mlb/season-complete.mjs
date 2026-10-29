/**
 * MLB SEASON COMPLETE — the off-season state every MLB surface shows once the games are over.
 *
 * WHY. On 2026-10-29, the day after the last World Series game, /mlb still read "2026 season · Upcoming", a "Live today"
 * pill beside "No MLB games today", a date picker promising "projections arriving soon", Homer Nukes promising a board
 * "the morning of the next game day", /live advertising MLB tracking and Ask suggesting "Which MLB games are live right
 * now?". The products job already KNEW the season was over (lib/mlb/season-state.mjs → public/data/mlb/season-state.json,
 * OFF_SEASON with no game left); the pages never asked it.
 *
 * WHAT IS DERIVED, AND FROM WHERE (nothing here is typed in by hand):
 *   complete     the committed season-state doc says OFF_SEASON with remaining 0 AFTER the regular season ended — i.e.
 *                StatsAPI lists no game left to play. A pre-season OFF_SEASON (remaining null) is NOT "complete".
 *                UNKNOWN or a missing doc is never read as complete (fail closed: the in-season pages are unchanged).
 *   the series   the LAST postseason series: the trailing run of postseason games (dates from the doc's own
 *                calendar.postSeasonStartDate up to the doc's date) between the same two teams. By MLB's structure the
 *                final series of the postseason is the World Series (the LCS rounds are within each league, so the
 *                pennant winners can only meet in it). Game population: the committed StatsAPI schedule captures
 *                (public/data/mlb/statsapi-schedule/<date>.json) united with every graded game in the window.
 *   the score    each game's final from the graded record (results/game-predictions-graded.jsonl, StatsAPI linescore —
 *                the same rows the settled game pages read). A game with no final, or with conflicting finals, makes
 *                the champion UNVERIFIED.
 *   the winner   the team that reached SERIES_WINS_TO_CLINCH, on the series' last game, with the other team below it.
 *                Anything else (3–3, a game after the clinch, a missing game) → unverified, and the surfaces show only
 *                "2026 season complete" without a champion line.
 *   returns      a next season date only when a committed source names one (the doc's nextGameDate); otherwise
 *                "returns in <season + 1>".
 *
 * Pure: every document is an argument. The loader is season-complete-data.ts (server / build only).
 */

/** The World Series is a best-of-seven: the first team to four wins takes it. A structural rule, used only as a CHECK
 *  that the committed games form a finished series — the displayed numbers are counted from the finals, never from this. */
export const SERIES_WINS_TO_CLINCH = 4;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === "string" && DATE_RE.test(s);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** "TB @ MIL" → { away: "TB", home: "MIL" }. */
function parseMatchup(m) {
  const parts = String(m ?? "").split(" @ ");
  return parts.length === 2 && parts[0].trim() && parts[1].trim() ? { away: parts[0].trim(), home: parts[1].trim() } : null;
}

/** Is the committed season-state doc an "it is over" verdict (not pre-season, not unknown)? */
export function isMlbSeasonComplete(seasonState) {
  const s = seasonState;
  return !!s && s.state === "OFF_SEASON" && s.remaining === 0 && isDate(s.date)
    && isDate(s.calendar?.regularSeasonEndDate) && s.date > s.calendar.regularSeasonEndDate;
}

/**
 * @param {{ seasonState: any, scheduleDays?: Array<{ date: string, games?: any[] }>, gradedRows?: any[], record?: any }} input
 * @returns {null | {
 *   season: string, asOf: string, returnsLabel: string, returnsWhen: string, nextSeasonStart: string|null,
 *   champion: { abbr: string, name: string } | null, runnerUp: { abbr: string, name: string } | null,
 *   wins: number|null, losses: number|null, finalDate: string|null,
 *   games: Array<{ gamePk: number, date: string, away: string, home: string, awayRuns: number, homeRuns: number, winner: string }>,
 *   unverifiedReason: string|null,
 *   record: null | { wins: number, losses: number, decisive: number, hitRate: number, slates: number, firstDate: string|null, lastDate: string|null },
 * }}
 */
export function deriveMlbSeasonComplete({ seasonState, scheduleDays = [], gradedRows = [], record = null }) {
  if (!isMlbSeasonComplete(seasonState)) return null;
  const season = String(seasonState.season ?? seasonState.calendar.regularSeasonEndDate.slice(0, 4));
  const asOf = seasonState.date;
  const nextSeasonStart = isDate(seasonState.nextGameDate) ? seasonState.nextGameDate : null;
  const nextYear = /^\d{4}$/.test(season) ? String(Number(season) + 1) : null;
  const returnsWhen = nextSeasonStart ? `on ${nextSeasonStart}` : nextYear ? `in ${nextYear}` : "next season";
  const returnsLabel = `MLB returns ${returnsWhen}.`;

  const base = { season, asOf, returnsLabel, returnsWhen, nextSeasonStart, champion: null, runnerUp: null, wins: null, losses: null, finalDate: null, games: [], unverifiedReason: null, record: seasonRecord(record) };
  const unverified = (reason) => ({ ...base, unverifiedReason: reason });

  const from = seasonState.calendar.postSeasonStartDate;
  if (!isDate(from)) return unverified("the season-state calendar names no postseason start date");
  const inWindow = (d) => isDate(d) && d >= from && d <= asOf;

  /* The population: every scheduled postseason game, plus every graded one (a capture can miss a late-added game). */
  const games = new Map(); // gamePk → { gamePk, date, awayName?, homeName?, awayId?, homeId? }
  for (const day of scheduleDays) {
    if (!inWindow(day?.date)) continue;
    for (const g of Array.isArray(day.games) ? day.games : []) {
      const pk = num(g?.gamePk);
      if (pk == null) continue;
      games.set(pk, { gamePk: pk, date: day.date, gameDate: String(g.gameDate ?? ""), awayName: g.away?.name ?? null, homeName: g.home?.name ?? null });
    }
  }
  const finals = new Map(); // gamePk → { away, home, awayRuns, homeRuns, date } | "CONFLICT"
  for (const r of gradedRows) {
    const pk = num(r?.gamePk);
    if (pk == null || !inWindow(r.date)) continue;
    const m = parseMatchup(r.matchup);
    const a = r.actual ?? {};
    const awayRuns = num(a.awayRuns), homeRuns = num(a.homeRuns);
    if (!m || awayRuns == null || homeRuns == null) continue;
    const f = { away: m.away, home: m.home, awayRuns, homeRuns, date: r.date };
    const prev = finals.get(pk);
    if (prev === "CONFLICT") continue;
    if (prev && (prev.away !== f.away || prev.home !== f.home || prev.awayRuns !== f.awayRuns || prev.homeRuns !== f.homeRuns)) { finals.set(pk, "CONFLICT"); continue; }
    finals.set(pk, f);
    if (!games.has(pk)) games.set(pk, { gamePk: pk, date: r.date, gameDate: String(r.firstPitchUtc ?? ""), awayName: null, homeName: null });
  }
  if (games.size === 0) return unverified("no postseason game is in the committed schedule or graded record");

  /* Team identity: abbreviations from the graded matchup; full names from the schedule capture of the same gamePk. */
  const nameByAbbr = new Map();
  for (const [pk, g] of games) {
    const f = finals.get(pk);
    if (!f || f === "CONFLICT") continue;
    if (g.awayName) nameByAbbr.set(f.away, g.awayName);
    if (g.homeName) nameByAbbr.set(f.home, g.homeName);
  }
  const ordered = [...games.values()].sort((x, y) => x.date.localeCompare(y.date) || x.gameDate.localeCompare(y.gameDate) || x.gamePk - y.gamePk);
  const pairOf = (g) => {
    const f = finals.get(g.gamePk);
    if (f && f !== "CONFLICT") return [f.away, f.home].sort().join("|");
    return null;
  };

  const last = ordered[ordered.length - 1];
  const lastFinal = finals.get(last.gamePk);
  if (!lastFinal) return unverified(`the last postseason game (${last.date}, gamePk ${last.gamePk}) has no graded final`);
  if (lastFinal === "CONFLICT") return unverified(`the graded record holds conflicting finals for gamePk ${last.gamePk}`);
  const pair = pairOf(last);

  /* The trailing run of games between the same two teams. A game in it with no final breaks verification. */
  const series = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const g = ordered[i];
    const f = finals.get(g.gamePk);
    if (f === "CONFLICT") return unverified(`the graded record holds conflicting finals for gamePk ${g.gamePk}`);
    if (!f) {
      /* A schedule-only game: part of the series only if its named teams are the same pair. */
      const names = [g.awayName, g.homeName];
      const pairNames = pair.split("|").map((a) => nameByAbbr.get(a));
      if (names.every((n) => n && pairNames.includes(n))) return unverified(`a ${g.date} game in the final series (gamePk ${g.gamePk}) has no graded final`);
      break;
    }
    if (pairOf(g) !== pair) break;
    series.unshift({ gamePk: g.gamePk, date: f.date, away: f.away, home: f.home, awayRuns: f.awayRuns, homeRuns: f.homeRuns });
  }
  for (const g of series) {
    if (g.awayRuns === g.homeRuns) return unverified(`the graded final for gamePk ${g.gamePk} is a tie`);
    g.winner = g.awayRuns > g.homeRuns ? g.away : g.home;
  }

  const wins = new Map();
  let clinchedAt = -1;
  series.forEach((g, i) => {
    wins.set(g.winner, (wins.get(g.winner) ?? 0) + 1);
    if (clinchedAt < 0 && wins.get(g.winner) === SERIES_WINS_TO_CLINCH) clinchedAt = i;
  });
  const [teamA, teamB] = pair.split("|");
  const wA = wins.get(teamA) ?? 0, wB = wins.get(teamB) ?? 0;
  if (clinchedAt < 0) return { ...unverified(`the final series reads ${teamA} ${wA}–${wB} ${teamB}: no team reached ${SERIES_WINS_TO_CLINCH} wins in the committed finals`), games: series };
  if (clinchedAt !== series.length - 1) return { ...unverified("a graded game follows the series-clinching game"), games: series };
  const champ = series[clinchedAt].winner;
  const other = champ === teamA ? teamB : teamA;
  return {
    ...base,
    champion: { abbr: champ, name: nameByAbbr.get(champ) ?? champ },
    runnerUp: { abbr: other, name: nameByAbbr.get(other) ?? other },
    wins: wins.get(champ), losses: wins.get(other) ?? 0,
    finalDate: series[series.length - 1].date,
    games: series,
  };
}

/** The headline record /results/mlb leads with (lifetime_summary.json): settled player-prop leans. */
function seasonRecord(r) {
  if (!r || typeof r !== "object") return null;
  const wins = num(r.wins), losses = num(r.losses), decisive = num(r.decisive);
  if (wins == null || losses == null || decisive == null || decisive <= 0) return null;
  return {
    wins, losses, decisive,
    hitRate: wins / decisive,
    slates: num(r.totalDates) ?? 0,
    firstDate: isDate(r.oldestDate) ? r.oldestDate : null,
    lastDate: isDate(r.newestDate) ? r.newestDate : null,
  };
}

const MONTH_DAY = (d) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

/**
 * The reader-facing words, one owner for every surface. `headline` never names a champion the data did not verify.
 * @param {ReturnType<typeof deriveMlbSeasonComplete>} s
 */
export function mlbSeasonCompleteCopy(s) {
  if (!s) return null;
  const headline = s.champion
    ? `${s.season} season complete — ${s.champion.name} won the World Series ${s.wins}–${s.losses}`
    : `${s.season} season complete`;
  const last = s.champion ? s.games[s.games.length - 1] : null;
  const finalLine = last ? `Final game, ${MONTH_DAY(last.date)}: ${last.away} ${last.awayRuns}, ${last.home} ${last.homeRuns}.` : null;
  const rec = s.record;
  const recordLine = rec
    ? `Graded record${rec.firstDate && rec.lastDate ? `, ${MONTH_DAY(rec.firstDate)} – ${MONTH_DAY(rec.lastDate)}` : ""}: player-prop leans went ${rec.wins.toLocaleString("en-US")}–${rec.losses.toLocaleString("en-US")} (${(rec.hitRate * 100).toFixed(1)}% hit rate) over ${rec.slates.toLocaleString("en-US")} slates.`
    : null;
  return {
    headline,
    finalLine,
    recordLine,
    returnsLabel: s.returnsLabel,
    /** One sentence for places that only have room for one ("no games" copy, the /live coverage line). */
    short: `The ${s.season} MLB season is complete — it returns ${s.returnsWhen}.`,
    pill: "Season complete",
  };
}
