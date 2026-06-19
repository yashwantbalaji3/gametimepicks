/**
 * Bank Builder SETTLED-step results for the Results page — reads the non-protected active engine
 * artifact and returns the steps that have an official settlement (settledAt), with leg-by-leg results
 * and official sources. This is the transparency surface (wins AND losses), distinct from the public
 * Bank Builder marketing page (which hides stopped lanes). Never fabricated — settlement comes straight
 * from the committed artifact, which is only written from official sources.
 */
import fs from "node:fs";
import path from "node:path";

export interface BankBuilderResultLeg {
  label: string;
  sport: string;
  result: string; // won | lost | void | pending
  official: string | null;
  source: string | null;
}
export interface BankBuilderResultStep {
  laneId: "A" | "B";
  laneLabel: string;
  step: number;
  result: string; // won | lost | void
  laneOutcome: string; // advanced | stopped | active
  stake: number | null;
  payout: number | null;
  settledAt: string | null;
  legs: BankBuilderResultLeg[];
}

export function getBankBuilderSettledSteps(): BankBuilderResultStep[] {
  try {
    const p = path.join(process.cwd(), "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
    const run = JSON.parse(fs.readFileSync(p, "utf8"))?.run;
    if (!run) return [];
    const out: BankBuilderResultStep[] = [];
    for (const [lk, id] of [["laneA", "A"], ["laneB", "B"]] as const) {
      const lane = run[lk];
      if (!lane) continue;
      // Include a restarted lane's PRIOR settled steps — a fresh restart must never erase the
      // transparency record of the step that stopped it (e.g. Lane B's June 18 loss).
      const allSteps = [...(lane.steps ?? []), ...(lane.priorLane?.steps ?? [])];
      for (const s of allSteps) {
        if (s.status !== "settled" || !s.settledAt) continue; // only steps settled in a settlement pass
        out.push({
          laneId: id,
          laneLabel: id === "A" ? "Lane A" : "Lane B",
          step: s.step,
          result: s.result ?? "settled",
          // A settled step's outcome is intrinsic to that step (lost → stopped, won → advanced) — not the
          // lane's CURRENT status, which may have moved on (e.g. a restarted lane reads "active" now).
          laneOutcome: s.result === "lost" ? "stopped" : s.result === "won" ? "advanced" : (lane.laneStatus ?? "active"),
          stake: s.stake ?? null,
          payout: s.payout ?? s.projectedPayout ?? null,
          settledAt: s.settledAt ?? null,
          legs: (s.legs ?? []).map((l: any) => ({
            label: l.label,
            sport: l.sport,
            result: l.settlement?.result ?? "settled",
            official: l.settlement?.official ?? null,
            source: l.settlement?.source ?? null,
          })),
        });
      }
    }
    // Newest settlement first.
    return out.sort((a, b) => String(b.settledAt).localeCompare(String(a.settledAt)));
  } catch {
    return [];
  }
}
