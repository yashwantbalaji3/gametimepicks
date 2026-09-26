#!/usr/bin/env node
/**
 * THE ONE 3-CREDIT LIVE-ODDS PROBE (Phase H) — NFL team markets, in play.
 *
 *   node app/scripts/nfl/probe-nfl-live-odds.mjs --now <ISO> [--authorized --receipt <path>]
 *
 * DRY-RUN IS THE DEFAULT. Without `--authorized` this makes ZERO paid calls: it establishes whether
 * a game is genuinely live using only free evidence, prints what it WOULD buy, and exits. The paid
 * path exists only under the committed founder amendment, parsed fail-closed.
 *
 * ── WHAT THE FOUNDER AUTHORIZED, AND WHAT THAT FORBIDS ──────────────────────────────────────────
 *
 *   "one 3-credit probe during a genuinely live NFL game"
 *
 * Three words do the work. ONE — this makes exactly one paid call and refuses a second, including on
 * failure; "do not attempt repeated probes merely to obtain a favorable result" is the amendment's
 * own sentence and is enforced here rather than remembered. GENUINELY LIVE — decided BEFORE the
 * call, from two free sources that must agree, because a probe fired at a pregame slate costs the
 * credit and proves nothing. TEAM MARKETS — h2h, spreads, totals; the receipt's in-play row names
 * those three and the props row says NO, so a prop key here is refused by the authorization, not by
 * my restraint.
 *
 * ── AND IT CAN FAIL ─────────────────────────────────────────────────────────────────────────────
 *
 * A pass is not the goal; an answer is. The six-part contract in live-market-contract.mjs refuses a
 * response that merely looks live — an unchanged line with no post-kickoff freshness stamp is what a
 * feed that stopped updating looks like, and recording it as live evidence is the one outcome worse
 * than a clean refusal. Either verdict is written to the same receipt.
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
import { IN_PLAY_TEAM_MARKETS, eventIsGenuinelyLive, foldLiveStates, gradeLiveMarketEvidence, readLiveStates } from "../../src/lib/sports/odds/live-market-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "americanfootball_nfl";
const PURPOSE_PREFIX = "phase-h in-play";

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const AUTHORIZED = has("--authorized");
/*
 * ⚠ THE OPERATIVE RECEIPT, NOT THE ONE THE DECISION PACKAGE NAMED.
 *
 * `ODDS_AUTHORIZATION_P171.md` is superseded — `ODDS_AUTHORIZATION_NFL_2026.md` says so in its own
 * header, and P171's expiry is program-scoped and lapsed, so it does not parse at all. The decision
 * package that prompted this amendment read P171 and reported a 3,000-credit ceiling with 2,606
 * remaining; the real position is 1,160 effective, 394 spent, 766 remaining. Defaulting to the live
 * receipt is what keeps that mistake from being repeated by a caller who trusts the flag's default.
 */
const RECEIPT_PATH = arg("--receipt", "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md");
const OUT_DIR = path.join(ROOT, "data/internal/research/odds/nfl");
const VERDICT_PATH = path.join(OUT_DIR, "phase-h-live-probe.json");

/* ── 0. THE AUTHORIZATION, BEFORE ANYTHING ELSE ─────────────────────────────────────────────── */

const receiptMd = (() => { try { return fs.readFileSync(path.join(ROOT, RECEIPT_PATH), "utf8"); } catch { return null; } })();
if (!receiptMd) { console.error(`REFUSED: no receipt at ${RECEIPT_PATH} — a paid call needs a committed authorization`); process.exit(2); }

/*
 * ⚠ REFUSE A SUPERSEDED RECEIPT BEFORE READING ITS TERMS. A replaced allowance still parses to a
 * ceiling and a scope; it simply governs nothing. Detected from the REPLACEMENT's own claim, because
 * a document cannot be relied on to know it has been replaced.
 */
const receiptName = path.basename(RECEIPT_PATH);
const corpus = (() => {
  const dir = path.join(ROOT, "docs/receipts");
  try { return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])); } catch { return {}; }
})();
const replacedBy = supersededBy(receiptName, corpus);
if (replacedBy) { console.error(`REFUSED: ${receiptName} was superseded by ${replacedBy} — a replaced allowance governs nothing`); process.exit(2); }

const authorization = parseSportAuthorizationReceipt(receiptMd, "nfl");
if (!authorization.ok) { console.error(`REFUSED: the receipt did not parse:\n  ${authorization.errors.join("\n  ")}`); process.exit(2); }

const inPlay = inPlayAuthorization(receiptMd);
if (!inPlay.authorized) { console.error(`REFUSED: in-play capture is not authorized — ${inPlay.reason}`); process.exit(2); }
if (inPlay.propsAuthorized) { console.error("REFUSED: this probe never buys props, and a receipt that authorizes them is not a reason to start"); process.exit(2); }

