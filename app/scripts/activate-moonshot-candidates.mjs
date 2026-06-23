#!/usr/bin/env node
/**
 * Moonshot candidate activation — DECISION TOOL (dry-run only).
 *
 * Evaluates the current Moonshot candidates against the activation rules and reports, per candidate,
 * whether it WOULD be eligible to activate (pre-event, odds band, exposure caps). It NEVER places
 * exposure: `--apply` is intentionally gated because the ledger's Moonshot accounting
 * (app/scripts/build-mr-dub-ledger.mjs) currently models a SINGLE active card, not multiple concurrent
 * active lanes with summed exposure + per-lane settlement. Activating two lanes ($50) would not be
 * correctly accounted, so apply is refused until that multi-lane accounting is built + tested.
 *
 * Usage:
 *   node app/scripts/activate-moonshot-candidates.mjs --date 2026-06-23 --max-lanes 2 --stake 25 --dry-run
 *   node app/scripts/activate-moonshot-candidates.mjs --date 2026-06-23 --apply   # → refused (see above)
 *
 * Rules (kept in sync with app/src/lib/moonshot/activation-rules.ts):
 *   ACTIVATION_CUTOFF_MIN=30 · combined band +600..+2000 · default stake $25 · max 2 lanes · max $50 exposure.
 */
import fs from "node:fs";
import path from "node:path";

const ACTIVATION_CUTOFF_MIN = 30;
const MIN_COMBINED = 600, MAX_COMBINED = 2000;
const DEFAULT_STAKE = 25, MAX_ACTIVE_LANES = 2, MAX_EXPOSURE = 50;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const maxLanes = Math.min(Number(val("--max-lanes", MAX_ACTIVE_LANES)), MAX_ACTIVE_LANES);
const stake = Math.min(Number(val("--stake", DEFAULT_STAKE)), DEFAULT_STAKE);
const apply = has("--apply");

const root = path.join(process.cwd(), "app", "public", "data");
const LANE = path.join(root, "moonshot-lane", "active.json");

function earliestKickoffMs(c) {
  let best = null;
  for (const l of c.legs ?? []) { const t = Date.parse(l.startTimeUtc ?? ""); if (Number.isFinite(t) && (best === null || t < best)) best = t; }
  return best;
}
function readiness(c, nowMs) {
  if (c.combinedOdds < MIN_COMBINED || c.combinedOdds > MAX_COMBINED) return { state: "out_of_band", reason: `combined ${c.combinedOdds} outside ${MIN_COMBINED}-${MAX_COMBINED}` };
  const ms = earliestKickoffMs(c);
  if (ms === null) return { state: "ready", reason: "no machine kickoff — review before activating" };
  if (nowMs >= ms) return { state: "expired", reason: "a game has kicked off — review only, no late exposure" };
  if (ms - nowMs < ACTIVATION_CUTOFF_MIN * 60000) return { state: "kickoff_too_close", reason: `kickoff within ${ACTIVATION_CUTOFF_MIN}m` };
  const distinctGames = new Set((c.legs ?? []).map((l) => l.fixture)).size;
  if (distinctGames < 2) return { state: "blocked", reason: "fewer than 2 independent games" };
  return { state: "ready", reason: "all legs comfortably pre-event, ≥2 games, odds in band" };
}

let lane;
try { lane = JSON.parse(fs.readFileSync(LANE, "utf8")); } catch { console.error(`[activate-moonshot] cannot read ${LANE}`); process.exit(1); }
const nowMs = Date.now();
const candidates = (lane.candidates ?? []).filter((c) => (c.legs ?? []).some((l) => (l.startTimeUtc ?? "").slice(0, 10) === date) || date === undefined);

console.log(`=== Moonshot activation DECISION (dry-run) · date=${date} · max-lanes=${maxLanes} · stake=$${stake} ===`);
let eligible = 0, projectedExposure = 0;
for (const c of (lane.candidates ?? [])) {
  const r = readiness(c, nowMs);
  const ok = r.state === "ready" && eligible < maxLanes && projectedExposure + stake <= MAX_EXPOSURE;
  if (ok) { eligible += 1; projectedExposure += stake; }
  console.log(`  ${c.cardId} | combined +${c.combinedOdds} | ${r.state.toUpperCase()} | ${ok ? `WOULD ACTIVATE ($${stake})` : "hold"} | ${r.reason}`);
}
console.log(`  → ${eligible}/${candidates.length} candidate(s) eligible · projected Moonshot exposure $${projectedExposure} (cap $${MAX_EXPOSURE})`);

if (apply) {
  console.error(
    "\n[activate-moonshot] --apply is REFUSED.\n" +
    "  Reason: the ledger (build-mr-dub-ledger.mjs) accounts a SINGLE active Moonshot card, not multiple\n" +
    "  concurrent active lanes with summed exposure + per-lane settlement. Placing exposure now would be\n" +
    "  mis-accounted. Build + test multi-lane Moonshot accounting first, then enable apply. Candidates\n" +
    "  remain READY with $0 exposure (no mutation performed)."
  );
  process.exit(2);
}
console.log("\nDry-run only — no files written. Candidates remain READY ($0 exposure).");
