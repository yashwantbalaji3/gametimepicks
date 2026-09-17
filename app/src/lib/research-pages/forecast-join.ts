/**
 * CURRENT FORECAST COMPOSITION (v1.3 · R1308) — SERVER / BUILD TIME ONLY.
 *
 * Research projections hold facts only. A page that also shows a current GameTime forecast joins it HERE, from the
 * forecast owner's existing public artifact, by EXACT canonical id — never by name, never regenerated, never
 * reinterpreted. When no exact join exists the page shows no forecast section at all (no empty shell).
 *
 *   NFL player   the PUBLISHED-families player rows My GameTime already reads (buildMyPlayerRows: families with
 *                state PUBLISHED only — ESTIMATE / WITHHELD / research families never reach this function)
 *   UFC fighter  the current card's bout, only when the card's winner head verdict is PASS and the bout carries a
 *                winner read; athlete ids compared as `ufc-athlete-<ESPN id>`
 *   MLB / EPL    no per-player published forecast owner exists → none
 */
import { buildMyPlayerRows, type MyPlayerRow } from "@/lib/my/read-model";
import { loadUfcCard } from "@/lib/sports/ufc/bout";

let nflRows: MyPlayerRow[] | null = null;

/** Published NFL player ranges for one canonical athlete id. Markets with no published range are dropped. */
export function nflPlayerForecasts(playerId: string): MyPlayerRow[] {
  nflRows ??= buildMyPlayerRows();
  return nflRows.filter((r) => r.playerId === playerId && r.markets.length > 0);
}

export interface UfcFighterForecast {
  boutId: string;
  href: string;
  matchup: string;
  startUtc: string | null;
  eventName: string | null;
  winnerChance: number;
  cardGeneratedAt: string | null;
}

/** The current card's published winner read for one fighter, or null. */
export function ufcFighterForecast(fighterId: string): UfcFighterForecast | null {
  const m = /^ufc-athlete-(\d+)$/.exec(fighterId);
  if (!m) return null;
  const card = loadUfcCard() as any;
  if (card?.model?.verdicts?.winner !== "PASS") return null;
  for (const b of card?.bouts ?? []) {
    const side = String(b?.red?.athleteId) === m[1] ? b.red : String(b?.blue?.athleteId) === m[1] ? b.blue : null;
    if (!side) continue;
    // byFighter is the artifact's own per-bout table, keyed by the names inside THIS bout object.
    const chance = b?.prediction?.winner?.byFighter?.[side.name];
    if (typeof chance !== "number") return null;
    return {
      boutId: String(b.boutId),
      href: `/ufc/bout/${b.boutId}/`,
      matchup: `${b.red.name} vs ${b.blue.name}`,
      startUtc: b.startUtc ?? null,
      eventName: card?.event?.name ?? null,
      winnerChance: chance,
      cardGeneratedAt: card?.generatedAt ?? null,
    };
  }
  return null;
}
