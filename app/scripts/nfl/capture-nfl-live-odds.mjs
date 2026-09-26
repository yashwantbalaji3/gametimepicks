#!/usr/bin/env node
/**
 * THE BOUNDED LIVE-ODDS PILOT (Phase H) — NFL team markets, in play, ~30-minute cadence.
 *
 *   node app/scripts/nfl/capture-nfl-live-odds.mjs --now <ISO> [--authorized] [--write]
 *
 * DRY-RUN IS THE DEFAULT. Without `--authorized` this makes ZERO paid calls.
 *
 * ── IT CANNOT START UNTIL THE PROBE HAS PASSED ──────────────────────────────────────────────────
 *
 * The founder pre-authorized this pilot "only if the 3-credit probe proves that the provider is
 * actually returning valid post-kickoff market movement". So the probe's committed verdict is a
 * precondition read from disk, not a memory: no verdict file, or a verdict of anything other than
 * LIVE_MARKET_SUPPORTED, and this refuses without spending. That is what makes "if the probe fails,
 * spend no more than the 3 credits" a property of the code rather than of my restraint.
 *
 * ── THREE BOUNDS, ALL MECHANICAL ────────────────────────────────────────────────────────────────
 *
 *   90 credits    the Phase H budget, summed from the ledger's own records for this purpose
 *   1,160         the receipt's cumulative ceiling, unchanged by the amendment
 *   ~30 minutes   a call is refused if the last one was too recent, so a dense cron cannot overspend
 *
 * The cadence bound is the one that matters operationally: `nfl-live-props.yml` runs every fifteen
 * minutes, and scheduled delivery in this repository is famously late and bursty. Sizing the spend
 * by how often the cron is SUPPOSED to fire would be sizing it by a number this repo has measured to
 * be wrong by up to five hours. So the interval is enforced here, against the last recorded call.
 *
 * ── AND THE MARKET IS A THIRD LAYER, NEVER THE FROZEN ONE ───────────────────────────────────────
 *
 * What this writes is CURRENT sportsbook state, stamped with its own capture instant and the book's
 * own last_update. It never touches the frozen pregame block: not the line, not the book, not the
 * projection, not the original capture timestamp. A reader must be able to see that a line moved
 * without ever being told we saw the new one before kickoff.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyOddsSecret } from "../../src/lib/sports/odds/snapshot-contract.mjs";
import {
  assertCallAllowed, assertNoSecretLeak, classifyProviderResult, emptyLedger,
  inPlayAuthorization, parseSportAuthorizationReceipt, purposeBudget, recordRequest, spentOnPurpose, supersededBy,
  LEDGER_RELPATH,
} from "../../src/lib/sports/odds/p171-authorization.mjs";
import { IN_PLAY_TEAM_MARKETS, eventIsGenuinelyLive, foldLiveStates, linesOf, readLiveStates, providerEventMatches } from "../../src/lib/sports/odds/live-market-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "americanfootball_nfl";
const PURPOSE_PREFIX = "phase-h in-play";
const MIN_INTERVAL_MS = 28 * 60_000;   // ~30 minutes, with two minutes of slack for cron jitter

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const AUTHORIZED = has("--authorized");
const WRITE = has("--write");
const RECEIPT_PATH = arg("--receipt", "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md");
const OUT_DIR = path.join(ROOT, "data/internal/research/odds/nfl");
const PUBLIC_DIR = path.join(APP, "public/data/nfl/live-markets");
const VERDICT_PATH = path.join(OUT_DIR, "phase-h-live-probe.json");

/* ── 0. THE PROBE'S VERDICT IS THE PRECONDITION ─────────────────────────────────────────────── */

const probe = read(VERDICT_PATH);
if (!probe) { console.log("NOT STARTED: no probe verdict on disk — the pilot begins only after the probe has run."); process.exit(0); }
if (probe.verdict !== "LIVE_MARKET_SUPPORTED") {
  console.log(`CLOSED: the probe returned ${probe.verdict} — ${probe.summary}`);
  console.log("Phase H ends here; the amendment forbids spending further to obtain a better answer.");
  process.exit(0);
}

/* ── 1. THE AUTHORIZATION ───────────────────────────────────────────────────────────────────── */

const receiptMd = (() => { try { return fs.readFileSync(path.join(ROOT, RECEIPT_PATH), "utf8"); } catch { return null; } })();
if (!receiptMd) { console.error(`REFUSED: no receipt at ${RECEIPT_PATH}`); process.exit(2); }

const replacedBy = supersededBy(path.basename(RECEIPT_PATH), (() => {
  const dir = path.join(ROOT, "docs/receipts");
  try { return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])); } catch { return {}; }
})());
if (replacedBy) { console.error(`REFUSED: ${path.basename(RECEIPT_PATH)} was superseded by ${replacedBy}`); process.exit(2); }

