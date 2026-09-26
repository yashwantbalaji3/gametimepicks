/**
 * design-lab/data — a THIN, READ-ONLY adapter over the real production artifacts, shared by all
 * four design-lab preview versions. It never mutates, regenerates, or settles anything; it just
 * normalizes the existing Bank Builder / UFC settlement / MLB board data into one shape so each
 * version renders real numbers (no fabrication). Every field traces to a committed artifact.
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data");
function read<T>(rel: string, fb: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")) as T; } catch { return fb; }
}

export interface DesignLabFight { a: string; b: string; winner: string; result: string; endRound?: number; time?: string; mlPick?: string; mlProb?: number; mlResult?: string }
export interface DesignLabData {
  bankBuilder: { start: number; final: number; record: string; status: string; growthX: number; steps: { step: number; sport: string; after: number }[] };
  ufc: { event: string; fightCount: number; settled: boolean; moneylineRecord: string; moneylineAccuracy: number; cardsRecord: string; upsetWinner?: string; fights: DesignLabFight[] };
  mlb: { date: string; games: number; leans: number };
  generatedNote: string;
}

export function loadDesignLabData(): DesignLabData {
  const bb = read<{ startingBankrollUnits?: number; currentBankrollUnits?: number; record?: { wins: number; losses: number; pushes: number }; runStatus?: string }>(
    "bank-builder/public-summary-latest.json", {});
  const ledger = read<{ entries?: { step: number; sport: string; result: string; bankrollAfter: number }[] }>("bank-builder/public-ledger-latest.json", {});
  const steps = (ledger.entries ?? []).filter((e) => e.result === "win").sort((a, b) => a.step - b.step)
    .map((e) => ({ step: e.step, sport: e.sport, after: e.bankrollAfter }));
  const start = bb.startingBankrollUnits ?? 100;
  const final = bb.currentBankrollUnits ?? 100;
  const rec = bb.record ?? { wins: 0, losses: 0, pushes: 0 };

  const s = read<{ event?: string; moneyline?: { record?: string; accuracyPct?: number }; suggestedCards?: { record?: string };
    fights?: { fighters: string[]; officialWinner: string; result: string; endRound?: number; time?: string; moneyline?: { modelPick?: string; modelProbability?: number; result?: string } }[] }>(
    "ufc/results-settled-latest.json", {});
  const sched = read<{ eventName?: string; fightCount?: number }>("ufc/schedule-latest.json", {});
  const fights: DesignLabFight[] = (s.fights ?? []).map((f) => ({
    a: f.fighters[0], b: f.fighters[1], winner: f.officialWinner, result: f.result, endRound: f.endRound, time: f.time,
    mlPick: f.moneyline?.modelPick, mlProb: f.moneyline?.modelProbability, mlResult: f.moneyline?.result,
  }));
  const upset = fights.find((f) => f.mlResult === "loss");

  let mlb = { date: "", games: 0, leans: 0 };
  for (const d of ["2026-06-15", "2026-06-14"]) {
    const b = read<{ generatedFor?: string; games?: unknown[]; leans?: { lean?: string }[] }>(`mlb/boards/${d}.json`, {});
    if ((b.games?.length ?? 0) > 0) {
      mlb = { date: d, games: b.games!.length, leans: (b.leans ?? []).filter((l) => l.lean === "Over" || l.lean === "Under").length };
      break;
    }
  }

  return {
    bankBuilder: {
      start, final, record: `${rec.wins}–${rec.losses}${rec.pushes ? `–${rec.pushes}` : ""}`,
      status: bb.runStatus ?? "active", growthX: Math.floor(final / Math.max(1, start)), steps,
    },
    ufc: {
      event: s.event ?? sched.eventName ?? "UFC", fightCount: sched.fightCount ?? fights.length, settled: !!s.fights?.length,
      moneylineRecord: s.moneyline?.record ?? "—", moneylineAccuracy: s.moneyline?.accuracyPct ?? 0,
      cardsRecord: s.suggestedCards?.record ?? "—", upsetWinner: upset?.winner, fights,
    },
    mlb,
    generatedNote: "Design-lab preview · real production data, read-only · paper-only educational tracking",
  };
}

/** Initials for a fighter/player name (shared avatar fallback — no real image source). */
export function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
