/**
 * SETTLED MLB GAME PAGES — the rule (pure; no fs). Independent audit 2026-10-28 F02: a shared MLB game link
 * (`/games/mlb/<slug>/`) died the morning after its game, while the same link for NBA keeps a settled page.
 *
 * The settled page shows only what the RECORD holds, from the one public file /results/mlb grades from
 * (public/data/mlb/results/game-predictions-graded.jsonl):
 *   - the forecast of record per graded market — pick, line, the model's probability, when it was frozen and from
 *     which snapshot — exactly as recorded, never re-read from the day file (predictions/<date>.json is rewritten by
 *     lineup refreshes after first pitch, so it is NOT the forecast of record for a finished game);
 *   - the official final the grade used and each market's outcome.
 * A game the record does not hold gets no page (the 404 tombstone still answers). Nothing is recomputed or invented.
 */
import { assignPublicGameSlugs } from "./public-game-slug";

/** One graded row (schema 1), the fields this page reads. */
export type GradedRow = {
  gamePk: number | string;
  date: string;
  matchup: string;
  firstPitchUtc: string;
  forecastGeneratedAt: string;
  forecastSource?: string | null;
  actual: { homeRuns: number; awayRuns: number; winner?: string | null } | null;
  market: string;
  pick: string | null;
  line?: number | null;
  modelProbability: number | null;
  outcome: string | null;
  gradedAt?: string | null;
};

export type SettledCall = { market: string; pick: string; line: number | null; modelProbability: number | null; outcome: string };

export type SettledMlbGame = {
  slug: string;
  date: string;
  gamePk: string;
  away: string;
  home: string;
  firstPitchUtc: string;
  final: { away: number; home: number } | null;
  /** When the forecast of record was frozen; always before first pitch for a row that reaches a page. */
  frozenAt: string;
  source: string | null;
  gradedAt: string | null;
  calls: SettledCall[];
};

/** Graded market → reader words (same words the 404 tombstone uses). */
export const SETTLED_MARKET_WORDS: Readonly<Record<string, string>> = Object.freeze({ moneyline: "Winner", total: "Total runs", run_line: "Run line", run_line_posted: "Run line" });
export const SETTLED_OUTCOME_WORDS: Readonly<Record<string, string>> = Object.freeze({ WIN: "Right", LOSS: "Wrong", PUSH: "Push", VOID: "Void" });
const MARKET_ORDER = ["moneyline", "run_line_posted", "run_line", "total"];

const MATCHUP = /^([A-Z]{2,3}) @ ([A-Z]{2,3})$/;

/**
 * Settled games from graded rows: dates in [sinceDate, today) only, one entry per gamePk, slugs assigned per date by the
 * SAME rule the live game page uses (a doubleheader's twins get their gamePk suffix). A game whose rows disagree on
 * the final or the freeze time, or whose forecast was not frozen before first pitch, is left out rather than guessed.
 */
export function mlbSettledGames(rows: readonly GradedRow[], { sinceDate, today }: { sinceDate: string; today: string }): SettledMlbGame[] {
  const byPk = new Map<string, GradedRow[]>();
  for (const r of rows ?? []) {
    if (!r || typeof r.date !== "string" || r.date < sinceDate || r.date >= today) continue;
    if (!MATCHUP.test(String(r.matchup ?? "")) || r.gamePk == null || r.gamePk === "") continue;
    const pk = String(r.gamePk);
    const list = byPk.get(pk) ?? [];
    list.push(r);
    byPk.set(pk, list);
  }
  const games: Omit<SettledMlbGame, "slug">[] = [];
  for (const [pk, list] of byPk) {
    const first = list[0];
    const consistent = list.every(
      (r) => r.date === first.date && r.matchup === first.matchup && r.firstPitchUtc === first.firstPitchUtc && r.forecastGeneratedAt === first.forecastGeneratedAt &&
        r.actual?.awayRuns === first.actual?.awayRuns && r.actual?.homeRuns === first.actual?.homeRuns,
    );
    const frozen = Date.parse(first.forecastGeneratedAt), start = Date.parse(first.firstPitchUtc);
    if (!consistent || !Number.isFinite(frozen) || !Number.isFinite(start) || frozen >= start) continue;
    const [, away, home] = MATCHUP.exec(first.matchup)!;
    const final = first.actual && Number.isFinite(first.actual.awayRuns) && Number.isFinite(first.actual.homeRuns) ? { away: first.actual.awayRuns, home: first.actual.homeRuns } : null;
    const calls = list
      .filter((r) => SETTLED_MARKET_WORDS[r.market] && r.pick && r.outcome)
      .map((r) => ({ market: r.market, pick: String(r.pick), line: typeof r.line === "number" ? r.line : null, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : null, outcome: String(r.outcome) }))
      .sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market));
    games.push({
      date: first.date, gamePk: pk, away, home, firstPitchUtc: first.firstPitchUtc, final,
      frozenAt: first.forecastGeneratedAt, source: first.forecastSource ?? null, gradedAt: first.gradedAt ?? null, calls,
    });
  }
  games.sort((a, b) => (a.date === b.date ? a.firstPitchUtc.localeCompare(b.firstPitchUtc) || a.gamePk.localeCompare(b.gamePk) : a.date.localeCompare(b.date)));
  const out: SettledMlbGame[] = [];
  for (const date of [...new Set(games.map((g) => g.date))]) {
    const day = games.filter((g) => g.date === date);
    const { slugs, collidingWithoutKey } = assignPublicGameSlugs(day.map((g) => ({ away: g.away, home: g.home, date, key: g.gamePk })));
    day.forEach((g, i) => { if (!collidingWithoutKey.includes(i)) out.push({ ...g, slug: slugs[i] }); });
  }
  return out;
}

/** "Right" / "Wrong" / … for an outcome code; the code itself when unknown (never a guessed word). */
export const outcomeWord = (o: string) => SETTLED_OUTCOME_WORDS[o] ?? o;
