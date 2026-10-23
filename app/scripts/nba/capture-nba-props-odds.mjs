/**
 * NBA player-prop odds capture. DRY RUN by default; spends ONLY under a committed, current NBA player-prop receipt.
 *
 * The founder has not authorized paid Odds API credits for NBA props, and no NBA receipt exists, so today every paid
 * path refuses. Without --authorized this prints the plan: the events in window from the committed ESPN schedule, the
 * markets (points first), the bookmakers (the eligible-operator allowlist), and the worst-case credits under the
 * provider's documented costing (lib/sports/odds/nba-props/credits.mjs). Then it exits.
 *
 *   --authorized without --receipt                      → REFUSED (exit 2)
 *   --authorized --receipt <docs/receipts/…md> invalid  → REFUSED with the parser's reasons (exit 2). This includes an
 *                                                         expired DATED receipt and markets not on its row.
 *   --authorized --receipt <valid receipt>              → DRY RUN under the receipt (exit 0). It plans; nothing is spent.
 *   … --apply                                           → REFUSED (exit 2) unless --out-dir / GTP_PRIVATE_DATA_DIR names a
 *       private directory outside every repository (founder storage decision, 2026-10-22). Then the authorized capture
 *       (lib/sports/odds/nba-props/capture.mjs):
 *       free /events listing → joined, not-started events only → before each call, a ceiling check on its worst case
 *       → the NBA ledger at the provider's x-requests-last (credits and status only, in the repository) → price records
 *       ONLY to <private dir>/odds/nba/props/ → stop on any failure, never retry blindly.
 *       Exit 0 captured · 4 ceiling reached · 1 stopped.
 *
 * This file holds no HTTP call and no provider host. Those live in capture.mjs, which is tested with a fake fetch.
 * The API key is read only after the receipt parses, and only with --apply.
 *
 * Usage: npx tsx scripts/nba/capture-nba-props-odds.mjs --now <iso> [--lookahead-hours 30] [--lead-minutes 20,75] [--markets player_points,…]
 *        [--out-dir /abs/private/dir]
 *        [--authorized --receipt docs/receipts/<file>.md]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planNbaPropCapture, parseNbaPropsReceipt } from "../../src/lib/sports/odds/nba-props/credits.mjs";
import { POINTS_FIRST_SCOPE } from "../../src/lib/sports/odds/nba-props/contract.mjs";
import { runNbaPropCapture } from "../../src/lib/sports/odds/nba-props/capture.mjs";
import { LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";
import { resolvePrivateDataDir } from "../../src/lib/ops/private-data-dir.mjs";
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
const LEAD = (arg("--lead-minutes") ?? `0,${LOOKAHEAD_H * 60}`).split(",").map(Number);
if (LEAD.length !== 2 || !LEAD.every(Number.isFinite) || LEAD[0] < 0 || LEAD[1] <= LEAD[0]) refuse(2, "--lead-minutes MIN,MAX needs two numbers with 0 ≤ MIN < MAX");
const MARKETS = (arg("--markets") ?? POINTS_FIRST_SCOPE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/schedule/latest.json"), "utf8"));

if (has("--authorized")) {
  const rel = arg("--receipt");
  if (!rel) refuse(2, "--authorized needs --receipt <docs/receipts/…md>; no NBA player-prop receipt exists — zero credits may be spent");
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(path.join(ROOT, "docs", "receipts") + path.sep) || !fs.existsSync(abs)) refuse(2, `receipt ${rel} is not a committed file under docs/receipts/`);
  const receiptText = fs.readFileSync(abs, "utf8");
  const parsed = parseNbaPropsReceipt(receiptText, { now: NOW });
  if (!parsed.ok) refuse(2, `receipt ${rel} does not authorize NBA player props:\n  - ${parsed.errors.join("\n  - ")}`);

  /* STORAGE (founder decision, 2026-10-22): price records go ONLY to private storage outside every repository. A paid
     run resolves that directory BEFORE any call, so nothing is ever bought without a safe place to keep it. */
  const priv = resolvePrivateDataDir({ cliDir: arg("--out-dir"), repoRoot: ROOT });
  if (has("--apply") && !priv.ok) refuse(2, `${priv.reason} — no paid call made`);

  /* Rosters for the player join: the committed roster capture, by ESPN team id (internal research; scripts only). */
  const rosterDoc = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nba/rosters/latest.json"), "utf8")); } catch { return null; } })();
  const byTeam = new Map((rosterDoc?.teams ?? []).map((t) => [String(t.providerTeamId), t.players ?? []]));
  const rowById = new Map((schedule.rows ?? []).map((r) => [String(r.providerEventId), r]));
  const rosterFor = (eventId) => {
    const r = rowById.get(String(eventId));
    return r ? [r.home, r.away].flatMap((side) => (byTeam.get(String(side?.providerTeamId)) ?? []).map((p) => ({ providerAthleteId: String(p.providerAthleteId), displayName: p.displayName, team: side?.abbr ?? null }))) : [];
  };

  const ledgerPath = path.join(ROOT, LEDGER_RELPATH.nba);
  const ledger = (() => { try { return JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { return null; } })();
  const result = await runNbaPropCapture({
    now: NOW, receiptText, receiptRel: rel, ledger, scheduleRows: schedule.rows ?? [], rosterFor, markets: MARKETS,
    // --lead-minutes MIN,MAX (pilot: 20,75 → T-60 with a T-30 fallback, never after tip); default: 0 to the lookahead.
    minLeadMinutes: LEAD[0], maxLeadMinutes: LEAD[1],
    // The repository's own odds guards, read from the environment the workflow passes.
    minCreditsRemaining: Number(process.env.ODDS_API_MIN_CREDITS_REMAINING ?? "2000"),
    maxEventsPerRun: Number(process.env.ODDS_MAX_EVENTS_PER_RUN ?? "2"),
    apply: has("--apply"),
    // The key is read only here, after the receipt has parsed, and only when spending was asked for.
    apiKey: has("--apply") ? (process.env.ODDS_API_KEY ?? "").trim() : "",
    fetchImpl: globalThis.fetch,
  });
  // Any call made is on the ledger before anything else is written.
  if (result.calls?.length) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${JSON.stringify(result.ledger, null, 1)}\n`);
  }
  // The ledger above holds credits and status only (no line, no price). Price records go to private storage only.
  if ((result.records?.length || result.coverage) && priv.ok) {
    const out = path.join(priv.dir, "odds", "nba", "props", `${new Date(Date.parse(NOW)).toISOString().replace(/[:.]/g, "").slice(0, 15)}Z.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const { ledger: _l, ...rest } = result;
    fs.writeFileSync(out, `${JSON.stringify({ dataClass: "PRIVATE_RESEARCH", productEligible: false, capturedFor: NOW, ...rest }, null, 1)}\n`);
  }
  const { ledger: _ledger, records: _records, refusals: _refusals, ...summary } = result;
  console.log(JSON.stringify({ ...summary, records: result.records?.length ?? 0, cumulativeCredits: result.ledger?.cumulativeCredits ?? null }, null, 2));
  const EXIT = { CAPTURED: 0, DRY_RUN: 0, NOTHING_TO_PRICE: 0, REFUSED: 2, CEILING_REACHED: 4, STOPPED: 1 };
  process.exit(EXIT[result.state] ?? 1);
}

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