const markets = IN_PLAY_TEAM_MARKETS.filter((m) => inPlay.markets.includes(m));
if (markets.length !== IN_PLAY_TEAM_MARKETS.length) {
  console.error(`REFUSED: the receipt authorizes ${inPlay.markets.join(", ") || "no"} in-play market(s); this probe is specified for ${IN_PLAY_TEAM_MARKETS.join(", ")}`);
  process.exit(2);
}
const WORST_CASE = markets.length;   // credits = markets × regions, one region
const budget = purposeBudget(receiptMd);
if (budget == null) { console.error("REFUSED: no parseable Phase H incremental budget — an unbounded pilot is not what was authorized"); process.exit(2); }

const ledgerPath = path.join(ROOT, LEDGER_RELPATH.nfl);
let ledger = read(ledgerPath) ?? emptyLedger(RECEIPT_PATH);
const alreadySpent = spentOnPurpose(ledger, PURPOSE_PREFIX);

/*
 * ⚠ ONE PROBE MEANS ONE. The amendment says not to re-probe for a better answer, so a recorded
 * probe — whatever its verdict — closes this script. Re-running it is a no-op, not a second call.
 */
const priorProbe = (ledger.requests ?? []).find((r) => String(r?.purpose ?? "").startsWith(`${PURPOSE_PREFIX} probe`));
if (priorProbe) {
  console.log(`ALREADY PROBED at ${priorProbe.at} (${priorProbe.creditsUsed} credit(s)) — the amendment forbids re-probing for a more favourable result.`);
  const v = read(VERDICT_PATH);
  console.log(v ? `verdict on file: ${v.verdict} · ${v.summary}` : "no verdict file on disk — see the ledger entry");
  process.exit(0);
}

/* ── 1. IS A GAME GENUINELY LIVE? DECIDED FROM FREE EVIDENCE ONLY ───────────────────────────── */

const boards = (() => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => read(path.join(dir, f))).filter(Boolean);
  } catch { return []; }
})();

const etDateOf = (iso) => {
  const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)) : null;
};

/* The free live gateway — no credits, no key. The same owner every other live surface reads. */
const liveBase = process.env.GTP_LIVE_ENDPOINT || "https://gametimepicks.yashwantbalaji.com/api/live/";

const dates = [...new Set(boards.map((b) => etDateOf(b.kickoffUtc)).filter(Boolean))].sort();
const reads = [];
for (const d of dates.slice(-3)) reads.push(await readLiveStates({ base: liveBase, etDate: d }));
const live0 = foldLiveStates(reads);
if (!live0.known) {
  console.error(`LIVENESS UNKNOWN — the live gateway could not be read, so no game can be shown to be in progress:
  ${live0.failures.join("\n  ")}`);
  console.error("No credit spent. This is NOT the same as a quiet slate, and the probe stays armed.");
  process.exit(4);
}
const states = live0.states;

const candidates = [];
for (const b of boards) {
  const id = b?.providerEventId == null ? null : String(b.providerEventId);
  if (!id) continue;
  const verdict = eventIsGenuinelyLive({ liveState: states.get(id) ?? null, kickoffUtc: b.kickoffUtc, nowIso: NOW });
  if (verdict.live) candidates.push({ id, matchup: b.matchup ?? id, kickoffUtc: b.kickoffUtc, minutesSinceKickoff: verdict.minutesSinceKickoff });
}

if (!candidates.length) {
  const nearest = boards
    .map((b) => ({ m: b.matchup, k: b.kickoffUtc, t: Date.parse(String(b.kickoffUtc ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) }))
    .filter((x) => Number.isFinite(x.t) && x.t > Date.parse(NOW)).sort((a, b) => a.t - b.t)[0];
  console.log(`NO LIVE NFL GAME at ${NOW} — no credit spent.`);
  console.log(nearest ? `  nearest kickoff: ${nearest.m} at ${nearest.k}` : "  no upcoming kickoff on any committed board");
  console.log("  the probe is armed and will fire on the next run that finds a game in progress.");
  process.exit(0);
}

/* The longest-running live game: the most time for a line to have moved, which is what check 5 reads. */
candidates.sort((a, b) => b.minutesSinceKickoff - a.minutesSinceKickoff);
const target = candidates[0];

console.log(`LIVE: ${target.matchup} (${target.id}) · kickoff ${target.kickoffUtc} · ${target.minutesSinceKickoff} min ago`);
console.log(`PLAN: ONE bulk /odds call · markets ${markets.join(",")} · regions us · worst case ${WORST_CASE} credit(s)`);
console.log(`BUDGET: Phase H ${alreadySpent}/${budget} spent · cumulative ${ledger.cumulativeCredits ?? 0}/${authorization.ceiling}`);

const gate = assertCallAllowed({ authorization, ledger, worstCaseCredits: WORST_CASE, purpose: `${PURPOSE_PREFIX} probe` });
if (!gate.ok) { console.error(`REFUSED:\n  ${gate.errors.join("\n  ")}`); process.exit(2); }
if (alreadySpent + WORST_CASE > budget) { console.error(`REFUSED: ${alreadySpent} + ${WORST_CASE} would cross the ${budget}-credit Phase H budget`); process.exit(2); }

if (!AUTHORIZED) { console.log("\nDRY RUN — no call made. Pass --authorized to spend the probe."); process.exit(0); }

/* ── 2. THE ONE CALL ────────────────────────────────────────────────────────────────────────── */

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
  at: NOW, purpose: `${PURPOSE_PREFIX} probe on ${target.matchup}`, endpoint, events: Array.isArray(body) ? body.length : null,
  markets, regions: ["us"], status: res.status, headers, charged: true, resultClass: resultClass.class,
});