const authorization = parseSportAuthorizationReceipt(receiptMd, "nfl");
if (!authorization.ok) { console.error(`REFUSED: the receipt did not parse:\n  ${authorization.errors.join("\n  ")}`); process.exit(2); }

const inPlay = inPlayAuthorization(receiptMd);
if (!inPlay.authorized) { console.error(`REFUSED: in-play capture is not authorized — ${inPlay.reason}`); process.exit(2); }
if (inPlay.propsAuthorized) { console.error("REFUSED: this pilot never buys props"); process.exit(2); }

const markets = IN_PLAY_TEAM_MARKETS.filter((m) => inPlay.markets.includes(m));
if (markets.length !== IN_PLAY_TEAM_MARKETS.length) { console.error(`REFUSED: the receipt authorizes ${inPlay.markets.join(", ") || "no"} in-play market(s)`); process.exit(2); }
const WORST_CASE = markets.length;

const budget = purposeBudget(receiptMd);
if (budget == null) { console.error("REFUSED: no parseable Phase H budget — an unbounded pilot is not what was authorized"); process.exit(2); }

const ledgerPath = path.join(ROOT, LEDGER_RELPATH.nfl);
let ledger = read(ledgerPath) ?? emptyLedger(RECEIPT_PATH);
const spent = spentOnPurpose(ledger, PURPOSE_PREFIX);

if (spent + WORST_CASE > budget) {
  console.log(`BUDGET REACHED: ${spent} of ${budget} Phase H credits spent — a further call would cross it. Stopping cleanly.`);
  process.exit(0);
}

/*
 * ⚠ THE CADENCE IS ENFORCED AGAINST THE LAST RECORDED CALL, NOT AGAINST THE CRON.
 *
 * The workflow that hosts this runs every fifteen minutes, and this repository has measured its own
 * scheduled delivery at 1h40m to 4h55m late — bursty, not punctual. A pilot sized by how often the
 * cron is SUPPOSED to fire would be sized by a number known to be wrong.
 */
const lastCall = (ledger.requests ?? []).filter((r) => String(r?.purpose ?? "").startsWith(`${PURPOSE_PREFIX} pilot`)).pop();
if (lastCall) {
  const gap = Date.parse(NOW) - Date.parse(lastCall.at);
  if (Number.isFinite(gap) && gap < MIN_INTERVAL_MS) {
    console.log(`TOO SOON: ${Math.round(gap / 60000)} min since the last live capture (minimum ${Math.round(MIN_INTERVAL_MS / 60000)}). No call.`);
    process.exit(0);
  }
}

/* ── 2. IS ANYTHING LIVE? FREE EVIDENCE ONLY ────────────────────────────────────────────────── */

const boards = (() => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  try { return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => read(path.join(dir, f))).filter(Boolean); } catch { return []; }
})();

const etDateOf = (iso) => {
  const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)) : null;
};

const liveBase = process.env.GTP_LIVE_ENDPOINT || "https://gametimepicks.yashwantbalaji.com/api/live/";

const reads = [];
for (const d of [...new Set(boards.map((b) => etDateOf(b.kickoffUtc)).filter(Boolean))].sort().slice(-3)) {
  reads.push(await readLiveStates({ base: liveBase, etDate: d }));
}
const live0 = foldLiveStates(reads);
if (!live0.known) {
  console.error(`LIVENESS UNKNOWN — the live gateway could not be read:
  ${live0.failures.join("\n  ")}`);
  console.error("No credit spent. This is NOT the same as a slate with nothing in play.");
  process.exit(4);
}
const states = live0.states;

const live = boards
  .map((b) => ({ b, v: eventIsGenuinelyLive({ liveState: states.get(String(b.providerEventId)) ?? null, kickoffUtc: b.kickoffUtc, nowIso: NOW }) }))
  .filter((x) => x.v.live)
  .map((x) => ({ id: String(x.b.providerEventId), matchup: x.b.matchup ?? String(x.b.providerEventId), kickoffUtc: x.b.kickoffUtc }));

/*
 * ⚠ A GAME THAT HAS GONE TERMINAL LEAVES THE LOOP. `eventIsGenuinelyLive` already refuses FINAL,
 * so a slate empties itself as games end and the last capture of the day costs nothing at all.
 */
if (!live.length) { console.log(`no NFL game in play at ${NOW} — no call (Phase H ${spent}/${budget})`); process.exit(0); }

