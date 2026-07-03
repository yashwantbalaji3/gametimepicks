/**
 * Crown ladder summary — the ONE source for the original completed $100 → $10K ladder's headline figures
 * (start, final, record). Read from the canonical `mr-dub/banked-ladders.json` (ladders[0], the crown lane)
 * so NOTHING hardcodes "$10,376.17 · 5–0" in a component. Pure + deterministic; never fabricates — if the
 * artifact is unreadable it returns null and the caller shows nothing rather than a made-up number.
 */
import fs from "node:fs";
import path from "node:path";

export interface CrownSummary {
  start: number;
  final: number;
  wins: number;
  losses: number;
  recordLabel: string;   // e.g. "5–0"
  finalLabel: string;    // e.g. "$10,376.17"
  pathLabel: string;     // e.g. "$100 → $10,376.17"
  // The FULL banked picture (so the "how it works" page isn't stuck on run #1).
  laddersCompleted: number;  // count of officially completed $100→$10K ladders (2)
  crownTotal: number;        // Σ of all completed-ladder finals (the crown, e.g. 20465.40)
  crownTotalLabel: string;   // e.g. "$20,465.40"
  laddersLabel: string;      // e.g. "2 completed $100→$10K ladders → $20,465.40 crown"
}

const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

export function crownLadderSummary(root: string): CrownSummary | null {
  let banked: any;
  try { banked = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "banked-ladders.json"), "utf8")); } catch { return null; }
  // The crown ladder is the original lane (lane "crown"), else the first banked ladder.
  const crown = (banked.ladders ?? []).find((l: any) => l.lane === "crown") ?? (banked.ladders ?? [])[0];
  if (!crown) return null;
  const steps = crown.steps ?? [];
  const wins = steps.filter((s: any) => s.result === "won" || s.result === "win").length;
  const losses = steps.filter((s: any) => s.result === "lost" || s.result === "loss").length;
  const start = Number(crown.start ?? 100);
  const final = Number(crown.final ?? 0);
  // Full banked picture — all officially completed ladders + the cumulative crown.
  const completed = (banked.ladders ?? []).filter((l: any) => l.official !== false);
  const laddersCompleted = completed.length;
  const crownTotal = Number(banked.crownTotal ?? completed.reduce((s: number, l: any) => s + Number(l.final ?? 0), 0));
  return {
    start, final, wins, losses,
    recordLabel: `${wins}–${losses}`,
    finalLabel: usd(final),
    pathLabel: `${usd(start)} → ${usd(final)}`,
    laddersCompleted,
    crownTotal,
    crownTotalLabel: usd(crownTotal),
    laddersLabel: `${laddersCompleted} completed $100→$10K ladder${laddersCompleted === 1 ? "" : "s"} → ${usd(crownTotal)} crown`,
  };
}
