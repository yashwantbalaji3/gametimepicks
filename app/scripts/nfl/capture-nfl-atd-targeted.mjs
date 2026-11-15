/**
 * Targeted NFL anytime-TD capture. NFL ONLY, `player_anytime_td` ONLY, region `us` ONLY, explicitly named events ONLY.
 *
 * DRY-RUN IS THE DEFAULT: without --authorized this script makes ZERO network calls. It prints the targets, the
 * market, the region, the worst-case credits, the cumulative ledger position and the receipt verdict, and exits.
 *
 * The paid path needs ALL of: --authorized, --write (a paid call whose ledger is not written is unaccounted
 * spend, so authorized-without-write is refused), an explicit --receipt that parses, is not expired, names
 * `player_anytime_td` in its own prop-market row, and leaves at least --max-credits under its ceiling.
 *
 * CALL PLAN: free /sports/{key}/events → join to the ESPN schedule → per target ONE
 * /events/{oddsEventId}/odds?regions=us&markets=player_anytime_td (worst case 1 credit each). No retries; any gate
 * refusal, cost overrun (x-requests-last above plan) or provider failure other than 422 stops the run.
 *
 * OUTPUTS (only with --write):
 *   private  data/internal/research/odds/nfl/atd-targeted-<stamp>.json   every book, quarantine, per-event detail
 *   private  data/internal/research/odds/nfl/p171-ledger.json            the shared cumulative ledger (per call)
 *   private  data/internal/research/odds/nfl/anytime-td-latest.json      derived display rows, one named book per
 *                                                                        player, merged last-known-good over the prior file
 *   NOTHING is written under app/public (provider terms forbid downloadable price files; the repo is public, so
 *   data/internal is readable on GitHub — a stop-gap until the encrypted display path is wired). markets/latest.json
 *   is NEVER written by this lane.
 *
 * Usage: node scripts/nfl/capture-nfl-atd-targeted.mjs --now <iso> --events <espnId,espnId> --max-credits <n>
 *        [--receipt <path>] [--authorized --write] [--refresh-minutes 45]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classifyOddsSecret } from "../../src/lib/sports/odds/snapshot-contract.mjs";
import { emptyLedger, assertNoSecretLeak, P171_LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";
import { buildPlayerRegistry } from "../../src/lib/sports/nfl/player-identity.mjs";
import {
  ATD_MARKET, ATD_REGIONS, ATD_DISPLAY_RELPATH, ATD_PRIVATE_DIR_RELPATH, DEFAULT_FRESHNESS_MINUTES,
  planTargetedAtd, readAtdAuthorization, executeAtdRun, buildAtdDisplayFile,
} from "../../src/lib/sports/odds/nfl-atd-targeted.mjs";

const DEFAULT_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "https://api.the-odds-api.com/v4";
export const DEFAULT_VERDICT_RECEIPT = "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md";

/** Parse argv. Pure. */
export function parseArgs(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
  const has = (n) => argv.includes(n);
  const mc = arg("--max-credits");
  return {
    now: arg("--now"),
    events: arg("--events") ? arg("--events").split(",").map((s) => s.trim()).filter((s) => s !== "") : [],
    eventsRaw: arg("--events"),
    maxCredits: mc != null && /^\d+$/.test(mc) ? Number(mc) : mc,
    receipt: arg("--receipt"),
    authorized: has("--authorized"),
    write: has("--write"),
    refreshMinutes: Number(arg("--refresh-minutes") ?? DEFAULT_FRESHNESS_MINUTES),
  };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/**
 * Entry point. Returns an exit code; never calls process.exit itself so it can be imported by tests.
 * `deps.fetch` is the only network seam; a dry run never touches it.
 */
export async function main(argv, deps = {}) {
  const log = deps.log ?? ((s) => console.log(s));
  const err = deps.error ?? ((s) => console.error(s));
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  // test seam: a fixture tree laid out like the repo (app/ inside root/). Defaults to this checkout.
  const APP = deps.appDir ?? DEFAULT_APP;
  const ROOT = deps.rootDir ?? path.join(APP, "..");
  const resolveRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
  const a = parseArgs(argv);

  if (!a.now || !Number.isFinite(Date.parse(a.now))) { err("REFUSED: --now <ISO> required"); return 1; }
  if (!a.eventsRaw) { err("REFUSED: --events <espnId,espnId> required — this lane never chooses events"); return 1; }
  if (!(Number.isInteger(a.maxCredits) && a.maxCredits >= 1)) { err("REFUSED: --max-credits <integer ≥ 1> required"); return 1; }
  if (!(a.refreshMinutes > 0)) { err("REFUSED: --refresh-minutes must be positive"); return 1; }

  const schedule = readJson(path.join(APP, "public/data/nfl/schedule/latest.json"));
  const plan = planTargetedAtd({ scheduleRows: schedule.rows, eventIds: a.events, nowIso: a.now, maxCredits: a.maxCredits, regions: [...ATD_REGIONS] });

  const ledgerPath = path.join(ROOT, P171_LEDGER_RELPATH);
  let ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : emptyLedger(a.receipt ?? DEFAULT_VERDICT_RECEIPT);
  const verdictReceipt = a.receipt ?? DEFAULT_VERDICT_RECEIPT;
  const receiptText = fs.existsSync(resolveRoot(verdictReceipt)) ? fs.readFileSync(resolveRoot(verdictReceipt), "utf8") : null;
  const auth = readAtdAuthorization({ receiptText, nowIso: a.now, ledger, maxCredits: a.maxCredits });

  log(`targets: ${plan.targets.length ? plan.targets.map((t) => `${t.providerEventId} (${t.matchup}, kickoff ${t.startTimeUtc})`).join("; ") : "none"}`);
  log(`markets: ${plan.markets.join(",")} · regions: ${plan.regions.join(",")} · sport key: ${plan.sportKey ?? "—"}`);
  log(`plan: [free] /sports/${plan.sportKey ?? "{key}"}/events → [${plan.perCallWorstCase} worst-case each] ${plan.targets.length} × /events/{oddsEventId}/odds — worst case this run ${plan.worstCase} of --max-credits ${a.maxCredits}`);
  log(`ledger: cumulative ${ledger.cumulativeCredits ?? 0} of ${auth.authorization?.ceiling ?? "?"} (${auth.remaining ?? "?"} left)`);
  log(`receipt (${verdictReceipt}${a.receipt ? "" : ", default for this verdict only"}): ${auth.ok ? `OK — authorizes ${ATD_MARKET}` : `REFUSED — ${auth.errors.join("; ")}`}`);
  if (!plan.ok) { err(`PLAN REFUSED: ${plan.errors.join("; ")}`); return 2; }

  if (!a.authorized) {
    log("DRY-RUN (default): no network call was made, nothing was spent. A paid run needs --authorized --write --receipt <path>.");
    return 0;
  }
  if (!a.write) { err("REFUSED: --authorized without --write — a paid call whose ledger is not written is unaccounted spend. Nothing was spent."); return 2; }
  if (!a.receipt) { err("REFUSED: --authorized needs an explicit --receipt. Nothing was spent."); return 2; }
  if (!auth.ok) { err(`REFUSED: ${auth.errors.join("; ")}. Nothing was spent.`); return 2; }

  const secret = classifyOddsSecret(env);
  if (secret.state !== "PRESENT") { err(`${secret.state}: ${secret.reason} — no key, no call`); return 3; }
  const KEY = String(env.ODDS_API_KEY).trim();

  const writeGuarded = (p, obj) => {
    const payload = JSON.stringify(obj, null, 1);
    const leak = assertNoSecretLeak(payload, [KEY]);
    if (!leak.ok) throw new Error(`REFUSED: ${leak.reason} (${p})`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, payload);
  };

  const get = async (pathAndQuery) => {
    const res = await fetchImpl(`${BASE}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}apiKey=${KEY}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
    const headers = { "x-requests-last": res.headers.get("x-requests-last"), "x-requests-used": res.headers.get("x-requests-used"), "x-requests-remaining": res.headers.get("x-requests-remaining") };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, headers, body };
  };

  const rosters = readJson(path.join(APP, "public/data/nfl/rosters/latest.json"));
  const registry = buildPlayerRegistry([rosters]);
  const run = await executeAtdRun({
    plan,
    authorization: auth.authorization,
    ledger,
    nowIso: a.now,
    get,
    scheduleRows: schedule.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED"),
    registry,
    freshnessMinutes: a.refreshMinutes,
    onLedger: (l) => writeGuarded(ledgerPath, l), // every charge reaches disk before the next call
    log,
  });
  ledger = run.ledger;
  writeGuarded(ledgerPath, ledger);

  const stamp = a.now.replace(/[-:]/g, "").slice(0, 13);
  const lastRemaining = ledger.requests[ledger.requests.length - 1]?.providerRequestsRemaining;
  const snapshot = {
    schemaVersion: 1,
    artifact: "nfl-atd-targeted-capture",
    dataClass: "PRIVATE_RESEARCH",
    sport: "nfl",
    capturedAt: a.now,
    requestId: `atd-${stamp}`,
    keyFingerprint: `len${KEY.length}…${KEY.slice(-4)}`,
    requestedMarkets: [ATD_MARKET],
    regions: plan.regions,
    maxCredits: a.maxCredits,
    plannedWorstCase: plan.worstCase,
    creditsUsed: run.spentThisRun,
    paidCalls: run.paidCalls,
    creditsRemaining: Number.isFinite(lastRemaining) ? lastRemaining : null,
    targets: plan.targets.map((t) => ({ providerEventId: t.providerEventId, canonicalEventId: t.canonicalEventId, matchup: t.matchup, kickoffUtc: t.startTimeUtc })),
    join: run.join,
    skipped: run.skipped,
    stoppedReason: run.stoppedReason,
    events: run.results,
  };
  if (run.paidCalls > 0 || run.results.length) writeGuarded(path.join(ROOT, ATD_PRIVATE_DIR_RELPATH, `atd-targeted-${stamp}.json`), snapshot);

  const displayPath = path.join(ROOT, ATD_DISPLAY_RELPATH);
  const prior = fs.existsSync(displayPath) ? readJson(displayPath) : null;
  const display = buildAtdDisplayFile({ prior, results: run.results, nowIso: a.now });
  if (display) writeGuarded(displayPath, display);
  else log("PRESERVED_LAST_KNOWN_GOOD: this run fetched no anytime-TD answer — the display file stands untouched");

  for (const r of run.results) log(`${r.matchup}: ${r.state} — ${r.rows.length} resolved book row(s), ${r.quarantined.length} quarantined, ${r.credits} credit(s)`);
  for (const s of run.skipped) log(`skipped ${s.canonicalEventId}: ${s.reason}`);
  log(`credits: this run ${run.spentThisRun} (planned worst ${plan.worstCase}, cap ${a.maxCredits}), cumulative ${ledger.cumulativeCredits} of ${auth.authorization.ceiling}`);
  if (run.stoppedReason) { err(`STOPPED: ${run.stoppedReason}`); return 5; }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e?.message ?? e); process.exit(9); });
}
