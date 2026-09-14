/**
 * NFL WIN + MARGIN HEADS v2 (P298) — adopted from the P297 historical replay.
 *
 *   win     nfl-win-elo-mov-v1       Elo whose updates are weighted by margin of victory
 *                                    (K · ln(|MOV|+1) · 2.2 / (winnerEdge·0.001 + 2.2)), home advantage
 *                                    fit on dev, 0 at neutral sites. p(home) = 1/(1+10^(−d/400)).
 *   margin  nfl-margin-elo-hfa-v1    the incumbent's Elo updates (K, no multiplier) with home advantage
 *                                    fit on dev, 0 at neutral sites; margin ~ Normal(slope·d, sigma).
 *
 * Held-out 2006–2021 (4,292 games): win log loss 0.6291 vs the published head's 0.6420 (better in every
 * era, calibration 0.018 vs 0.035) — still behind the no-vig market's 0.6101; margin MAE 10.79 vs 10.87
 * with 80% coverage inside the 0.75–0.85 band in every era. Each head is gated on its OWN verdict.
 *
 * This file is the replay's recurrence (scripts/research/nfl/replay-win-margin.mjs) written once for
 * production; win-margin-heads.test.mjs proves it reproduces the receipt season by season.
 */

import { etDateOf, toNflverseAbbr } from "./totals-play-efficiency.mjs";

export const NFL_WIN_HEAD_ID = "nfl-win-elo-mov-v1";
export const NFL_MARGIN_HEAD_ID = "nfl-margin-elo-hfa-v1";
export const WIN_MARGIN_RECEIPT = "data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json";
export const WIN_MARGIN_PREREG = "data/internal/research/nfl/reports/win-margin-historical-replay-preregistration.json";
export const GAMES_HISTORY_V2 = "data/internal/research/nfl/replay/games-history-v2.json";

/**
 * Per-head gate: READY only on the receipt's own ELIGIBLE verdict for that head, with its parameters present.
 * @returns {{ win: {state: string, reason?: string, K?: number, homeAdvantage?: number, receiptStamp?: string},
 *             margin: {state: string, reason?: string, K?: number, homeAdvantage?: number, slope?: number, sigma?: number, receiptStamp?: string},
 *             frozen: object|null }}
 */
export function winMarginGate(receipt, prereg) {
  const refused = (reason) => ({ state: "REFUSED", reason });
  const frozen = prereg?.frozen ?? null;
  if (receipt?.artifact !== "win-margin-historical-replay-evaluation" || !frozen?.incumbent || !frozen?.franchiseMap) {
    const r = refused("no win/margin historical replay evaluation on file");
    return { win: r, margin: r, frozen: null };
  }
  const stamp = `${receipt.artifact}@${receipt.generatedAt}`;
  const mov = receipt.devFits?.eloMov ?? {};
  const hfa = receipt.devFits?.eloHfaRefit ?? {};
  const win = receipt.verdicts?.eloMov?.win !== "ELIGIBLE"
    ? refused(`eloMov win verdict is ${receipt.verdicts?.eloMov?.win ?? "ABSENT"}`)
    : ![mov.K, mov.homeAdvantage].every(Number.isFinite) ? refused("eloMov parameters missing")
      : { state: "READY", K: mov.K, homeAdvantage: mov.homeAdvantage, receiptStamp: stamp };
  const margin = receipt.verdicts?.eloHfaRefit?.margin !== "ELIGIBLE"
    ? refused(`eloHfaRefit margin verdict is ${receipt.verdicts?.eloHfaRefit?.margin ?? "ABSENT"}`)
    : ![hfa.K, hfa.homeAdvantage, hfa.marginSlope, hfa.sigmaMargin].every(Number.isFinite) ? refused("eloHfaRefit parameters missing")
      : { state: "READY", K: hfa.K, homeAdvantage: hfa.homeAdvantage, slope: hfa.marginSlope, sigma: hfa.sigmaMargin, receiptStamp: stamp };
  return { win, margin, frozen };
}

