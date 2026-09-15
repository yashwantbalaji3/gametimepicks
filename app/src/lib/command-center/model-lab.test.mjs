/**
 * P312 — the Model Lab reads receipts; it never restates them. A missing receipt is an absent line, a research
 * candidate is never described as live, and the page is reachable from the derived navigation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModelLab } from "./model-lab.ts";

const NOW = "2026-09-15T12:00:00Z";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-lab-"));
const write = (root, rel, doc) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(doc)); };

test("with no receipts at all the lab has live rows (status unknown), no experiments and no decisions — nothing invented", () => {
  const root = tmp();
  const lab = buildModelLab({ dataRoot: path.join(root, "public/data"), repoRoot: root, nowIso: NOW });
  assert.equal(lab.live.length, 4);
  assert.ok(lab.live.every((l) => l.items.length > 0));
  assert.deepEqual(lab.experiments, []);
  assert.deepEqual(lab.decisions, []);
});

test("forward receipts become experiments in public states; a shadow is research only and never a live state", () => {
  const root = tmp();
  write(root, "data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json", { families: { player_receptions: { state: "ACCUMULATING", n: 40, needed: 300 }, player_rush_yds: { state: "FORWARD_BREACHED", n: 320, needed: 300 } } });
  write(root, "data/internal/research/epl/forward/receipt.json", { state: "FORWARD_HOLDING", watch: true, n: 70, needed: 60 });
  write(root, "data/internal/research/epl/reports/epl-totals-shadow-forward-protocol.json", { registeredAt: "2026-09-15T04:20:00Z" });
  write(root, "data/internal/research/epl/forward-totals/receipt.json", { state: "SHADOW_BETTER", n: 90, needed: 60 });
  const lab = buildModelLab({ dataRoot: path.join(root, "public/data"), repoRoot: root, nowIso: NOW });
  const byId = Object.fromEntries(lab.experiments.map((e) => [e.id, e]));
  assert.equal(byId.nfl_forward_player_receptions.state, "FORWARD_TEST");
  assert.match(byId.nfl_forward_player_receptions.headline, /40 of 300/);
  assert.equal(byId.nfl_forward_player_rush_yds.state, "PAUSED");
  assert.equal(byId.epl_forward.state, "WATCH");
  assert.equal(byId.epl_shadow_totals.state, "SHADOW", "SHADOW_BETTER is still research only");
  assert.match(byId.epl_shadow_totals.headline, /Research only · better/);
  assert.match(byId.epl_shadow_totals.detail, /powers no public number/);
  assert.ok(lab.decisions.some((d) => d.outcome === "SHADOW"), "registering the shadow is a decision, and it says not adopted");
});

test("decisions come from receipts, most recent first, and a REJECTED blind verdict is never softened", () => {
  const root = tmp();
  write(root, "data/internal/research/epl/reports/epl-history-replay-evaluation.json", { generatedAt: "2026-09-14T16:12:46Z", verdict: "ELIGIBLE" });
  write(root, "data/internal/research/epl/reports/epl-elo-poisson-forward-protocol.json", { frozen: { adoptedAt: "2026-09-14T17:00:00Z" } });
  write(root, "data/internal/research/epl/reports/epl-totals-replay-evaluation.json", { generatedAt: "2026-09-15T02:33:54Z", verdicts: { goalRatios: { blind: { verdict: "REJECTED" }, secondLook: { verdict: "SECOND_LOOK_ELIGIBLE" } }, tempo: { blind: { verdict: "REJECTED" } } } });
  write(root, "public/data/admin/model-health.json", { generatedAt: "2026-09-15T02:00:00Z", families: [{ id: "mlb_total", state: "BREACHED", n: 576 }] });
  const lab = buildModelLab({ dataRoot: path.join(root, "public/data"), repoRoot: root, nowIso: NOW });
  assert.deepEqual(lab.decisions.map((d) => d.when), ["2026-09-15", "2026-09-15", "2026-09-14"], "most recent first");
  assert.deepEqual(lab.decisions.map((d) => d.outcome).sort(), ["ADOPTED", "PAUSED", "REJECTED"]);
  assert.match(lab.decisions.find((d) => d.outcome === "REJECTED").what, /rejected on the blind test/);
  assert.match(lab.decisions.find((d) => d.outcome === "PAUSED").detail, /576 graded games/);
});

test("SOURCE PIN · /models is a derived nav destination, an approved public route, and on both accessibility route lists", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("src/lib/navigation.ts"), /href: "\/models", label: "Model Lab"/);
  assert.match(src("src/lib/public-route-inventory.test.mjs"), /"\/models",/);
  assert.match(src("scripts/audit-accessibility.mjs"), /"models",/);
  assert.match(src("e2e/accessibility.spec.ts"), /"\/models\/"/);
  assert.match(src("src/app/models/page.tsx"), /buildModelLab\(/, "the page reads the lab, never a receipt");
  assert.doesNotMatch(src("src/app/models/page.tsx"), /readFileSync|\.json"/, "no artifact read in the page");
});
