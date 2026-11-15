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
  normalizeAtdEventResponse, executeAtdRun, buildAtdPublicFile,
} from "./nfl-atd-targeted.mjs";
import { emptyLedger, recordRequest } from "./p171-authorization.mjs";
import { buildPlayerRegistry } from "../nfl/player-identity.mjs";
import { main as captureMain } from "../../../../scripts/nfl/capture-nfl-atd-targeted.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), "utf8"));
const SCHEDULE = fx("nfl-atd-schedule.json");
const ROSTERS = fx("nfl-atd-rosters.json");
const INDEX = fx("nfl-atd-events-index.json");
const SF_DAL = fx("nfl-atd-event-odds-sf-dal.json");
const NO_MARKET = fx("nfl-atd-event-odds-no-market.json");
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

// ---------------------------------------------------------------- public file
test("public: one named eligible book per player; offshore never displayed; prior events kept", async () => {
  const r = await run({ get: stubProvider(standardRoutes()).get });
  const prior = { events: [{ canonicalEventId: "nfl-401873099", providerEventId: "401873099", kickoffUtc: "2026-11-17T01:15Z", state: "OFFERED", capturedAt: "2026-11-14T15:00:00Z", rows: [{ playerId: "nfl-athlete-1", book: "draftkings", price: 300, capturedAt: "2026-11-14T15:00:00Z" }] }] };
  const pub = buildAtdPublicFile({ prior, results: r.results, nowIso: NOW });
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
test("public: last-known-good — a run that fetched nothing writes nothing", () => {
  assert.equal(buildAtdPublicFile({ prior: { events: [{ canonicalEventId: "x" }] }, results: [], nowIso: NOW }), null);
});

// ---------------------------------------------------------------- script (imported, never spawned)
function fixtureTree({ receiptText = receipt(), ledger = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atd-targeted-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public/data/nfl/schedule"), { recursive: true });
  fs.mkdirSync(path.join(app, "public/data/nfl/rosters"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/receipts"), { recursive: true });
  fs.copyFileSync(path.join(FIX, "nfl-atd-schedule.json"), path.join(app, "public/data/nfl/schedule/latest.json"));
  fs.copyFileSync(path.join(FIX, "nfl-atd-rosters.json"), path.join(app, "public/data/nfl/rosters/latest.json"));
  fs.writeFileSync(path.join(root, "docs/receipts/TEST.md"), receiptText);
  if (ledger) { fs.mkdirSync(path.join(root, "data/internal/research/odds/nfl"), { recursive: true }); fs.writeFileSync(path.join(root, "data/internal/research/odds/nfl/p171-ledger.json"), JSON.stringify(ledger)); }
  return { root, app };
}
const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);
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

test("script dry-run: ZERO fetch calls (fetch stubbed to throw) and nothing written", async () => {
  const { root, app } = fixtureTree();
  const before = listFiles(root);
  const real = globalThis.fetch;
  let touched = 0;
  globalThis.fetch = async () => { touched += 1; throw new Error("network forbidden in dry run"); };
  try {
    const out = [];
    const code = await captureMain(["--now", NOW, "--events", `${SFDAL},${PITCIN}`, "--max-credits", "2", "--receipt", "docs/receipts/TEST.md", "--write"], { appDir: app, rootDir: root, env: { ODDS_API_KEY: "abcdefghijklmnop1234" }, fetch: async () => { touched += 1; throw new Error("no"); }, log: (s) => out.push(s), error: (s) => out.push(s) });
    assert.equal(code, 0);
    assert.equal(touched, 0);
    assert.match(out.join("\n"), /DRY-RUN/);
    assert.match(out.join("\n"), /worst case this run 2 of --max-credits 2/);
    assert.match(out.join("\n"), /receipt .*OK — authorizes player_anytime_td/);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(listFiles(root), before);
  fs.rmSync(root, { recursive: true, force: true });
});
test("script: --authorized without --write, or without --receipt, refuses before any call", async () => {
  const { root, app } = fixtureTree();
  let touched = 0;
  const deps = { appDir: app, rootDir: root, env: { ODDS_API_KEY: "abcdefghijklmnop1234" }, fetch: async () => { touched += 1; throw new Error("no"); }, ...quiet };
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--receipt", "docs/receipts/TEST.md", "--authorized"], deps), 2);
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--authorized", "--write"], deps), 2);
  assert.equal(await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "0", "--receipt", "docs/receipts/TEST.md", "--authorized", "--write"], deps), 1);
  assert.equal(touched, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
test("script: refused receipt (no player_anytime_td) → zero calls", async () => {
  const { root, app } = fixtureTree({ receiptText: receipt({ props: "`player_pass_yds`" }) });
  let touched = 0;
  const code = await captureMain(["--now", NOW, "--events", SFDAL, "--max-credits", "1", "--receipt", "docs/receipts/TEST.md", "--authorized", "--write"], { appDir: app, rootDir: root, env: { ODDS_API_KEY: "abcdefghijklmnop1234" }, fetch: async () => { touched += 1; throw new Error("no"); }, ...quiet });
  assert.equal(code, 2);
  assert.equal(touched, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
test("script authorized (stubbed provider): writes capture + ledger + anytime-td-latest.json, NEVER markets/latest.json, no key in any file", async () => {
  const KEY = "abcdefghijklmnop1234";
  const { root, app } = fixtureTree();
  const { fn, calls } = fakeFetch(standardRoutes());
  const code = await captureMain(["--now", NOW, "--events", `${SFDAL},${PITCIN}`, "--max-credits", "2", "--receipt", "docs/receipts/TEST.md", "--authorized", "--write"], { appDir: app, rootDir: root, env: { ODDS_API_KEY: KEY }, fetch: fn, ...quiet });
  assert.equal(code, 0);
  assert.equal(calls.length, 3);
  const files = listFiles(root);
  assert.ok(files.includes("app/public/data/nfl/markets/anytime-td-latest.json"));
  assert.ok(!files.includes("app/public/data/nfl/markets/latest.json"));
  assert.ok(files.includes("data/internal/research/odds/nfl/p171-ledger.json"));
  assert.ok(files.includes("data/internal/research/odds/nfl/atd-targeted-20261115T1830.json"));
  for (const f of files.filter((x) => x.endsWith(".json"))) assert.ok(!fs.readFileSync(path.join(root, f), "utf8").includes(KEY), `${f} must not contain the key`);
  const pubBlob = fs.readFileSync(path.join(app, "public/data/nfl/markets/anytime-td-latest.json"), "utf8");
  for (const marker of ["PRIVATE_RESEARCH", "apiKey", "keyFingerprint", "cumulativeCredits", "bovada", "quarantined"]) assert.ok(!pubBlob.includes(marker), `public file must not carry "${marker}"`);
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "data/internal/research/odds/nfl/p171-ledger.json"), "utf8"));
  assert.equal(ledger.cumulativeCredits, 2);
  const cap = JSON.parse(fs.readFileSync(path.join(root, "data/internal/research/odds/nfl/atd-targeted-20261115T1830.json"), "utf8"));
  assert.equal(cap.keyFingerprint, "len20…1234");
  assert.ok(cap.events[0].rows.some((r) => r.bookmaker === "bovada"), "the private capture keeps every book");

  // a second run inside the freshness window buys nothing and leaves the public file byte-identical
  const pubPath = path.join(app, "public/data/nfl/markets/anytime-td-latest.json");
  const before = fs.readFileSync(pubPath, "utf8");
  const second = fakeFetch(standardRoutes());
  const code2 = await captureMain(["--now", "2026-11-15T18:40:00Z", "--events", `${SFDAL},${PITCIN}`, "--max-credits", "2", "--receipt", "docs/receipts/TEST.md", "--authorized", "--write"], { appDir: app, rootDir: root, env: { ODDS_API_KEY: KEY }, fetch: second.fn, ...quiet });
  assert.equal(code2, 0);
  assert.equal(second.calls.length, 1, "only the free index");
  assert.equal(fs.readFileSync(pubPath, "utf8"), before, "last-known-good preserved");
  fs.rmSync(root, { recursive: true, force: true });
});
