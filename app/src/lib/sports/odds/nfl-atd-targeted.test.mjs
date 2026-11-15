/**
 * Targeted anytime-TD lane — executed against recorded-shape fixtures only. No network: every `get` is a stub.
 * Run: npx tsx --test src/lib/sports/odds/nfl-atd-targeted.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ATD_MARKET, atdFingerprint, planTargetedAtd, readAtdAuthorization, reconcileCallCost,
  normalizeAtdEventResponse, executeAtdRun, buildAtdDisplayFile, buildAtdPrivateCapture,
} from "./nfl-atd-targeted.mjs";
import crypto from "node:crypto";
import { emptyLedger, recordRequest } from "./p171-authorization.mjs";
import { nflOffersFromCapture } from "../nfl/prop-line-adapter.mjs";
import { buildNflLinePublication } from "../nfl/line-publication-build.mjs";
import { nflLinesAad, validateNflLineArtifact } from "../nfl/public-line-records.mjs";
import { encryptDisplayArtifact, decryptDisplayArtifact } from "../../odds/display-crypto.mjs";
import { latestAtdDisplayFile } from "../nfl/atd-prices.mjs";
import { buildPlayerRegistry } from "../nfl/player-identity.mjs";
import { main as captureMain } from "../../../../scripts/nfl/capture-nfl-atd-targeted.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), "utf8"));
const SCHEDULE = fx("nfl-atd-schedule.json");
const ROSTERS = fx("nfl-atd-rosters.json");
const INDEX = fx("nfl-atd-events-index.json");
const SF_DAL = fx("nfl-atd-event-odds-sf-dal.json");
const NO_MARKET = fx("nfl-atd-event-odds-no-market.json");
const IDENTITY_CASES = fx("nfl-atd-event-odds-identity-cases.json");
const REGISTRY = buildPlayerRegistry([ROSTERS]);
const NOW = "2026-11-15T18:30:00Z";
const SFDAL = "401873063";
const PITCIN = "401873064";

const receipt = ({ ceiling = 10, expiry = "the ceiling", props = "`player_anytime_td`" } = {}) => [
  "# Test receipt",
  "NFL-only. Provider key `americanfootball_nfl`.",
  "| Term | Value |",
  "|---|---|",
  `| Cumulative ceiling | **${ceiling} credits** |`,
  "| Remaining-balance floor | **NONE** |",
  `| Expiry | ${expiry} |`,
  "| Discipline | do not retry blindly |",
  `| Prop markets authorized | ${props} |`,
].join("\n");

const headers = (last, remaining = 18000) => ({ "x-requests-last": last == null ? null : String(last), "x-requests-used": "100", "x-requests-remaining": String(remaining) });
const okAuth = (ledger = emptyLedger("t"), maxCredits = 2, opts = {}) => readAtdAuthorization({ receiptText: receipt(opts), nowIso: NOW, ledger, maxCredits });
const plan2 = (maxCredits = 2, ids = [SFDAL, PITCIN]) => planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: ids, nowIso: NOW, maxCredits });

/** A provider stub: routes by path, counts calls, never touches the network. */
function stubProvider(routes) {
  const calls = [];
  const get = async (p) => {
    calls.push(p);
    for (const [re, resp] of routes) if (re.test(p)) return typeof resp === "function" ? resp(p) : resp;
    throw new Error(`unrouted call ${p}`);
  };
  return { get, calls };
}
const standardRoutes = (sfdal = { status: 200, headers: headers(1), body: SF_DAL }, pitcin = { status: 200, headers: headers(1), body: NO_MARKET }) => [
  [/\/events$/, { status: 200, headers: headers(0), body: INDEX }],
  [/events\/odds-sf-dal\/odds/, sfdal],
  [/events\/odds-pit-cin\/odds/, pitcin],
];
const run = (over = {}) => {
  const ledger = over.ledger ?? emptyLedger("t");
  const plan = over.plan ?? plan2(over.maxCredits ?? 2, over.ids);
  const auth = over.auth ?? okAuth(ledger, plan.maxCredits);
  return executeAtdRun({ plan, authorization: auth.authorization, ledger, nowIso: NOW, get: over.get, scheduleRows: SCHEDULE.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED"), registry: REGISTRY, onLedger: over.onLedger });
};

// ---------------------------------------------------------------- plan
test("plan: two explicit events, one market, us → worst case 2; within max-credits 2", () => {
  const p = plan2();
  assert.equal(p.ok, true, p.errors.join("; "));
  assert.deepEqual(p.targets.map((t) => t.providerEventId), [SFDAL, PITCIN]);
  assert.deepEqual(p.markets, [ATD_MARKET]);
  assert.deepEqual(p.regions, ["us"]);
  assert.equal(p.worstCase, 2);
  assert.equal(p.sportKey, "americanfootball_nfl");
});
test("plan: worst case above max-credits refuses the whole run", () => {
  const p = plan2(1);
  assert.equal(p.ok, false);
  assert.match(p.errors.join(";"), /worst case .* = 2 credits exceeds --max-credits 1/);
});
test("plan: unknown id, duplicate, empty list, non-integer budget and extra region are all refused", () => {
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: ["999"], nowIso: NOW, maxCredits: 2 }).errors.join(";"), /not in the committed NFL schedule/);
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: [SFDAL, `nfl-${SFDAL}`], nowIso: NOW, maxCredits: 2 }).errors.join(";"), /listed twice/);
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: [], nowIso: NOW, maxCredits: 2 }).errors.join(";"), /explicit, non-empty list/);
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: [SFDAL], nowIso: NOW, maxCredits: 0 }).errors.join(";"), /integer ≥ 1/);
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: [SFDAL], nowIso: NOW, maxCredits: 1.5 }).errors.join(";"), /integer ≥ 1/);
  assert.match(planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: [SFDAL], nowIso: NOW, maxCredits: 2, regions: ["us", "us2"] }).errors.join(";"), /exactly \["us"\]/);
});
test("plan: a started event and a non-scheduled event are refused", () => {
  const started = planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: ["401873054"], nowIso: NOW, maxCredits: 2 });
  assert.equal(started.ok, false);
  assert.match(started.errors.join(";"), /kicked off .* a started event is refused/);
  const final = planTargetedAtd({ scheduleRows: SCHEDULE.rows, eventIds: ["401873040"], nowIso: NOW, maxCredits: 2 });
  assert.match(final.errors.join(";"), /STATUS_FINAL, not STATUS_SCHEDULED/);
});