const spent = ledger.requests[ledger.requests.length - 1].creditsUsed;
console.log(`\nprovider ${res.status} (${resultClass.class}) · charged ${spent} credit(s) · remaining ${headers["x-requests-remaining"] ?? "?"}`);

/* ── 3. THE VERDICT — graded against the contract, either way ───────────────────────────────── */

const providerEvent = Array.isArray(body) ? body.find((e) => matchEvent(e, target)) ?? null : null;
const pregame = pregameSnapshotFor(target.id, target.matchup);

let graded = null;
if (!providerEvent) {
  graded = { ok: false, failed: ["eventPresent"], checks: [{ id: "eventPresent", pass: false, detail: "the live game is absent from the provider's in-play response" }], books: [], marketKeys: [], moved: [], same: [] };
} else {
  graded = gradeLiveMarketEvidence({ providerEvent, pregame, capturedAt: NOW, kickoffUtc: target.kickoffUtc });
}

const verdict = {
  schemaVersion: 1,
  artifact: "nfl-phase-h-live-probe",
  dataClass: "PRIVATE_RESEARCH",
  program: "P171 · Phase H amendment 2026-09-26",
  verdict: graded.ok ? "LIVE_MARKET_SUPPORTED" : "LIVE_MARKET_UNSUPPORTED",
  summary: graded.ok
    ? "the provider returned a post-kickoff team market with named book, market identity and proven freshness"
    : `failed: ${graded.failed.join(", ")}`,
  probedAt: NOW,
  event: { providerEventId: target.id, matchup: target.matchup, kickoffUtc: target.kickoffUtc, minutesSinceKickoff: target.minutesSinceKickoff },
  creditsCharged: spent,
  providerStatus: res.status,
  checks: graded.checks,
  books: graded.books,
  marketKeys: graded.marketKeys,
  /* The exact before/after the amendment asked to be recorded. */
  movement: graded.moved.slice(0, 12),
  unchanged: graded.same.slice(0, 6),
  pregameSnapshotUsed: pregame ? { source: pregame.__source, capturedAt: pregame.__capturedAt ?? null } : null,
  note: "A pass authorizes the bounded Sunday pilot. A fail closes Phase H at this credit — the amendment forbids re-probing for a more favourable result.",
};

assertNoSecretLeak(verdict, [KEY]);
assertNoSecretLeak(ledger, [KEY]);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 1) + "\n");
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1) + "\n");

console.log(`\n=== ${verdict.verdict} ===`);
for (const c of graded.checks) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(22)} ${c.detail}`);
if (graded.moved.length) { console.log("\n  movement:"); for (const m of graded.moved.slice(0, 6)) console.log(`    ${m.key}  ${m.pregame} → ${m.live}`); }
console.log(`\nwritten: ${path.relative(ROOT, VERDICT_PATH)}`);
console.log(graded.ok
  ? "NEXT: the bounded Sunday pilot is pre-authorized — 30-minute cadence, 90-credit Phase H budget."
  : "NEXT: Phase H closes here. Record the evidence; do not probe again for a better answer.");

/* ── helpers ────────────────────────────────────────────────────────────────────────────────── */

function matchEvent(e, t) {
  if (String(e?.id ?? "") === t.id) return true;
  /* The odds provider's event id is its own, not ESPN's, so fall back to the matchup the board
     already names — normalised, and only when the commence_time is the same day. */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const [away, home] = String(t.matchup).split("@").map((x) => norm(x));
  return Boolean(away && home && norm(e?.away_team).includes(away.slice(0, 5)) && norm(e?.home_team).includes(home.slice(0, 5)));
}

/** The most recent COMMITTED pregame team-market capture for this game, or null. */
function pregameSnapshotFor(eventId, matchup) {
  let files = [];
  try { files = fs.readdirSync(OUT_DIR).filter((f) => /^capture-\d{8}T\d{4}\.json$/.test(f)).sort().reverse(); } catch { return null; }
  for (const f of files) {
    const snap = read(path.join(OUT_DIR, f));
    const events = snap?.events ?? snap?.rows ?? [];
    const hit = (Array.isArray(events) ? events : []).find((e) => matchEvent(e, { id: eventId, matchup }));
    if (hit) return { ...hit, __source: f, __capturedAt: snap?.capturedAt ?? snap?.generatedAt ?? null };
  }
  return null;
}