console.log(`LIVE: ${live.length} game(s) — ${live.map((g) => g.matchup).join(", ")}`);
console.log(`PLAN: ONE bulk /odds · markets ${markets.join(",")} · worst case ${WORST_CASE} · Phase H ${spent}/${budget} · cumulative ${ledger.cumulativeCredits ?? 0}/${authorization.ceiling}`);

const gate = assertCallAllowed({ authorization, ledger, worstCaseCredits: WORST_CASE, purpose: `${PURPOSE_PREFIX} pilot` });
if (!gate.ok) { console.error(`REFUSED:\n  ${gate.errors.join("\n  ")}`); process.exit(2); }

if (!AUTHORIZED) { console.log("\nDRY RUN — no call made."); process.exit(0); }

/* ── 3. ONE BULK CALL, COVERING EVERY LIVE GAME AT ONCE ─────────────────────────────────────── */

const secretState = classifyOddsSecret(process.env);
if (secretState.state !== "PRESENT") { console.error(`${secretState.state}: ${secretState.reason} — no key, no call`); process.exit(3); }
const KEY = process.env.ODDS_API_KEY.trim();

const endpoint = `/sports/${SPORT_KEY}/odds/?regions=us&oddsFormat=american&markets=${markets.join(",")}`;
const res = await fetch(`${BASE}${endpoint}&apiKey=${KEY}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
const headers = {
  "x-requests-last": res.headers.get("x-requests-last"),
  "x-requests-used": res.headers.get("x-requests-used"),
  "x-requests-remaining": res.headers.get("x-requests-remaining"),
};
let body = null;
try { body = await res.json(); } catch { body = null; }

const resultClass = classifyProviderResult({ status: res.status, body });
ledger = recordRequest(ledger, {
  at: NOW, purpose: `${PURPOSE_PREFIX} pilot (${live.length} live game(s))`, endpoint,
  events: Array.isArray(body) ? body.length : null, markets, regions: ["us"],
  status: res.status, headers, charged: true, resultClass: resultClass.class,
});
const charged = ledger.requests[ledger.requests.length - 1].creditsUsed;
console.log(`provider ${res.status} (${resultClass.class}) · charged ${charged} · Phase H now ${spent + charged}/${budget}`);

/* ── 4. THE THIRD LAYER — current market, stamped, never the frozen one ─────────────────────── */

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const rows = [];
for (const g of live) {
  /* One shared join, in live-market-contract.mjs. The local copy this replaced split the label on
     "@", so a neutral-site "BAL VS DAL" silently failed to match — and, lacking the probe's
     both-halves guard, a label with no separator at all would have thrown after the credits were
     charged. */
  const ev = (Array.isArray(body) ? body : []).find((e) => providerEventMatches(e, { id: g.id, matchup: g.matchup }));
  if (!ev) { rows.push({ providerEventId: g.id, matchup: g.matchup, state: "NOT_OFFERED_LIVE", note: "the provider did not return this in-play game" }); continue; }
  const lines = [...linesOf(ev)].map(([key, value]) => { const [book, market, outcome] = key.split("|"); return { book, market, outcome, value }; });
  rows.push({
    providerEventId: g.id, matchup: g.matchup, kickoffUtc: g.kickoffUtc,
    state: lines.length ? "LIVE_MARKET" : "NO_LINES",
    /* The provider's OWN freshness stamp, per book — never ours, and never inferred. */
    books: (ev.bookmakers ?? []).map((b) => ({ key: b.key, title: b.title, lastUpdate: b.last_update ?? null })),
    lines,
  });
}

const artifact = {
  schemaVersion: 1,
  artifact: "nfl-live-markets",
  dataClass: "PUBLIC_DERIVED",
  /*
   * ⚠ THE LAYER THIS IS. Not a forecast, and not the frozen pregame line — the CURRENT sportsbook
   * market, stamped with its own capture instant. A consumer that renders this where "the line you
   * were shown before kickoff" is claimed has merged two layers the receipt requires kept apart.
   */
  layer: "CURRENT_SPORTSBOOK_MARKET",
  disclaimer: "Current in-play sportsbook prices. NOT the frozen pregame line, and not a GameTimePicks forecast.",
  capturedAt: NOW,
  source: "the-odds-api /v4 bulk odds (us region)",
  markets,
  rows,
  generatedAt: NOW,
};

assertNoSecretLeak(artifact, [KEY]);
assertNoSecretLeak(ledger, [KEY]);

if (WRITE) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, "latest.json"), JSON.stringify(artifact, null, 1) + "\n");
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, path.join(PUBLIC_DIR, "latest.json"))} · ${rows.filter((r) => r.state === "LIVE_MARKET").length} live game(s) priced`);
} else {
  console.log(`(no --write) would write ${rows.length} row(s)`);
}
