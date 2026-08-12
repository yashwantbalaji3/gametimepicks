/**
 * Guarded multi-sport odds canary (Program 164 · Release 2).
 *
 * DEFAULT IS DRY-RUN: with no --authorized flag this makes at most ONE zero-credit call (the
 * provider's free /sports index, the same credit-check the MLB scripts have used for a year),
 * prints the plan and remaining credits, and exits. The credit-bearing odds call happens ONLY
 * with --authorized, for EXACTLY ONE sport, one region, one market type (h2h), one request —
 * bounded by --max-credits (default 5) AND a remaining-credit floor of 50.
 *
 * REFUSALS: missing key = BLOCKED_EXTERNAL exit 3, zero calls. Malformed key = CONFIG_INVALID
 * exit 4, zero calls. --sport all (or anything outside nfl/nba/epl/ufc) = exit 5 — broad
 * execution is refused by design. A live lock refuses a concurrent canary (exit 6).
 *
 * REDACTION: the key value never appears in logs, artifacts, or errors — URLs print with
 * apiKey=REDACTED and the artifact stores a length+last4 fingerprint only. The output is
 * self-leak-scanned before exit.
 *
 * Usage:
 *   npx tsx scripts/ops/odds-canary.mjs --sport nfl                      # dry run, 0 credits
 *   npx tsx scripts/ops/odds-canary.mjs --sport nfl --max-credits 5 --authorized
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ODDS_SPORT_KEYS, classifyOddsSecret, normalizeOddsEvent, validateOddsSnapshot } from "../../src/lib/sports/odds/snapshot-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);

const SPORT = arg("--sport");
const MAX_CREDITS = Math.max(1, Number(arg("--max-credits", "5")));
const AUTHORIZED = has("--authorized");
const FLOOR = 50;

if (!SPORT || !ODDS_SPORT_KEYS[SPORT]) {
  console.error(`REFUSED: --sport must be exactly one of ${Object.keys(ODDS_SPORT_KEYS).join("/")} — broad or unknown scopes never run`);
  process.exit(5);
}

const secret = classifyOddsSecret(process.env);
if (secret.state === "BLOCKED_EXTERNAL") { console.log(`BLOCKED_EXTERNAL: ${secret.reason}`); process.exit(3); }
if (secret.state === "CONFIG_INVALID") { console.log(`CONFIG_INVALID: ${secret.reason} (${secret.fingerprint})`); process.exit(4); }

const LOCK = path.join(process.env.TMPDIR ?? "/tmp", "gtp-odds-canary.pid");
if (fs.existsSync(LOCK)) { try { process.kill(Number(fs.readFileSync(LOCK, "utf8")), 0); console.error("REFUSED: another canary holds the lock — one at a time"); process.exit(6); } catch { /* stale */ } }
fs.writeFileSync(LOCK, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(LOCK); } catch { /* gone */ } });

const KEY = process.env.ODDS_API_KEY.trim();
const redact = (u) => u.replace(KEY, "REDACTED");
const call = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const remaining = Number(res.headers.get("x-requests-remaining") ?? NaN);
  const used = Number(res.headers.get("x-requests-last") ?? NaN);
  const body = await res.text();
  return { ok: res.ok, status: res.status, remaining, lastCost: used, body };
};

// Free credit check (0 credits — the provider's index endpoint).
const idx = await call(`https://api.the-odds-api.com/v4/sports/?apiKey=${KEY}`);
if (!idx.ok) { console.log(`SOURCE_STALE: index call failed (${idx.status}) — nothing written, nothing spent`); process.exit(2); }
console.log(`credits remaining: ${idx.remaining} · key ${secret.fingerprint}`);
console.log(`plan: ONE ${SPORT} h2h request (regions=us, markets=h2h) — estimated cost 1 credit, ceiling ${MAX_CREDITS}, floor ${FLOOR}`);

if (!AUTHORIZED) {
  console.log("DRY RUN (default): no odds call made, zero credits spent. Re-run with --authorized after founder approval.");
  process.exit(0);
}
if (!Number.isFinite(idx.remaining) || idx.remaining - 1 < FLOOR) {
  console.log(`REFUSED: remaining ${idx.remaining} would breach the ${FLOOR}-credit floor — the canary never eats the reserve`);
  process.exit(7);
}

const capturedAt = new Date().toISOString();
const requestId = `canary-${SPORT}-${capturedAt.replace(/[:.]/g, "").slice(0, 15)}`;
const url = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT_KEYS[SPORT]}/odds/?regions=us&markets=h2h&oddsFormat=american&apiKey=${KEY}`;
console.log(`authorized call: ${redact(url)}`);
const res = await call(url);
if (!res.ok) { console.log(`SOURCE_STALE: odds call failed (${res.status}) — nothing written; cost ${res.lastCost || 0}`); process.exit(2); }
if (Number.isFinite(res.lastCost) && res.lastCost > MAX_CREDITS) {
  console.log(`ALERT: provider charged ${res.lastCost} > ceiling ${MAX_CREDITS} — snapshot still quarantined for review, record this in the blocker card`);
}

const events = JSON.parse(res.body);
const rows = []; const quarantined = [];
for (const e of events) {
  const out = normalizeOddsEvent(e, { sport: SPORT, capturedAt, requestId });
  rows.push(...out.rows); quarantined.push(...out.quarantined);
}
const artifact = {
  schemaVersion: 1, dataClass: "PRIVATE_RESEARCH", sport: SPORT, capturedAt, requestId,
  keyFingerprint: secret.fingerprint,
  creditsUsed: Number.isFinite(res.lastCost) ? res.lastCost : 1,
  creditsRemaining: res.remaining,
  sourceRows: rows.length + quarantined.length,
  rows, quarantined,
};
const check = validateOddsSnapshot(artifact);
if (!check.valid) { console.log(`CONTRACT REFUSED the snapshot: ${check.errors.join(" | ")} — nothing written`); process.exit(8); }

const dir = path.join(APP, "..", "data", "internal", "research", "odds", SPORT);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${requestId}.json`);
const payload = JSON.stringify(artifact, null, 1);
if (payload.includes(KEY)) { console.error("LEAK GUARD: key found in payload — ABORTED, nothing written"); process.exit(9); }
fs.writeFileSync(file, payload);
console.log(`snapshot: ${path.relative(path.join(APP, ".."), file)} — ${rows.length} rows, ${quarantined.length} quarantined, cost ${artifact.creditsUsed}, remaining ${artifact.creditsRemaining}`);
