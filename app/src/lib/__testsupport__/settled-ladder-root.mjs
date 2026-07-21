/**
 * TEST SUPPORT (not a test — no `.test.` in the name, so the runner skips it).
 *
 * The July-21 REVIEW restart (scripts/restart-both-lanes-0721.mjs) reset BOTH Bank Builder lanes to fresh
 * Step-1 review cycles and pushed the prior cycles down one level into each lane's `priorLane` chain. The
 * same-day-settlement regressions were "ground truth for 2026-07-07" — they assert that an operator-approved
 * Lane A Step-2 card that SETTLED WON renders WON with $0 exposure (advanced to a Step-3 rung, rolled
 * $305.57), and that Lane B is a no-play. That settled cycle now lives in `priorLane`, so these helpers
 * RECONSTRUCT the pre-restart ladder into a throwaway data root (by promoting each lane's `priorLane` back to
 * the top) so the guard logic keeps being validated independent of the live cycle. No real artifact touched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LADDER_REL = ["methodology", "launch", "dual-bank-builder-active.json"];

/** Copy `root` into a temp data root and mutate its committed ladder via `mutate(ladderDoc)`. Caller rmSyncs `tmp`. */
export function makeLadderRoot(root, mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-bb-ladder-"));
  const dataRoot = path.join(tmp, "data");
  fs.cpSync(root, dataRoot, { recursive: true });
  const p = path.join(dataRoot, ...LADDER_REL);
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  mutate(doc);
  fs.writeFileSync(p, JSON.stringify(doc, null, 1));
  return { tmp, dataRoot };
}

/**
 * Reconstruct the pre-July-21-restart ladder (Lane A cycle-8 ADVANCED with Steps 1 & 2 settled WON; Lane B
 * cycle-7 stopped) by promoting each lane's `priorLane` back to the top level. Restores the exact state the
 * 2026-07-07 same-day-settlement regressions expect. Caller must `fs.rmSync(tmp, { recursive: true, force: true })`.
 */
export function makeSettledApprovedRoot(root) {
  return makeLadderRoot(root, (doc) => {
    for (const k of ["laneA", "laneB"]) {
      if (doc.run?.[k]?.priorLane) doc.run[k] = doc.run[k].priorLane; // promote the pre-restart cycle to the top
    }
  });
}
