/**
 * Targeted NFL anytime-TD capture — LOCAL ONLY. NFL, `player_anytime_td`, region `us`, explicitly named events only.
 *
 * DRY-RUN IS THE DEFAULT: without --authorized this script makes ZERO network calls and writes nothing. It prints the
 * targets, the market, the region, the worst-case credits, the cumulative ledger position, the receipt verdict and the
 * private-directory verdict, and exits.
 *
 * THE PAID PATH (founder decision on PR #1359: the repo is public, data/internal is NOT private) needs ALL of:
 *   --authorized --write          (a paid call whose ledger is not written is unaccounted spend)
 *   --receipt <docs/receipts/…md> that parses, is current, names `player_anytime_td` in its prop row, and leaves at
 *                                 least --max-credits under its ceiling
 *   a private directory           --private-dir <abs> | GTP_PRIVATE_DATA_DIR | ~/gtp-private (the publisher's default),
 *                                 REFUSED inside this repo or any git working tree (lib/ops/private-data-dir.mjs)
 *   a key                         --key-env-file <dotenv, mode 600> (only its ODDS_API_KEY line is read;
 *                                 nba-props/key-env-file.mjs) or ODDS_API_KEY in the environment. Never printed.
 *   the shared provider balance   x-requests-remaining on the free index − worst case ≥ --min-provider-remaining (500)
 *
 * OUTPUTS (only with --authorized --write):
 *   repo      data/internal/research/odds/nfl/p171-ledger.json  the shared credit ledger ONLY (credits, status, endpoint,
 *                                                                time; no price, player, book or key fingerprint)
 *   private   <private>/odds/nfl/atd-<stamp>/raw-*.json          provider bodies + usage headers
 *             <private>/odds/nfl/atd-<stamp>/capture-atd-<stamp>.json   `nfl-odds-capture` (propProbe.anytimeTd), which
 *                                                                scripts/nfl/publish-nfl-line-board.mjs encrypts into
 *                                                                data/odds-display/nfl/lines/<event>.json.enc
 *             <private>/odds/nfl/atd-<stamp>/anytime-td-display.json    derived rows for the preflight (last-known-good)
 *   Nothing else under the repository. markets/latest.json is never written.
 *
 * Usage: node scripts/nfl/capture-nfl-atd-targeted.mjs --now <iso> --events <espnId,espnId> --max-credits <n>
 *        [--receipt docs/receipts/<file>.md] [--private-dir /abs] [--key-env-file /abs/.env]
 *        [--min-provider-remaining 500] [--refresh-minutes 45] [--authorized --write]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classifyOddsSecret } from "../../src/lib/sports/odds/snapshot-contract.mjs";
import { emptyLedger, assertNoSecretLeak, P171_LEDGER_RELPATH } from "../../src/lib/sports/odds/p171-authorization.mjs";
import { readOddsKeyFromEnvFile } from "../../src/lib/sports/odds/nba-props/key-env-file.mjs";
import { resolvePrivateDataDir, PRIVATE_DIR_ENV } from "../../src/lib/ops/private-data-dir.mjs";
import { buildPlayerRegistry } from "../../src/lib/sports/nfl/player-identity.mjs";
import {
  ATD_MARKET, ATD_REGIONS, DEFAULT_FRESHNESS_MINUTES, DEFAULT_MIN_PROVIDER_REMAINING,
  planTargetedAtd, readAtdAuthorization, executeAtdRun, buildAtdDisplayFile, buildAtdPrivateCapture, atdPrivateLayout,
} from "../../src/lib/sports/odds/nfl-atd-targeted.mjs";
import { latestAtdDisplayFile } from "../../src/lib/sports/nfl/atd-prices.mjs";

const DEFAULT_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "https://api.the-odds-api.com/v4";
export const DEFAULT_VERDICT_RECEIPT = "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md";
/** A paid run's --now must be within this of the machine clock (it then runs on the machine clock). */
export const NOW_TOLERANCE_MS = 5 * 60_000;