// ---------------------------------------------------------------- authorization
test("receipt: a valid receipt naming player_anytime_td with headroom passes", () => {
  const a = okAuth();
  assert.equal(a.ok, true, a.errors.join("; "));
  assert.equal(a.remaining, 10);
});
test("receipt: expired (dated, past) refuses; dated in the future passes", () => {
  const expired = okAuth(emptyLedger("t"), 2, { expiry: "the ceiling or 2026-11-10 23:59 ET, whichever first" });
  assert.equal(expired.ok, false);
  assert.match(expired.errors.join(";"), /expired at the end of 2026-11-10/);
  assert.equal(expired.authorization.ok, false);
  const current = okAuth(emptyLedger("t"), 2, { expiry: "the ceiling or 2026-11-20 23:59 ET, whichever first" });
  assert.equal(current.ok, true, current.errors.join("; "));
  const program = okAuth(emptyLedger("t"), 2, { expiry: "Program 171 close or the ceiling" });
  assert.equal(program.ok, false);
});
test("receipt: one without player_anytime_td refuses (the market row is a control)", () => {
  const a = okAuth(emptyLedger("t"), 2, { props: "`player_pass_yds`, `player_rush_yds`" });
  assert.equal(a.ok, false);
  assert.match(a.errors.join(";"), /does not authorize player_anytime_td/);
  const none = okAuth(emptyLedger("t"), 2, { props: "none" });
  assert.match(none.errors.join(";"), /no prop market at all/);
  assert.equal(readAtdAuthorization({ receiptText: null, nowIso: NOW, ledger: emptyLedger("t"), maxCredits: 2 }).ok, false);
});
test("budget: ceiling remaining < 1 refuses; max-credits above what is left refuses", () => {
  const spent = { ...emptyLedger("t"), cumulativeCredits: 10 };
  const a = okAuth(spent, 1);
  assert.equal(a.ok, false);
  assert.match(a.errors.join(";"), /0 left, not even one credit/);
  const nine = { ...emptyLedger("t"), cumulativeCredits: 9 };
  const b = okAuth(nine, 2);
  assert.equal(b.ok, false);
  assert.match(b.errors.join(";"), /--max-credits 2 exceeds the 1 credit\(s\) left/);
});
test("budget: the run refuses to start on a refused authorization", async () => {
  const { get, calls } = stubProvider(standardRoutes());
  const spent = { ...emptyLedger("t"), cumulativeCredits: 10 };
  await assert.rejects(() => run({ get, ledger: spent, auth: okAuth(spent, 2) }), /authorization did not pass/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- reconciliation
test("reconcile: header above plan is an overrun; missing header cannot be shown within plan", () => {
  assert.equal(reconcileCallCost({ headers: headers(1), plannedWorstCase: 1 }).ok, true);
  assert.equal(reconcileCallCost({ headers: headers(0), plannedWorstCase: 1 }).ok, true);
  assert.match(reconcileCallCost({ headers: headers(5), plannedWorstCase: 1 }).reason, /OVERRUN/);
  assert.equal(reconcileCallCost({ headers: headers(null), plannedWorstCase: 1 }).ok, false);
});

// ---------------------------------------------------------------- normalization
const norm = () => normalizeAtdEventResponse({ body: SF_DAL, registry: REGISTRY, teamAbbrs: ["DAL", "SF"], capturedAt: NOW, canonicalEventId: `nfl-${SFDAL}`, oddsEventId: "odds-sf-dal" });
test("normalize: only Yes / single-sided outcomes become prices; No is ignored, never inverted", () => {
  const n = norm();
  assert.equal(n.ignoredNoOutcomes, 1);
  const cmc = n.rows.filter((r) => r.playerId === "nfl-athlete-3117251");
  assert.deepEqual(cmc.map((r) => [r.bookmaker, r.price]).sort(), [["draftkings", -175], ["fanduel", -180]]);
  assert.ok(!n.rows.some((r) => r.price === 135), "the No price must never appear as a price");
  const mgm = n.rows.find((r) => r.bookmaker === "betmgm");
  assert.equal(mgm.playerId, "nfl-athlete-3040151", "single-sided label shape resolves the label as the player");
  assert.ok(n.quarantined.some((q) => q.name === "George Kittle" && /unrecognised anytime-TD side "Over"/.test(q.reason)));
  for (const r of n.rows) { assert.equal(r.capturedAt, NOW); assert.ok(r.sourceAsOf); assert.equal(r.canonicalEventId, `nfl-${SFDAL}`); }
});
test("identity: opposing-team player with the same surname resolves to the right team only", () => {
  const n = norm();
  const jw = n.rows.find((r) => r.name === "Javonte Williams");
  assert.equal(jw.playerId, "nfl-athlete-4361579");
  assert.equal(jw.teamAbbr, "DAL");
  assert.ok(!n.rows.some((r) => r.name === "Williams"), "a bare surname is never resolved");
  assert.ok(n.quarantined.some((q) => q.name === "Williams" && /unresolved/.test(q.reason)));
});
test("identity: wrong / ambiguous player labels quarantine, never pick", () => {
  const n = norm();
  const reason = (name) => n.quarantined.find((q) => q.name === name)?.reason;
  assert.match(reason("Sam Same"), /ambiguous across both rosters/);
  assert.match(reason("Marvin Twin"), /ambiguous/);
  assert.match(reason("Ghost Player"), /unresolved against either roster/);
  for (const name of ["Sam Same", "Marvin Twin", "Ghost Player"]) assert.ok(!n.rows.some((r) => r.name === name));
  assert.deepEqual(n.unresolvedIdentities.map((u) => u.name), ["Ghost Player", "Marvin Twin", "Sam Same", "Williams"]);
  assert.ok(n.unresolvedIdentities.every((u) => u.families.join() === "anytime_td"));
});
test("identity: one book posting two prices for one player uses neither", () => {
  const n = norm();
  assert.ok(!n.rows.some((r) => r.bookmaker === "fanduel" && r.name === "CeeDee Lamb"));
  assert.ok(n.quarantined.some((q) => q.bookmaker === "fanduel" && /conflicting prices/.test(q.reason)));
});
test("identity: a response for a different provider event is quarantined whole", () => {
  const n = normalizeAtdEventResponse({ body: SF_DAL, registry: REGISTRY, teamAbbrs: ["DAL", "SF"], capturedAt: NOW, canonicalEventId: `nfl-${SFDAL}`, oddsEventId: "odds-pit-cin" });
  assert.equal(n.rows.length, 0);
  assert.match(n.quarantined[0].reason, /wrong-event/);
});
test("identity: a roster from neither team cannot resolve anyone", () => {
  const n = normalizeAtdEventResponse({ body: SF_DAL, registry: REGISTRY, teamAbbrs: ["CIN", "PIT"], capturedAt: NOW, canonicalEventId: `nfl-${SFDAL}` });
  assert.equal(n.rows.length, 0);
});

// ---------------------------------------------------------------- orchestrator
test("run: free index, then exactly ONE call per target with player_anytime_td + us only; 2 credits total", async () => {
  const { get, calls } = stubProvider(standardRoutes());
  const ledgers = [];
  const r = await run({ get, onLedger: (l) => ledgers.push(l.cumulativeCredits) });
  assert.equal(r.stoppedReason, null);
  assert.equal(calls.length, 3);
  assert.equal(calls[0], "/sports/americanfootball_nfl/events");
  for (const c of calls.slice(1)) assert.match(c, /\/odds\?regions=us&markets=player_anytime_td&oddsFormat=american$/);
  assert.equal(r.spentThisRun, 2);
  assert.equal(r.ledger.cumulativeCredits, 2);
  assert.deepEqual(ledgers, [0, 1, 2], "the ledger is persisted after every call");
  assert.equal(r.ledger.requests[1].fingerprint, atdFingerprint("odds-sf-dal"));
  assert.equal(r.ledger.requests[0].creditsUsed, 0);
  const sf = r.results.find((x) => x.canonicalEventId === `nfl-${SFDAL}`);
  assert.equal(sf.state, "OFFERED");
  assert.equal(sf.oddsEventId, "odds-sf-dal");
});
test("missing market: 200 without the market and a 422 are NOT_OFFERED evidence, never retried", async () => {
  const a = await run({ get: stubProvider(standardRoutes()).get });
  assert.equal(a.results.find((x) => x.providerEventId === PITCIN).state, "NOT_OFFERED");
  const s = stubProvider(standardRoutes(undefined, { status: 422, headers: headers(0), body: { message: "Markets not supported" } }));
  const b = await run({ get: s.get });
  const pit = b.results.find((x) => x.providerEventId === PITCIN);
  assert.equal(pit.state, "NOT_OFFERED");
  assert.equal(pit.resultClass, "NO_MARKET");
  assert.equal(s.calls.filter((c) => c.includes("odds-pit-cin")).length, 1);
  assert.equal(b.stoppedReason, null);
});
test("duplicate: the same event inside the freshness window is not re-bought", async () => {
  let ledger = emptyLedger("t");
  ledger = recordRequest(ledger, { at: "2026-11-15T18:10:00Z", purpose: "prior", endpoint: "x", status: 200, headers: headers(1), charged: true, fingerprint: atdFingerprint("odds-sf-dal") });
  const { get, calls } = stubProvider(standardRoutes());
  const r = await run({ get, ledger });
  assert.ok(!calls.some((c) => c.includes("odds-sf-dal")));
  assert.match(r.skipped.find((s) => s.canonicalEventId === `nfl-${SFDAL}`).reason, /DUPLICATE/);
  assert.equal(r.spentThisRun, 1);
  // outside the window it is bought again
  ledger.requests[0].at = "2026-11-15T17:00:00Z";
  const s2 = stubProvider(standardRoutes());
  await run({ get: s2.get, ledger });
  assert.ok(s2.calls.some((c) => c.includes("odds-sf-dal")));
});
test("budget exhaustion mid-run: the ceiling gate stops before the call that would cross it", async () => {
  const ledger = { ...emptyLedger("t"), cumulativeCredits: 9 };
  const auth = okAuth(ledger, 1);
  assert.equal(auth.ok, true);
  const plan = { ...plan2(2), maxCredits: 2 }; // run cap allows 2, ceiling allows 1
  const { get, calls } = stubProvider(standardRoutes());
  const r = await executeAtdRun({ plan, authorization: auth.authorization, ledger, nowIso: NOW, get, scheduleRows: SCHEDULE.rows, registry: REGISTRY });
  assert.equal(calls.length, 2, "index + the one call that fits");
  assert.match(r.stoppedReason, /would cross the 10-credit/);
  assert.equal(r.ledger.cumulativeCredits, 10);
});
test("budget: the run cap (max-credits) binds even if a plan were mis-built", async () => {
  const plan = { ...plan2(2), maxCredits: 1 };
  const { get, calls } = stubProvider(standardRoutes());
  const r = await run({ get, plan });
  assert.equal(calls.length, 2);
  assert.match(r.stoppedReason, /would exceed --max-credits 1/);
});
test("overrun: a call charged above plan stops the run before the next call", async () => {
  const { get, calls } = stubProvider(standardRoutes({ status: 200, headers: headers(5), body: SF_DAL }));
  const r = await run({ get });
  assert.match(r.stoppedReason, /OVERRUN: provider charged 5/);
  assert.ok(!calls.some((c) => c.includes("odds-pit-cin")), "no call after the overrun");
  assert.equal(r.ledger.cumulativeCredits, 5, "the real charge is recorded, not the plan");
  assert.equal(r.results.length, 1, "the paid-for answer is kept");
});
test("provider failure: a 429 / 401 stops the run, and a charged failure still counts", async () => {
  const { get, calls } = stubProvider(standardRoutes({ status: 429, headers: headers(1), body: null }));
  const r = await run({ get });
  assert.match(r.stoppedReason, /RATE_OR_CREDIT_LIMITED/);
  assert.equal(calls.length, 2);
  assert.equal(r.ledger.cumulativeCredits, 1);
  assert.equal(r.results.length, 0);
});
test("index failure or a charged index: no paid call follows", async () => {
  const a = stubProvider([[/\/events$/, { status: 500, headers: headers(0), body: null }]]);
  const r = await run({ get: a.get });
  assert.equal(a.calls.length, 1);
  assert.match(r.stoppedReason, /no paid call follows/);
  const b = stubProvider([[/\/events$/, { status: 200, headers: headers(2), body: INDEX }]]);
  const r2 = await run({ get: b.get });
  assert.equal(b.calls.length, 1);
  assert.match(r2.stoppedReason, /free events index charged/);
});
test("transport failure on a paid call: recorded as charged (1), run stops, no retry", async () => {
  const { get, calls } = stubProvider(standardRoutes(() => { throw new Error("socket hang up"); }));
  const r = await run({ get });
  assert.match(r.stoppedReason, /transport failure/);
  assert.equal(calls.filter((c) => c.includes("odds-sf-dal")).length, 1);
  assert.ok(!calls.some((c) => c.includes("odds-pit-cin")));
  assert.equal(r.ledger.cumulativeCredits, 1);
});
test("join: a target the provider does not list makes no call", async () => {
  const { get, calls } = stubProvider([[/\/events$/, { status: 200, headers: headers(0), body: INDEX.filter((e) => e.id !== "odds-pit-cin") }], ...standardRoutes().slice(1)]);
  const r = await run({ get });
  assert.ok(!calls.some((c) => c.includes("odds-pit-cin")));
  assert.match(r.skipped.find((s) => s.canonicalEventId === `nfl-${PITCIN}`).reason, /lists no event/);
});

// ---------------------------------------------------------------- display file
test("display: one named eligible book per player; offshore never displayed; prior events kept", async () => {
  const r = await run({ get: stubProvider(standardRoutes()).get });
  const prior = { events: [{ canonicalEventId: "nfl-401873099", providerEventId: "401873099", kickoffUtc: "2026-11-17T01:15Z", state: "OFFERED", capturedAt: "2026-11-14T15:00:00Z", rows: [{ playerId: "nfl-athlete-1", book: "draftkings", price: 300, capturedAt: "2026-11-14T15:00:00Z" }] }] };
  const pub = buildAtdDisplayFile({ prior, results: r.results, nowIso: NOW });
  assert.deepEqual(pub.requestedMarkets, ["player_anytime_td"]);
  const sf = pub.events.find((e) => e.canonicalEventId === `nfl-${SFDAL}`);
  const by = Object.fromEntries(sf.rows.map((x) => [x.name, x]));
  assert.deepEqual([by["Christian McCaffrey"].book, by["Christian McCaffrey"].price], ["draftkings", -175]);
  assert.deepEqual([by["George Kittle"].book, by["George Kittle"].price], ["fanduel", 160]);
  assert.deepEqual([by["CeeDee Lamb"].book, by["CeeDee Lamb"].price], ["draftkings", 120]);
  assert.ok(!sf.rows.some((x) => x.book === "bovada"), "an ineligible operator is never the displayed book");
  for (const x of sf.rows) { assert.equal(x.canonicalEventId, `nfl-${SFDAL}`); assert.ok(x.playerId && x.capturedAt && x.sourceAsOf && x.book); }
  const kept = pub.events.find((e) => e.canonicalEventId === "nfl-401873099");
  assert.equal(kept.capturedAt, "2026-11-14T15:00:00Z", "an untargeted event keeps its own capturedAt");
  assert.equal(pub.events.find((e) => e.providerEventId === PITCIN).state, "NOT_OFFERED");
});
test("display: last-known-good — a run that fetched nothing writes nothing", () => {
  assert.equal(buildAtdDisplayFile({ prior: { events: [{ canonicalEventId: "x" }] }, results: [], nowIso: NOW }), null);
});

// ---------------------------------------------------------------- script (imported, never spawned)
const KEY = "abcdefghijklmnop1234"; // a shape-valid DUMMY, never a real key; no network is reachable from these tests
function fixtureTree({ receiptText = receipt(), ledger = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-repo-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public/data/nfl/schedule"), { recursive: true });
  fs.mkdirSync(path.join(app, "public/data/nfl/rosters"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/receipts"), { recursive: true });
  fs.copyFileSync(path.join(FIX, "nfl-atd-schedule.json"), path.join(app, "public/data/nfl/schedule/latest.json"));
  fs.copyFileSync(path.join(FIX, "nfl-atd-rosters.json"), path.join(app, "public/data/nfl/rosters/latest.json"));
  fs.writeFileSync(path.join(root, "docs/receipts/TEST.md"), receiptText);
  if (ledger) { fs.mkdirSync(path.join(root, "data/internal/research/odds/nfl"), { recursive: true }); fs.writeFileSync(path.join(root, "data/internal/research/odds/nfl/p171-ledger.json"), JSON.stringify(ledger)); }
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-private-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-home-")); // so ~/gtp-private can never be the real one
  return { root, app, priv, home, cleanup: () => { for (const d of [root, priv, home]) fs.rmSync(d, { recursive: true, force: true }); } };
}
const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort() : []);
const fakeFetch = (routes) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const p = url.replace("https://api.the-odds-api.com/v4", "").replace(/[?&]apiKey=[^&]*$/, "");
    for (const [re, resp] of routes) if (re.test(p)) return { status: resp.status, headers: { get: (h) => resp.headers[h] ?? null }, json: async () => resp.body };
    throw new Error(`unrouted ${p}`);
  };
  return { fn, calls };
};
const quiet = { log: () => {}, error: () => {} };
const deps = (t, over = {}) => ({ appDir: t.app, rootDir: t.root, homeDir: t.home, env: { ODDS_API_KEY: KEY }, clock: () => Date.parse(NOW), ...quiet, ...over });
const paidArgs = (t, extra = []) => ["--now", NOW, "--events", `${SFDAL},${PITCIN}`, "--max-credits", "2", "--receipt", "docs/receipts/TEST.md", "--private-dir", t.priv, "--authorized", "--write", ...extra];

test("script dry-run: ZERO fetch calls (fetch stubbed to throw) and nothing written anywhere", async () => {
  const t = fixtureTree();
  const before = [listFiles(t.root), listFiles(t.priv)];
  const real = globalThis.fetch;
  let touched = 0;
  globalThis.fetch = async () => { touched += 1; throw new Error("network forbidden in dry run"); };
  try {
    const out = [];
    const code = await captureMain(["--now", NOW, "--events", `${SFDAL},${PITCIN}`, "--max-credits", "2", "--receipt", "docs/receipts/TEST.md", "--private-dir", t.priv, "--write"], deps(t, { fetch: async () => { touched += 1; throw new Error("no"); }, log: (s) => out.push(s), error: (s) => out.push(s) }));
    assert.equal(code, 0);
    assert.equal(touched, 0);
    const text = out.join("\n");
    assert.match(text, /DRY-RUN/);
    assert.match(text, /worst case this run 2 of --max-credits 2/);
    assert.match(text, /receipt .*OK — authorizes player_anytime_td/);
    assert.match(text, /private directory \(--private-dir\): OK/);
    assert.match(text, /≥ 500 \(shared 3,500\/week plan/);
  } finally { globalThis.fetch = real; }
  assert.deepEqual([listFiles(t.root), listFiles(t.priv)], before);
  t.cleanup();
});
test("script: --authorized without --write, without --receipt, or a bad budget refuses before any call", async () => {
  const t = fixtureTree();
  let touched = 0;
  const d = deps(t, { fetch: async () => { touched += 1; throw new Error("no"); } });
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--receipt", "docs/receipts/TEST.md", "--private-dir", t.priv, "--authorized"], d), 2);
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--private-dir", t.priv, "--authorized", "--write"], d), 2);
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "0", "--receipt", "docs/receipts/TEST.md", "--authorized", "--write"], d), 1);
  assert.equal(touched, 0);
  t.cleanup();
});
test("script: refused receipt (no player_anytime_td) → zero calls", async () => {
  const t = fixtureTree({ receiptText: receipt({ props: "`player_pass_yds`" }) });
  let touched = 0;
  assert.equal(await captureMain(paidArgs(t), deps(t, { fetch: async () => { touched += 1; throw new Error("no"); } })), 2);
  assert.equal(touched, 0);
  t.cleanup();
});
test("script: a private directory inside a git working tree (or the repo) is refused before any call", async () => {
  const t = fixtureTree();
  const gitTree = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-gittree-"));
  fs.mkdirSync(path.join(gitTree, ".git"));
  let touched = 0;
  const d = deps(t, { fetch: async () => { touched += 1; throw new Error("no"); } });
  const out = [];
  const code = await captureMain(paidArgs(t).map((x) => (x === t.priv ? path.join(gitTree, "private") : x)), { ...d, error: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.match(out.join("\n"), /inside a git working tree/);
  assert.equal(await captureMain(paidArgs(t).map((x) => (x === t.priv ? path.join(t.root, "private") : x)), d), 2);
  assert.equal(touched, 0);
  assert.deepEqual(listFiles(path.join(gitTree)), []);
  fs.rmSync(gitTree, { recursive: true, force: true });
  t.cleanup();
});
test("script: no private directory configured at all → refused (no in-repo default)", async () => {
  const t = fixtureTree();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-gittree-home-"));
  fs.mkdirSync(path.join(home, ".git")); // ~/gtp-private would sit inside a git tree
  let touched = 0;
  const args = paidArgs(t).filter((x, i, arr) => x !== "--private-dir" && arr[i - 1] !== "--private-dir");
  assert.equal(await captureMain(args, deps(t, { homeDir: home, env: { ODDS_API_KEY: KEY }, fetch: async () => { touched += 1; throw new Error("no"); } })), 2);
  assert.equal(touched, 0);
  fs.rmSync(home, { recursive: true, force: true });
  t.cleanup();
});
test("script: key from --key-env-file (mode 600, ODDS_API_KEY line only); mode 644 or a missing key refuses with zero calls", async () => {
  const t = fixtureTree();
  const envFile = path.join(t.home, ".env");
  fs.writeFileSync(envFile, `OTHER=1\nODDS_API_KEY=${KEY}\n`, { mode: 0o644 });
  fs.chmodSync(envFile, 0o644);
  let touched = 0;
  const noFetch = async () => { touched += 1; throw new Error("no"); };
  const out = [];
  assert.equal(await captureMain(paidArgs(t, ["--key-env-file", envFile]), deps(t, { env: {}, fetch: noFetch, error: (s) => out.push(s) })), 3);
  assert.match(out.join("\n"), /must be 600/);
  assert.ok(!out.join("\n").includes(KEY), "the key is never printed");
  assert.equal(await captureMain(paidArgs(t), deps(t, { env: {}, fetch: noFetch })), 3, "no key anywhere");
  assert.equal(touched, 0);
  fs.chmodSync(envFile, 0o600);
  const { fn, calls } = fakeFetch(standardRoutes());
  assert.equal(await captureMain(paidArgs(t, ["--key-env-file", envFile]), deps(t, { env: {}, fetch: fn })), 0);
  assert.equal(calls.length, 3);
  t.cleanup();
});
test("script: provider balance below the floor refuses before any paid call", async () => {
  const t = fixtureTree();
  const low = fakeFetch([[/\/events$/, { status: 200, headers: headers(0, 501), body: INDEX }], ...standardRoutes().slice(1)]);
  assert.equal(await captureMain(paidArgs(t), deps(t, { fetch: low.fn })), 5);
  assert.equal(low.calls.length, 1, "only the free index");
  const ledger = JSON.parse(fs.readFileSync(path.join(t.root, "data/internal/research/odds/nfl/p171-ledger.json"), "utf8"));
  assert.equal(ledger.requests[0].openingProviderRemaining, 501);
  assert.equal(ledger.cumulativeCredits, 0);
  const ok = fakeFetch([[/\/events$/, { status: 200, headers: headers(0, 501), body: INDEX }], ...standardRoutes().slice(1)]);
  assert.equal(await captureMain(paidArgs(t, ["--min-provider-remaining", "499", "--refresh-minutes", "1"]), deps(t, { fetch: ok.fn })), 0);
  assert.equal(ok.calls.length, 3);
  t.cleanup();
});
test("script authorized (stubbed provider): the ONLY repo write is the ledger; capture, raw and display rows are private", async () => {
  const t = fixtureTree();
  const { fn, calls } = fakeFetch(standardRoutes());
  assert.equal(await captureMain(paidArgs(t), deps(t, { fetch: fn })), 0);
  assert.equal(calls.length, 3);
  const repoFiles = listFiles(t.root);
  assert.deepEqual(repoFiles.filter((f) => !f.startsWith("app/public/data/nfl/schedule/") && !f.startsWith("app/public/data/nfl/rosters/") && f !== "docs/receipts/TEST.md"), ["data/internal/research/odds/nfl/p171-ledger.json"], "nothing but the ledger lands in the repository");
  const privFiles = listFiles(t.priv);
  const dir = "odds/nfl/atd-20261115T183000";
  assert.deepEqual(privFiles, [`${dir}/anytime-td-display.json`, `${dir}/capture-atd-20261115T183000.json`, `${dir}/raw-events-index.json`, `${dir}/raw-odds-pit-cin.json`, `${dir}/raw-odds-sf-dal.json`]);
  for (const f of [...repoFiles.map((x) => path.join(t.root, x)), ...privFiles.map((x) => path.join(t.priv, x))]) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!s.includes(KEY), `${f} must not contain the key`);
    assert.ok(!/keyFingerprint|len20…/.test(s), `${f} must carry no key fingerprint`);
  }
  // THE COMMITTED LEDGER: credits, status, endpoint, time — no price, no player, no book, no key fingerprint
  const ledgerText = fs.readFileSync(path.join(t.root, "data/internal/research/odds/nfl/p171-ledger.json"), "utf8");
  const ledger = JSON.parse(ledgerText);
  assert.equal(ledger.cumulativeCredits, 2);
  const allowed = new Set(["at", "purpose", "endpoint", "events", "markets", "regions", "status", "resultClass", "fingerprint", "creditsUsed", "providerRequestsUsed", "providerRequestsRemaining", "openingProviderRemaining"]);
  for (const r of ledger.requests) for (const k of Object.keys(r)) assert.ok(allowed.has(k), `ledger field ${k} is not a credit/status/endpoint/time field`);
  assert.doesNotMatch(ledgerText, /"price"|bookmaker|draftkings|fanduel|playerId|nfl-athlete|McCaffrey|-175|keyFingerprint/);
  assert.equal(ledger.requests[0].openingProviderRemaining, 18000);
  // the private capture is the publisher's input shape
  const cap = JSON.parse(fs.readFileSync(path.join(t.priv, `${dir}/capture-atd-20261115T183000.json`), "utf8"));
  assert.equal(cap.artifact, "nfl-odds-capture");
  assert.equal(cap.sport, "nfl");
  assert.ok(cap.propProbe.anytimeTd.rows.some((r) => r.bookmaker === "bovada"), "the private capture keeps every book");
  assert.deepEqual(cap.propProbe.lineProps.rows, []);
  // a second run inside the freshness window buys nothing and writes no new display (last-known-good)
  const second = fakeFetch(standardRoutes());
  assert.equal(await captureMain(paidArgs(t).map((x) => (x === NOW ? "2026-11-15T18:40:00Z" : x)), deps(t, { fetch: second.fn, clock: () => Date.parse("2026-11-15T18:40:00Z") })), 0);
  assert.equal(second.calls.length, 1, "only the free index");
  assert.equal(latestAtdDisplayFile(t.priv).stamp, "atd-20261115T183000", "the earlier display stays the newest");
  t.cleanup();
});
test("secure display: targeted capture → nflOffersFromCapture → buildNflLinePublication → encrypt/decrypt (TEST key) yields the anytime_td offer", async () => {
  const r = await run({ get: stubProvider(standardRoutes()).get });
  const cap = buildAtdPrivateCapture({ run: r, plan: plan2(), nowIso: NOW, maxCredits: 2 });
  const offers = nflOffersFromCapture(cap);
  assert.ok(offers.every((o) => o.market === "player_anytime_td"));
  const board = {
    providerEventId: SFDAL, matchup: "SF @ DAL", kickoffUtc: "2026-11-15T21:25Z",
    families: { anytime_td: { state: "PUBLISHED" } },
    players: [{ playerId: "nfl-athlete-3117251", name: "Christian McCaffrey", team: "SF", markets: { anytime_td: { probability: 0.72 } } }],
  };
  const res = buildNflLinePublication({ boards: [{ board, path: "app/public/data/nfl/player-board/401873063.json", sha256: "0".repeat(64) }], captureFiles: [{ name: "atd-20261115T183000/capture-atd-20261115T183000.json", sha256: "1".repeat(64), offers }], asOf: "2026-11-15T18:45:00Z", receiptText: receipt(), receiptRel: "docs/receipts/TEST.md" });
  assert.equal(res.ok, true, (res.reasons ?? []).join("; "));
  assert.equal(res.artifacts.length, 1);
  const key = crypto.randomBytes(32); // a throwaway TEST key, generated here
  const sealed = encryptDisplayArtifact(res.artifacts[0].text, key, nflLinesAad(SFDAL));
  assert.doesNotMatch(sealed, /draftkings|-175|nfl-athlete/, "the envelope carries no plaintext");
  const art = JSON.parse(decryptDisplayArtifact(sealed, key, nflLinesAad(SFDAL)));
  assert.equal(validateNflLineArtifact(art, SFDAL).ok, true);
  const row = art.rows.find((x) => x.playerId === "nfl-athlete-3117251" && x.market === "player_anytime_td");
  assert.ok(row, "the anytime_td offer survives for the right player");
  const src = cap.propProbe.anytimeTd.rows.find((x) => x.playerId === row.playerId && x.bookmaker === row.book);
  assert.ok(["draftkings", "fanduel"].includes(row.book));
  assert.equal(row.price, src.price, "the price is that book's own price");
  assert.equal(row.capturedAt, NOW);
  assert.equal(row.canonicalEventId, `nfl-${SFDAL}`);
  assert.equal(decryptDisplayArtifact(sealed, crypto.randomBytes(32), nflLinesAad(SFDAL)), null, "another key reads nothing");
  // the publisher's refusal rules still apply: a receipt without player_anytime_td refuses the slate offer
  const refused = buildNflLinePublication({ boards: [{ board, path: "x", sha256: "0".repeat(64) }], captureFiles: [{ name: "c", sha256: "1", offers }], asOf: "2026-11-15T18:45:00Z", receiptText: receipt({ props: "`player_pass_yds`" }), receiptRel: "r" });
  assert.equal(refused.ok, false);
});

// ---------------------------------------------------------------- review fixes (PR #1359)
test("identity: generational suffix both directions, initials and St. punctuation", () => {
  const n = normalizeAtdEventResponse({ body: IDENTITY_CASES, registry: REGISTRY, teamAbbrs: ["DAL", "SF"], capturedAt: NOW, canonicalEventId: `nfl-${SFDAL}`, oddsEventId: "odds-sf-dal" });
  const id = (label) => n.rows.find((r) => r.name === label)?.playerId ?? null;
  assert.equal(id("Deebo Samuel"), "nfl-athlete-3126486", "book drops Sr. → roster Deebo Samuel Sr.");
  assert.equal(id("Oronde Gadsden II"), "nfl-athlete-9000013", "book adds II → roster Oronde Gadsden");
  assert.equal(id("James Cook"), "nfl-athlete-9000014", "book drops III → roster James Cook III");
  assert.equal(id("AJ Green"), "nfl-athlete-9000011", "AJ ↔ A.J. normalize alike");
  assert.equal(id("Amon-Ra St Brown"), "nfl-athlete-9000012", "St ↔ St. normalize alike");
  assert.equal(id("Amon Ra St. Brown"), null, "a split hyphenated first name is a different key — fail closed, never fuzzy-matched");
  assert.ok(n.quarantined.some((q) => q.name === "Amon Ra St. Brown" && /unresolved/.test(q.reason)));
});
test("identity: a response body without an id is quarantined whole and is IDENTITY_DEGRADED, never NOT_OFFERED", async () => {
  const { id: _drop, ...noId } = SF_DAL;
  const n = normalizeAtdEventResponse({ body: noId, registry: REGISTRY, teamAbbrs: ["DAL", "SF"], capturedAt: NOW, canonicalEventId: `nfl-${SFDAL}`, oddsEventId: "odds-sf-dal" });
  assert.equal(n.rows.length, 0);
  assert.match(n.quarantined[0].reason, /carries no provider event id/);
  const r = await run({ get: stubProvider(standardRoutes({ status: 200, headers: headers(1), body: noId })).get });
  assert.equal(r.results.find((x) => x.providerEventId === SFDAL).state, "IDENTITY_DEGRADED");
});
test("display: an all-quarantined refresh keeps the prior rows and marks IDENTITY_DEGRADED", async () => {
  const first = await run({ get: stubProvider(standardRoutes()).get });
  const prior = buildAtdDisplayFile({ prior: null, results: first.results, nowIso: NOW });
  const priorRows = prior.events.find((e) => e.canonicalEventId === `nfl-${SFDAL}`).rows;
  assert.ok(priorRows.length > 0);
  const LATER = "2026-11-15T19:30:00Z";
  const allBad = { ...SF_DAL, bookmakers: [{ key: "draftkings", last_update: LATER, markets: [{ key: "player_anytime_td", outcomes: [{ name: "Yes", description: "Ghost Player", price: 300 }, { name: "Yes", description: "Sam Same", price: 900 }] }] }] };
  const second = await executeAtdRun({ plan: plan2(2, [SFDAL]), authorization: okAuth().authorization, ledger: emptyLedger("t"), nowIso: LATER, get: stubProvider(standardRoutes({ status: 200, headers: headers(1), body: allBad })).get, scheduleRows: SCHEDULE.rows, registry: REGISTRY });
  const merged = buildAtdDisplayFile({ prior, results: second.results, nowIso: LATER });
  const ev = merged.events.find((e) => e.canonicalEventId === `nfl-${SFDAL}`);
  assert.equal(ev.state, "IDENTITY_DEGRADED");
  assert.deepEqual(ev.rows, priorRows, "prior rows kept, each with its own capturedAt");
  assert.equal(ev.rowsCarriedFrom, NOW);
  assert.ok(ev.rows.every((x) => x.capturedAt === NOW));
});
test("ledger: a 5xx without usage headers is recorded as 1 credit (unaccounted spend) and stops the run", async () => {
  const { get, calls } = stubProvider(standardRoutes({ status: 503, headers: headers(null), body: null }));
  const r = await run({ get });
  assert.equal(r.ledger.requests[1].creditsUsed, 1);
  assert.equal(r.spentThisRun, 1);
  assert.match(r.stoppedReason, /PROVIDER_INCIDENT/);
  assert.ok(!calls.some((c) => c.includes("odds-pit-cin")));
});
test("ledger: a 4xx (401) without headers is recorded as 1 and stops", async () => {
  const r = await run({ get: stubProvider(standardRoutes({ status: 401, headers: headers(null), body: null })).get });
  assert.equal(r.ledger.requests[1].creditsUsed, 1);
  assert.match(r.stoppedReason, /AUTHORIZATION_FAILED/);
});
test("422 without x-requests-last: NO_MARKET, 0 charged, the run continues to the next target", async () => {
  const s = stubProvider(standardRoutes({ status: 422, headers: headers(null), body: { message: "INVALID_MARKET" } }));
  const r = await run({ get: s.get });
  assert.equal(r.stoppedReason, null);
  const sf = r.results.find((x) => x.providerEventId === SFDAL);
  assert.deepEqual([sf.state, sf.resultClass, sf.credits], ["NOT_OFFERED", "NO_MARKET", 0]);
  assert.ok(s.calls.some((c) => c.includes("odds-pit-cin")), "next target still asked");
  assert.equal(r.spentThisRun, 1);
  // a 422 whose header shows an overrun still stops
  const o = await run({ get: stubProvider(standardRoutes({ status: 422, headers: headers(3), body: null })).get });
  assert.match(o.stoppedReason, /OVERRUN/);
});
test("a 200 without x-requests-last still stops the run (cost cannot be shown within plan)", async () => {
  const s = stubProvider(standardRoutes({ status: 200, headers: headers(null), body: SF_DAL }));
  const r = await run({ get: s.get });
  assert.match(r.stoppedReason, /x-requests-last missing/);
  assert.ok(!s.calls.some((c) => c.includes("odds-pit-cin")));
});

test("provider balance: a missing x-requests-remaining on the free index refuses before any paid call", async () => {
  const s = stubProvider([[/\/events$/, { status: 200, headers: { "x-requests-last": "0" }, body: INDEX }], ...standardRoutes().slice(1)]);
  const r = await run({ get: s.get });
  assert.equal(s.calls.length, 1);
  assert.match(r.stoppedReason, /x-requests-remaining missing/);
});
test("provider balance: remaining − worst case below the floor refuses; the opening balance is in the ledger", async () => {
  const s = stubProvider([[/\/events$/, { status: 200, headers: headers(0, 501), body: INDEX }], ...standardRoutes().slice(1)]);
  const r = await executeAtdRun({ plan: plan2(), authorization: okAuth().authorization, ledger: emptyLedger("t"), nowIso: NOW, get: s.get, scheduleRows: SCHEDULE.rows, registry: REGISTRY, minProviderRemaining: 500 });
  assert.equal(s.calls.length, 1);
  assert.match(r.stoppedReason, /provider remaining 501 − worst case 2 < --min-provider-remaining 500/);
  assert.equal(r.ledger.requests[0].openingProviderRemaining, 501);
});
test("private capture: no key fingerprint, explicit requested market, empty lineProps", async () => {
  const r = await run({ get: stubProvider(standardRoutes()).get });
  const cap = buildAtdPrivateCapture({ run: r, plan: plan2(), nowIso: NOW, maxCredits: 2 });
  assert.ok(!JSON.stringify(cap).includes("keyFingerprint"));
  assert.deepEqual(cap.propProbe.requestedMarkets, ["player_anytime_td"]);
  assert.equal(cap.openingProviderRemaining, 18000);
});

// ---------------------------------------------------------------- real clock on the paid path (re-review of PR #1359)
test("paid run: a BACKDATED --now (real clock after kickoff) is refused with zero calls", async () => {
  const t = fixtureTree();
  let touched = 0;
  const out = [];
  // the operator claims 18:30 Z, but the machine clock says the SF @ DAL game (21:25 Z) has kicked off
  const code = await captureMain(paidArgs(t), deps(t, { clock: () => Date.parse("2026-11-15T21:40:00Z"), fetch: async () => { touched += 1; throw new Error("no"); }, error: (s) => out.push(s) }));
  assert.equal(code, 2);
  assert.equal(touched, 0);
  assert.match(out.join("\n"), /from the real clock .* at most 5 min/);
  assert.deepEqual(listFiles(t.priv), []);
  assert.ok(!fs.existsSync(path.join(t.root, "data/internal/research/odds/nfl/p171-ledger.json")), "no ledger write either");
  t.cleanup();
});
test("paid run: a FUTURE-dated --now is refused with zero calls", async () => {
  const t = fixtureTree();
  let touched = 0;
  assert.equal(await captureMain(paidArgs(t), deps(t, { clock: () => Date.parse("2026-11-15T18:24:00Z"), fetch: async () => { touched += 1; throw new Error("no"); } })), 2);
  assert.equal(touched, 0);
  t.cleanup();
});
test("paid run: --now within 5 min is accepted, and every instant written is the REAL clock, not --now", async () => {
  const t = fixtureTree();
  const REAL = "2026-11-15T18:33:20Z"; // 3 min 20 s after --now
  const { fn, calls } = fakeFetch(standardRoutes());
  assert.equal(await captureMain(paidArgs(t), deps(t, { clock: () => Date.parse(REAL), fetch: fn })), 0);
  assert.equal(calls.length, 3);
  const ledger = JSON.parse(fs.readFileSync(path.join(t.root, "data/internal/research/odds/nfl/p171-ledger.json"), "utf8"));
  assert.ok(ledger.requests.every((r) => r.at === REAL), "ledger `at` is the real clock");
  const dir = "odds/nfl/atd-20261115T183320";
  const cap = JSON.parse(fs.readFileSync(path.join(t.priv, `${dir}/capture-atd-20261115T183320.json`), "utf8"));
  assert.equal(cap.capturedAt, REAL);
  assert.ok(cap.propProbe.anytimeTd.rows.every((r) => r.capturedAt === REAL), "capturedAt is the real clock");
  t.cleanup();
});
test("paid run: a game that kicks off while the run is in progress is refused per call (real clock)", async () => {
  let ms = Date.parse(NOW);
  const s = stubProvider(standardRoutes());
  const get = async (p) => { const r = await s.get(p); if (p.includes("odds-sf-dal/odds")) ms = Date.parse("2026-11-16T01:21:00Z"); return r; };
  const r = await executeAtdRun({ plan: plan2(), authorization: okAuth().authorization, ledger: emptyLedger("t"), nowIso: NOW, get, scheduleRows: SCHEDULE.rows, registry: REGISTRY, clock: () => ms });
  assert.ok(!s.calls.some((c) => c.includes("odds-pit-cin")), "no call once PIT @ CIN has kicked off");
  assert.match(r.skipped.find((x) => x.canonicalEventId === `nfl-${PITCIN}`).reason, /STARTED/);
});
test("dry run may keep any --now (planning only, no clock check)", async () => {
  const t = fixtureTree();
  let touched = 0;
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--receipt", "docs/receipts/TEST.md", "--private-dir", t.priv], deps(t, { clock: () => Date.parse("2027-01-01T00:00:00Z"), fetch: async () => { touched += 1; throw new Error("no"); } })), 0);
  assert.equal(touched, 0);
  t.cleanup();
});