/** Rows of a committed games table ({columns, games: [[...]]}) as objects. */
export function rowsFromTable(table) {
  const cols = table?.columns ?? [];
  return (table?.games ?? []).map((g) => Object.fromEntries(cols.map((c, i) => [c, g[i]])));
}

/**
 * One Elo trajectory, exactly the replay's: dates in order, a date predicted from strictly earlier dates,
 * one-third regression before the first date of a new season, ties update nothing.
 */
function eloTrajectory({ games, frozen, K, homeAdvantage, mov, beforeDate, onDay }) {
  const MEAN = frozen.incumbent.mean;
  const REG = frozen.incumbent.seasonRegression;
  const franchise = (t) => frozen.franchiseMap[t] ?? t;
  const elo = new Map();
  const get = (t) => elo.get(t) ?? MEAN;
  let lastSeason = null;
  let folded = 0;
  let lastDate = null;
  for (let i = 0; i < games.length;) {
    let j = i;
    while (j < games.length && games[j].date === games[i].date) j += 1;
    if (beforeDate && games[i].date >= beforeDate) break;
    const season = games[i].season;
    if (lastSeason !== null && season !== lastSeason) for (const [t, r] of elo) elo.set(t, r + (MEAN - r) * REG);
    lastSeason = season;
    const day = [];
    for (let k = i; k < j; k += 1) {
      const g = games[k];
      const home = franchise(g.home);
      const away = franchise(g.away);
      const d = get(home) + (g.neutral ? 0 : homeAdvantage) - get(away);
      day.push({ g, home, away, d, p: 1 / (1 + 10 ** (-d / 400)) });
    }
    if (onDay) onDay(day);
    for (const { g, home, away, d, p } of day) {
      if (g.homeScore === g.awayScore) continue;
      const s = g.homeScore > g.awayScore ? 1 : 0;
      const step = mov ? K * Math.log(Math.abs(g.homeScore - g.awayScore) + 1) * (2.2 / ((s ? d : -d) * 0.001 + 2.2)) : K;
      elo.set(home, get(home) + step * (s - p));
      elo.set(away, get(away) + step * ((1 - s) - (1 - p)));
      folded += 1;
    }
    lastDate = games[i].date;
    i = j;
  }
  return { elo, lastSeason, folded, lastDate };
}

const byDateThenId = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0);

/**
 * State of both heads for a game on `beforeDate` (only strictly earlier dates fold).
 * `targetSeason` applies the one-third regression the replay would have applied before that season's first
 * date — a Week-1 game has no new-season final to fire it inside the fold.
 */
export function foldWinMarginHeads({ games, gate, beforeDate = null, targetSeason = null }) {
  const ordered = [...games].sort(byDateThenId);
  const { frozen } = gate;
  const franchise = (t) => frozen.franchiseMap[t] ?? t;
  const regressIfNewSeason = (traj) => {
    if (targetSeason != null && traj.lastSeason !== null && targetSeason > traj.lastSeason) {
      const MEAN = frozen.incumbent.mean;
      for (const [t, r] of traj.elo) traj.elo.set(t, r + (MEAN - r) * frozen.incumbent.seasonRegression);
    }
    return traj;
  };
  const out = { lastDateFolded: null };
  if (gate.win.state === "READY") {
    const t = regressIfNewSeason(eloTrajectory({ games: ordered, frozen, K: gate.win.K, homeAdvantage: gate.win.homeAdvantage, mov: true, beforeDate }));
    out.win = {
      head: NFL_WIN_HEAD_ID,
      gamesFolded: t.folded,
      hasTeam: (x) => t.elo.has(franchise(x)),
      pHome: (home, away, neutral) => {
        const d = (t.elo.get(franchise(home)) ?? frozen.incumbent.mean) + (neutral ? 0 : gate.win.homeAdvantage) - (t.elo.get(franchise(away)) ?? frozen.incumbent.mean);
        return 1 / (1 + 10 ** (-d / 400));
      },
    };
    out.lastDateFolded = t.lastDate;
  }
  if (gate.margin.state === "READY") {
    const t = regressIfNewSeason(eloTrajectory({ games: ordered, frozen, K: gate.margin.K, homeAdvantage: gate.margin.homeAdvantage, mov: false, beforeDate }));
    out.margin = {
      head: NFL_MARGIN_HEAD_ID,
      gamesFolded: t.folded,
      hasTeam: (x) => t.elo.has(franchise(x)),
      mean: (home, away, neutral) => gate.margin.slope * ((t.elo.get(franchise(home)) ?? frozen.incumbent.mean) + (neutral ? 0 : gate.margin.homeAdvantage) - (t.elo.get(franchise(away)) ?? frozen.incumbent.mean)),
      sigma: gate.margin.sigma,
    };
    out.lastDateFolded = out.lastDateFolded ?? t.lastDate;
  }
  return out;
}

