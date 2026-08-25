/**
 * ACTIVATION READINESS — a derived VIEW over the twelve-stage gate (Program 206 · Phase 1).
 *
 * Two axes the console must never conflate: ENGINEERING readiness (every non-proven stage is
 * externally owned — nothing left to build) and ACTIVATION tier (12/12 receipts actually exist).
 * This summarizes the committed activation-gap artifact; it renames nothing, recounts everything,
 * and cannot become a competing source of truth because it carries no state of its own.
 */
import fs from "node:fs";
import path from "node:path";

export function activationReadiness() {
  let gap;
  try {
    gap = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data/internal/launch/activation-gap-v1.json"), "utf8"));
  } catch {
    return null;
  }
  const sports = {};
  for (const [sport, s] of Object.entries(gap.sports ?? {})) {
    const gaps = s.stages.filter((st) => st.status !== "PROVEN");
    sports[sport] = {
      proven: s.proven,
      applicable: s.applicable,
      tier: s.tier,
      engineeringReady: gaps.every((st) => st.owner === "REALITY" || st.owner === "FOUNDER"),
      parked: gaps.map((st) => ({ id: st.id, owner: st.owner, nextGate: st.nextGate })),
    };
  }
  return { generatedAt: gap.generatedAt, sports };
}