/** Parse argv. Pure. */
export function parseArgs(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
  const has = (n) => argv.includes(n);
  const int = (v) => (v != null && /^\d+$/.test(v) ? Number(v) : v);
  return {
    now: arg("--now"),
    events: arg("--events") ? arg("--events").split(",").map((s) => s.trim()).filter((s) => s !== "") : [],
    eventsRaw: arg("--events"),
    maxCredits: int(arg("--max-credits")),
    receipt: arg("--receipt"),
    privateDir: arg("--private-dir"),
    keyEnvFile: arg("--key-env-file"),
    minProviderRemaining: arg("--min-provider-remaining") == null ? DEFAULT_MIN_PROVIDER_REMAINING : int(arg("--min-provider-remaining")),
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
  const HOME = deps.homeDir ?? os.homedir();
  const resolveRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
  const a = parseArgs(argv);

  if (!a.now || !Number.isFinite(Date.parse(a.now))) { err("REFUSED: --now <ISO> required"); return 1; }
  /*
   * THE PAID PATH RUNS ON THE REAL CLOCK (re-review of PR #1359). --now feeds receipt expiry, the not-started check,
   * every capturedAt and the ledger `at`; a backdated --now after kickoff would accept an expired receipt and buy LIVE
   * prices stamped as pre-kickoff, which would then pass the publisher's pre-kickoff / 12 h rules. So with --authorized
   * --now must agree with the machine clock within NOW_TOLERANCE_MS, and from there on every instant is the real clock.
   * A dry run (no network, no write) may keep any --now for planning.
   */
  const clock = deps.clock ?? (() => Date.now());
  let NOW = a.now;
  if (a.authorized) {
    const realMs = clock();
    const skew = Date.parse(a.now) - realMs;
    if (!Number.isFinite(realMs) || Math.abs(skew) > NOW_TOLERANCE_MS) {
      err(`REFUSED: --now ${a.now} is ${Number.isFinite(skew) ? `${Math.round(skew / 1000)} s` : "unknown"} from the real clock (${Number.isFinite(realMs) ? new Date(realMs).toISOString() : "?"}); a paid run allows at most ${NOW_TOLERANCE_MS / 60000} min — expiry, kickoff and capture stamps come from the real clock. Nothing was spent.`);
      return 2;
    }
    NOW = new Date(realMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  if (!a.eventsRaw) { err("REFUSED: --events <espnId,espnId> required — this lane never chooses events"); return 1; }
  if (!(Number.isInteger(a.maxCredits) && a.maxCredits >= 1)) { err("REFUSED: --max-credits <integer ≥ 1> required"); return 1; }
  if (!(Number.isInteger(a.minProviderRemaining) && a.minProviderRemaining >= 0)) { err("REFUSED: --min-provider-remaining must be an integer ≥ 0"); return 1; }
  if (!(a.refreshMinutes > 0)) { err("REFUSED: --refresh-minutes must be positive"); return 1; }

  const schedule = readJson(path.join(APP, "public/data/nfl/schedule/latest.json"));
  const plan = planTargetedAtd({ scheduleRows: schedule.rows, eventIds: a.events, nowIso: NOW, maxCredits: a.maxCredits, regions: [...ATD_REGIONS] });

  const ledgerPath = path.join(ROOT, P171_LEDGER_RELPATH);
  let ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : emptyLedger(a.receipt ?? DEFAULT_VERDICT_RECEIPT);
  const verdictReceipt = a.receipt ?? DEFAULT_VERDICT_RECEIPT;
  const receiptText = fs.existsSync(resolveRoot(verdictReceipt)) ? fs.readFileSync(resolveRoot(verdictReceipt), "utf8") : null;
  const auth = readAtdAuthorization({ receiptText, nowIso: NOW, ledger, maxCredits: a.maxCredits });
  // the publisher's own default chain: --private-dir, then GTP_PRIVATE_DATA_DIR, then ~/gtp-private
  const priv = resolvePrivateDataDir({ cliDir: a.privateDir ?? (env[PRIVATE_DIR_ENV]?.trim() || path.join(HOME, "gtp-private")), env, repoRoot: ROOT });

  log(`targets: ${plan.targets.length ? plan.targets.map((t) => `${t.providerEventId} (${t.matchup}, kickoff ${t.startTimeUtc})`).join("; ") : "none"}`);
  log(`markets: ${plan.markets.join(",")} · regions: ${plan.regions.join(",")} · sport key: ${plan.sportKey ?? "—"}`);
  log(`plan: [free] /sports/${plan.sportKey ?? "{key}"}/events → [${plan.perCallWorstCase} worst-case each] ${plan.targets.length} × /events/{oddsEventId}/odds — worst case this run ${plan.worstCase} of --max-credits ${a.maxCredits}`);
  log(`ledger: cumulative ${ledger.cumulativeCredits ?? 0} of ${auth.authorization?.ceiling ?? "?"} (${auth.remaining ?? "?"} left)`);
  log(`provider balance: checked on the free index before any paid call — remaining − ${plan.worstCase} must be ≥ ${a.minProviderRemaining} (shared 3,500/week plan; x-requests-remaining is the machine truth)`);
  log(`receipt (${verdictReceipt}${a.receipt ? "" : ", default for this verdict only"}): ${auth.ok ? `OK — authorizes ${ATD_MARKET}` : `REFUSED — ${auth.errors.join("; ")}`}`);
  const privSource = a.privateDir ? "--private-dir" : env[PRIVATE_DIR_ENV]?.trim() ? PRIVATE_DIR_ENV : "default ~/gtp-private";
  log(`private directory (${privSource}): ${priv.ok ? "OK — outside every git working tree" : `REFUSED — ${priv.reason}`}`);
  if (!plan.ok) { err(`PLAN REFUSED: ${plan.errors.join("; ")}`); return 2; }

  if (!a.authorized) {
    log("DRY-RUN (default): no network call was made, nothing was spent or written. A paid run is LOCAL only and needs --authorized --write --receipt <path> plus a private directory and a key.");
    return 0;
  }
  if (!a.write) { err("REFUSED: --authorized without --write — a paid call whose ledger is not written is unaccounted spend. Nothing was spent."); return 2; }
  if (!a.receipt) { err("REFUSED: --authorized needs an explicit --receipt. Nothing was spent."); return 2; }
  if (!auth.ok) { err(`REFUSED: ${auth.errors.join("; ")}. Nothing was spent.`); return 2; }
  if (!priv.ok) { err(`REFUSED: ${priv.reason}. Prices are never written to a repository. Nothing was spent.`); return 2; }

  // the key: the founder's existing dotenv (only its ODDS_API_KEY line, mode 600) or the environment — never printed
  let KEY = "";
  if (a.keyEnvFile) {
    const k = readOddsKeyFromEnvFile(a.keyEnvFile);
    if (!k.ok) { err(`REFUSED: ${k.reason} — no key, no call`); return 3; }
    KEY = k.key.trim();
  } else KEY = String(env.ODDS_API_KEY ?? "").trim();
  const secret = classifyOddsSecret({ ODDS_API_KEY: KEY });
  if (secret.state !== "PRESENT") { err(`${secret.state}: ${secret.reason} (--key-env-file or ODDS_API_KEY) — no key, no call`); return 3; }

  const writeGuarded = (p, obj) => {
    const payload = JSON.stringify(obj, null, 1);
    const leak = assertNoSecretLeak(payload, [KEY]);
    if (!leak.ok) throw new Error(`REFUSED: ${leak.reason} (${path.basename(p)})`);
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
    nowIso: NOW,
    get,
    scheduleRows: schedule.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED"),
    registry,
    freshnessMinutes: a.refreshMinutes,
    minProviderRemaining: a.minProviderRemaining,
    clock, // a game that kicks off while the run is in progress is refused per call
    onLedger: (l) => writeGuarded(ledgerPath, l), // every charge reaches disk before the next call
    log,
  });
  ledger = run.ledger;
  writeGuarded(ledgerPath, ledger);

  // PRIVATE outputs only
  const L = atdPrivateLayout(NOW);
  const at = (rel) => path.join(priv.dir, rel);
  for (const r of run.raw ?? []) writeGuarded(at(r.kind === "events-index" ? L.indexFile : L.rawFile(r.oddsEventId)), r);
  if (run.paidCalls > 0 || run.results.length) writeGuarded(at(L.captureFile), buildAtdPrivateCapture({ run, plan, nowIso: NOW, maxCredits: a.maxCredits }));
  const prior = latestAtdDisplayFile(priv.dir);
  const display = buildAtdDisplayFile({ prior: prior?.file ?? null, results: run.results, nowIso: NOW });
  if (display) writeGuarded(at(L.displayFile), display);
  else log("PRESERVED_LAST_KNOWN_GOOD: this run fetched no anytime-TD answer — the newest private display file stands untouched");

  // counts only on stdout — never a price, book or player
  for (const r of run.results) log(`${r.matchup}: ${r.state} — ${r.rows.length} resolved book row(s), ${r.quarantined.length} quarantined, ${r.credits} credit(s)`);
  for (const s of run.skipped) log(`skipped ${s.canonicalEventId}: ${s.reason}`);
  log(`private: ${L.dir}/ (${(run.raw ?? []).length} raw file(s)${display ? ", display rows" : ""})`);
  log(`credits: this run ${run.spentThisRun} (planned worst ${plan.worstCase}, cap ${a.maxCredits}), cumulative ${ledger.cumulativeCredits} of ${auth.authorization.ceiling}; provider remaining at open ${run.openingProviderRemaining ?? "?"}`);
  if (run.stoppedReason) { err(`STOPPED: ${run.stoppedReason}`); return 5; }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e?.message ?? e); process.exit(9); });
}
