/**
 * NBA player-prop odds capture — DRY-RUN PLANNER ONLY. This script makes ZERO network calls, in every mode.
 *
 * The founder has not authorized paid Odds API credits for NBA props (the proposed 800-credit token is NOT approved).
 * So this prints the request plan — events in window from the committed ESPN schedule, markets (points first),
 * bookmakers (the eligible-operator allowlist), and the worst-case credits per the provider's documented costing
 * (lib/sports/odds/nba-props/credits.mjs) — and exits.
 *
 *   --authorized without --receipt                      → REFUSED (exit 2)
 *   --authorized --receipt <docs/receipts/…md> invalid  → REFUSED with the parser's reasons (exit 2)
 *   --authorized --receipt <valid receipt>              → REFUSED: the network path is not wired in this PR (exit 3).
 *     Wiring it is a separate, reviewed change made after a committed founder receipt exists.
 *
 * There is deliberately no HTTP client, no API-key read and no provider host in this file (a test scans for them).
 *
 * Usage: node scripts/nba/capture-nba-props-odds.mjs --now <iso> [--lookahead-hours 30] [--markets player_points,…]
 *        [--authorized --receipt docs/receipts/<file>.md]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planNbaPropCapture, parseNbaPropsReceipt } from "../../src/lib/sports/odds/nba-props/credits.mjs";
import { POINTS_FIRST_SCOPE } from "../../src/lib/sports/odds/nba-props/contract.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../../src/lib/sports/odds/eligible-operators.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const argv = process.argv.slice(2);
const arg = (n, f = null) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : f; };
const has = (n) => argv.includes(n);
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse(2, "--now <ISO> required");
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "30"));
const MARKETS = (arg("--markets") ?? POINTS_FIRST_SCOPE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

if (has("--authorized")) {
  const rel = arg("--receipt");
  if (!rel) refuse(2, "--authorized needs --receipt <docs/receipts/…md>; no NBA player-prop receipt exists — zero credits may be spent");
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(path.join(ROOT, "docs", "receipts") + path.sep) || !fs.existsSync(abs)) refuse(2, `receipt ${rel} is not a committed file under docs/receipts/`);
  const parsed = parseNbaPropsReceipt(fs.readFileSync(abs, "utf8"));
  if (!parsed.ok) refuse(2, `receipt ${rel} does not authorize NBA player props:\n  - ${parsed.errors.join("\n  - ")}`);
  refuse(3, "receipt parses, but this PR ships the dry-run planner only — the network path is wired in a separate reviewed change");
}

const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/schedule/latest.json"), "utf8"));
const nowMs = Date.parse(NOW);
const inWindow = (schedule.rows ?? []).filter((r) => {
  const t = Date.parse(r.dateUtc);
  return Number.isFinite(t) && t > nowMs && t - nowMs <= LOOKAHEAD_H * 3_600_000 && r.statusRaw === "STATUS_SCHEDULED";
});
const plan = planNbaPropCapture({ eventIds: inWindow.map((r) => r.providerEventId), markets: MARKETS, bookmakers: [...ELIGIBLE_OPERATOR_KEYS] });
if (!plan.ok) refuse(2, plan.reason);

console.log(JSON.stringify({
  mode: "DRY_RUN",
  networkCalls: 0,
  now: new Date(nowMs).toISOString(),
  lookaheadHours: LOOKAHEAD_H,
  scheduleCapturedAt: schedule.generatedAt ?? null,
  events: inWindow.map((r) => ({ providerEventId: r.providerEventId, shortName: r.shortName, dateUtc: r.dateUtc })),
  plan,
  note: "Worst case assumes every requested market returns non-empty for every event. Provider event ids come from the free /events call at capture time; none is fetched here.",
}, null, 2));
