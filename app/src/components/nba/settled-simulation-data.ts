/**
 * SETTLED GAME SIMULATION PAGES — the data (SERVER / BUILD TIME ONLY). See expired-simulation.mjs for the rule.
 *
 * Reads committed PUBLIC files only, through the owners every other NBA surface reads:
 *   forecast  the game's frozen Official Forecast from its own date's dated lane file (experimental-lane.tsx loaders —
 *             the same file /nba/projections/<date>/ prints), exactly as frozen;
 *   result    the official record's row for the game (lib/results/nba-level-a-readers.ts nbaForecastVsActualView — the
 *             /results/nba record: side vs. official final, pending and held states included), never recomputed here.
 * No simulation run is read: a settled page shows no simulation.
 */
import { committedLaneDates, loadLaneForDate, type Snapshot } from "@/components/nba/experimental-lane";
import { settledSimulationIds } from "@/components/nba/expired-simulation.mjs";
import { nbaForecastVsActualView } from "@/lib/results/nba-level-a-readers";

export type SettledLaneGame = Snapshot["games"][number];
/** One row of the official record (lib/results/nba-forecast-vs-actual.mjs). */
export type SettledRecord = {
  state: "MATCHED" | "MISSED" | "PENDING" | "HELD" | "NO_SIDE" | "NOT_BEFORE_TIP" | string;
  side: string | null;
  final: { away: number; home: number; winnerSide: "home" | "away" | null } | null;
};
export type SettledView = { id: string; date: string; game: SettledLaneGame; record: SettledRecord | null };

/* Read once per build worker: every settled page (and its metadata) asks, and the lane files are ~100 KB each. Committed
   files do not change during a build, so the memo is the build's own snapshot. */
let lanesMemo: { date: string; games: SettledLaneGame[] }[] | null = null;
const lanes = () => (lanesMemo ??= committedLaneDates().map((date) => ({ date, games: loadLaneForDate(date)?.games ?? [] })));
let recordMemo: Map<string, SettledRecord> | null = null;
const recordOf = (id: string) => {
  // the record holds one row per lane game, keyed by the provider event id
  recordMemo ??= new Map((nbaForecastVsActualView().games as Array<SettledRecord & { providerEventId: string }>).map((g) => [String(g.providerEventId), { state: g.state, side: g.side ?? null, final: g.final ?? null }]));
  return recordMemo.get(id) ?? null;
};

/** The ids that get a settled page at build date `today`, minus the ids a current Game Simulation page builds. */
export function settledSimulationParams(today: string, exclude: readonly string[] = []): string[] {
  return settledSimulationIds(lanes(), { today, exclude });
}

/** The settled page's view for `id`, or null when the id is not a past-slate game in the window (the route then 404s). */
export function loadSettledSimulation(id: string, today: string): SettledView | null {
  const key = String(id);
  if (!settledSimulationParams(today).includes(key)) return null;
  for (const { date, games } of [...lanes()].filter((l) => l.date < today).reverse()) {
    const game = games.find((g) => String(g.providerEventId) === key);
    if (game) return { id: key, date, game, record: recordOf(key) };
  }
  return null;
}