/**
 * Is the fold's evidence complete for a game on `beforeDate`? Every official final of the target season
 * before that date must be among the folded games (by ESPN id); otherwise a rating misses a result and the
 * caller falls back, saying why.
 */
export function winMarginCoverage({ games, officialFinals, beforeDate }) {
  const folded = new Set(games.filter((g) => g.espnId).map((g) => String(g.espnId)));
  const due = (officialFinals ?? []).filter((f) => etDateOf(f.dateUtc) < beforeDate);
  const missingGames = due.filter((f) => !folded.has(String(f.providerEventId))).map((f) => String(f.providerEventId));
  return { officialFinalsDue: due.length, missingGames, complete: missingGames.length === 0 };
}

/**
 * ONE COHERENT PAIR PER PUBLISHED FORECAST.
 *
 * The two adopted heads run on different ratings (the win head weights margin of victory; the margin head
 * does not), so on close games they can favour different sides. On dev 2022–2025 that happened in 106 of
 * 1,139 games, 16 of them with a margin of 2+ points — the line the P245 coherence guard refuses at. A page
 * whose "likely winner" and projected score name different teams is a contradiction, so when the heads
 * disagree the forecast uses the incumbent single-rating pair (whose win and margin share one rating and
 * cannot disagree) and names the reason. Neither head is ever paired with a head its receipt rejected.
 *
 * @returns {{state: "READY", pHome: number, marginMean: number, sigmaMargin: number} | {state: "FALLBACK", reason: string}}
 */
export function adoptedHeadsFor({ fold, home, away, neutral }) {
  if (!fold?.win || !fold?.margin) return { state: "FALLBACK", reason: "an adopted head is not ready on its receipt" };
  const h = toNflverseAbbr(home);
  const a = toNflverseAbbr(away);
  const unrated = [h, a].filter((t) => !fold.win.hasTeam(t) || !fold.margin.hasTeam(t));
  if (unrated.length) return { state: "FALLBACK", reason: `no rating history for ${unrated.join(" and ")}` };
  const pHome = fold.win.pHome(h, a, neutral);
  const marginMean = fold.margin.mean(h, a, neutral);
  if (marginMean !== 0 && (pHome > 0.5) !== (marginMean > 0)) {
    return { state: "FALLBACK", reason: "the adopted win and margin heads favour different sides in this game, so the earlier single-rating pair is published to keep the win chance and the projected score consistent" };
  }
  return { state: "READY", pHome, marginMean, sigmaMargin: fold.margin.sigma };
}

/** Walk every date and hand each game's pre-game numbers to `onGame` — the parity proof's entry point. */
export function replayWinMarginHeads({ games, gate, onGame }) {
  const ordered = [...games].sort(byDateThenId);
  const { frozen } = gate;
  const winPre = new Map();
  if (gate.win.state === "READY") {
    eloTrajectory({ games: ordered, frozen, K: gate.win.K, homeAdvantage: gate.win.homeAdvantage, mov: true, onDay: (day) => { for (const x of day) winPre.set(x.g, x.p); } });
  }
  const marginPre = new Map();
  if (gate.margin.state === "READY") {
    eloTrajectory({ games: ordered, frozen, K: gate.margin.K, homeAdvantage: gate.margin.homeAdvantage, mov: false, onDay: (day) => { for (const x of day) marginPre.set(x.g, gate.margin.slope * x.d); } });
  }
  for (const g of ordered) onGame(g, { pHome: winPre.get(g) ?? null, marginMean: marginPre.get(g) ?? null });
}
