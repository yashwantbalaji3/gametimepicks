/**
 * NBA prop capture, receipt 2026-11-11 (founder): the receipt guard, the preflight refusal paths, the 20–75 min window,
 * MISSED_WINDOW, no price in committed output, and the guards that keep the capture off GitHub-hosted runners.
 * SYNTHETIC replies, schedules and ledgers only; no network call is ever made here.
 *
 * Run: cd app && npx tsx --test src/lib/sports/odds/nba-props/preflight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { nbaPropsPreflight, tickTargets, missedWindows, weeklyCapOf, capturedEspnIds, LEAD_WINDOW_MINUTES } from "./preflight.mjs";
import { parseNbaPropsReceipt } from "./credits.mjs";
import { recordRequest } from "../p171-authorization.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../eligible-operators.mjs";
import { buildInputPredicate } from "../../../ops/stamp-only-gate.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const RECEIPT_REL = "docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md";
const RECEIPT = fs.readFileSync(path.join(ROOT, RECEIPT_REL), "utf8");
const MARKETS = ["player_points", "player_rebounds", "player_assists", "player_threes"];
const NOW = "2026-11-12T00:00:00Z";
const row = (id, tip, statusRaw = "STATUS_SCHEDULED") => ({ providerEventId: id, dateUtc: tip, statusRaw });
const ok = { status: 200, headers: { "x-requests-used": "1200", "x-requests-remaining": "18000", "x-requests-last": "0" } };
const base = { now: NOW, receiptText: RECEIPT, ledger: { cumulativeCredits: 11, requests: [] }, targets: [row("e1", "2026-11-12T00:45Z")], markets: MARKETS, bookmakers: [...ELIGIBLE_OPERATOR_KEYS], reply: ok, baselineUsed: 1000, minCreditsRemaining: 2000 };

test("receipt: the founder's text verbatim, the four verified markets, ceiling 11 + 450, dated expiry, weekly cap, local runner", () => {
  const r = parseNbaPropsReceipt(RECEIPT, { now: "2026-11-11T06:00:00Z" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.markets, MARKETS);
  assert.equal(r.ceiling, 461);
  assert.equal(r.expiry.expiresOnEt, "2026-11-17");
  assert.equal(weeklyCapOf(RECEIPT), 3500);
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/odds/nba/authorization-ledger.json"), "utf8"));
  assert.match(RECEIPT, new RegExp(`committed ledger's \`cumulativeCredits\` on main at receipt time is \\*\\*${ledger.cumulativeCredits}\\*\\*`), "the stated arithmetic is the committed ledger's");
  for (const line of ["2. Maximum usage: 450 API credits for the entire authorization period, not 450 per day.", "3. Cadence: At most one authorized capture per game, between 20 and 75 minutes before scheduled tipoff", "This approval covers private data collection only."]) assert.ok(RECEIPT.includes(line), line);
  assert.match(RECEIPT, /runs on the release owner's machine \(a node launchd job\), never on a GitHub-hosted runner/);
  assert.match(RECEIPT, /Kill switch/);
});

test("receipt guard refuses after its expiry and at its ceiling", () => {
  assert.equal(parseNbaPropsReceipt(RECEIPT, { now: "2026-11-18T04:59:00Z" }).ok, true);
  const late = parseNbaPropsReceipt(RECEIPT, { now: "2026-11-18T05:00:01Z" });
  assert.equal(late.ok, false);
  assert.match(late.errors.join(" "), /expired at the end of 2026-11-17 ET/);
  const after = nbaPropsPreflight({ ...base, now: "2026-11-18T06:00:00Z" });
  assert.equal(after.paidCallAllowed, false);
  assert.match(after.reasons[0], /^receipt: expiry/);
  const full = nbaPropsPreflight({ ...base, ledger: { cumulativeCredits: 458, requests: [] } });
  assert.equal(full.paidCallAllowed, false);
  assert.match(full.reasons[0], /^CEILING: 458 booked \+ 4 worst case > 461/);
  assert.equal(full.budgetExhausted, true);
});

test("preflight passes only with every condition; the numbers it reports", () => {
  const p = nbaPropsPreflight(base);
  assert.equal(p.paidCallAllowed, true, JSON.stringify(p.reasons));
  assert.equal(p.worstCase, 4, "4 markets × 1 region unit for one game");
  assert.equal(p.weekSpend, 200);
  assert.equal(p.weeklyCap, 3500);
  assert.equal(nbaPropsPreflight({ ...base, targets: [row("e1", "2026-11-12T00:45Z"), row("e2", "2026-11-12T00:50Z")] }).worstCase, 8);
  assert.equal(nbaPropsPreflight({ ...base, baselineUsed: null }).baselineUsed, 1200, "the first reading becomes the period baseline");
});

test("preflight refusal paths: nothing to price, market off the receipt, provider down, plan unreadable, plan check not free, floor, weekly cap", () => {
  const cases = [
    [{ targets: [] }, /^NOTHING_TO_PRICE/],
    [{ markets: [...MARKETS, "player_points_rebounds_assists"] }, /markets not on the receipt: player_points_rebounds_assists/],
    [{ reply: { status: 401, headers: {} } }, /^PROVIDER_UNAVAILABLE: plan check returned 401/],
    [{ reply: { status: 500, headers: {} } }, /^PROVIDER_UNAVAILABLE: plan check returned 500/],
    [{ reply: null }, /^PROVIDER_UNAVAILABLE: plan check returned no reply/],
    [{ reply: { status: 200, headers: { "x-requests-last": "0" } } }, /^PLAN_UNREADABLE/],
    [{ reply: { status: 200, headers: { ...ok.headers, "x-requests-last": "1" } } }, /^PLAN_CHECK_NOT_FREE/],
    [{ reply: { status: 200, headers: { ...ok.headers, "x-requests-remaining": "2003" } } }, /^FLOOR: 2003 remaining − 4 < 2000/],
    [{ baselineUsed: 1200 - 3497 }, /^WEEKLY_CAP: 3497 used since the period baseline \+ 4 > 3500/],
    [{ minCreditsRemaining: Number.NaN }, /ODDS_API_MIN_CREDITS_REMAINING/],
    [{ receiptText: RECEIPT.replace(/^\| Shared weekly cap .*$/m, "") }, /no 'Shared weekly cap/],
  ];
  for (const [over, re] of cases) {
    const p = nbaPropsPreflight({ ...base, ...over });
    assert.equal(p.paidCallAllowed, false, `${re} should refuse`);
    assert.match(p.reasons.join(" "), re);
  }
  assert.equal(nbaPropsPreflight({ ...base, reply: { status: 401, headers: {} } }).actionable, true, "a rejected key needs a person");
  assert.equal(nbaPropsPreflight({ ...base, reply: { status: 500, headers: {} } }).actionable, false, "a provider blip is recorded, not alerted");
});

test("window: more than 20 and at most 75 minutes before tip; never at or after tip; one capture per game", () => {
  assert.deepEqual([...LEAD_WINDOW_MINUTES], [20, 75]);
  const nowMs = Date.parse(NOW);
  const at = (min) => new Date(nowMs + min * 60e3).toISOString().replace(/\.\d{3}Z$/, "Z");
  const rows = [row("t20", at(20)), row("t21", at(21)), row("t75", at(75)), row("t76", at(76)), row("t0", at(0)), row("past", at(-5)), row("pp", at(40), "STATUS_POSTPONED")];
  assert.deepEqual(tickTargets(rows, nowMs, null).map((r) => r.providerEventId), ["t21", "t75"]);
  // a game this ledger already captured (200, pregame fingerprint) is never priced again; an early snapshot does not count
  const captured = { requests: [{ purpose: "nba props · t21", status: 200, fingerprint: "nba|odds-1|player_points" }, { purpose: "nba props · t75", status: 200, fingerprint: "nba-early|odds-2|player_points" }] };
  assert.deepEqual([...capturedEspnIds(captured)], ["t21"]);
  assert.deepEqual(tickTargets(rows, nowMs, captured).map((r) => r.providerEventId), ["t75"]);
  // a refused (non-200) call does not count as captured
  assert.deepEqual(tickTargets(rows, nowMs, { requests: [{ purpose: "nba props · t21", status: 429, fingerprint: "nba|odds-1|x" }] }).map((r) => r.providerEventId), ["t21", "t75"]);
});

test("MISSED_WINDOW: a period game whose tip passed uncaptured is recorded once, with no spend", () => {
  const nowMs = Date.parse("2026-11-12T06:00:00Z");
  const rows = [row("a", "2026-11-12T00:30Z"), row("b", "2026-11-12T03:00Z"), row("c", "2026-11-12T07:00Z"), row("old", "2026-11-10T00:30Z"), row("pp", "2026-11-12T01:00Z", "STATUS_POSTPONED")];
  const ledger = { requests: [{ purpose: "nba props · b", status: 200, fingerprint: "nba|o|m" }] };
  const period = { periodStartMs: Date.parse("2026-11-11T05:00:00Z"), periodEndMs: Date.parse("2026-11-18T04:59:59Z") };
  const m = missedWindows(rows, nowMs, ledger, period);
  assert.deepEqual(m.map((x) => [x.providerEventId, x.state]), [["a", "MISSED_WINDOW"]]);
  assert.deepEqual(missedWindows(rows, nowMs, ledger, { ...period, recorded: new Set(["a"]) }), []);
});

test("no price in committed output: a ledger entry carries credits, status and balance only; the ledger path is not a build input", () => {
  const e = recordRequest({ cumulativeCredits: 11, requests: [] }, { at: NOW, purpose: "nba props · e1", endpoint: "/sports/basketball_nba/events/{id}/odds?apiKey=SECRET", events: 1, markets: MARKETS, status: 200, headers: { "x-requests-last": "4", "x-requests-used": "1204", "x-requests-remaining": "17996" }, fingerprint: "nba|o|m", resultClass: "OK" });
  const entry = e.requests[0];
  assert.deepEqual(Object.keys(entry).sort(), ["at", "creditsUsed", "endpoint", "events", "fingerprint", "markets", "providerRequestsRemaining", "providerRequestsUsed", "purpose", "regions", "resultClass", "status"]);
  assert.doesNotMatch(JSON.stringify(e), /SECRET|price|odds"?:|american|decimal|bookmaker|draftkings|fanduel/i);
  const committed = fs.readFileSync(path.join(ROOT, "data/internal/research/odds/nba/authorization-ledger.json"), "utf8");
  assert.doesNotMatch(committed, /"(price|americanOdds|overAmerican|underAmerican|line|point|bookmaker|book)"\s*:/, "the committed ledger holds no line, price or book");
  const isInput = buildInputPredicate(fs.readFileSync(path.join(ROOT, "app/scripts/vercel-ignore-build.sh"), "utf8"));
  assert.equal(isInput("data/internal/research/odds/nba/authorization-ledger.json"), false, "a ledger commit triggers no Vercel build");
  assert.equal(isInput(RECEIPT_REL), false);
});

test("the capture never runs on a GitHub-hosted runner: no workflow names the receipt, the runner or the capture with the new receipt", () => {
  const wf = path.join(ROOT, ".github", "workflows");
  for (const f of fs.readdirSync(wf)) {
    const t = fs.readFileSync(path.join(wf, f), "utf8");
    assert.doesNotMatch(t, /ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11|run-nba-props-local-tick/, `${f} must not run the local capture`);
  }
  const win = fs.readFileSync(path.join(wf, "nba-forecast-window.yml"), "utf8");
  assert.doesNotMatch(win, /ODDS_API_KEY|capture-nba-props-odds/, "the pregame window carries no odds key and no capture");
});

test("runner order: kill switch, dedicated checkout, receipt, targets (no call when none), preflight, then the capture; prices only to the private dir", () => {
  const src = fs.readFileSync(path.join(ROOT, "app/scripts/nba/run-nba-props-local-tick.mjs"), "utf8");
  const at = (s) => { const i = src.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = ['"odds", "nba", "STOP"', "CHECKOUT_MARKER))", "parseNbaPropsReceipt(receiptText", "tickTargets(", "await fetch(", "nbaPropsPreflight(", "if (!pf.paidCallAllowed)", 'path.join(REPO, "app/scripts/nba/capture-nba-props-odds.mjs")'];
  for (let i = 1; i < order.length; i += 1) assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} before ${order[i]}`);
  assert.ok(at("if (!targets.length)") < at("await fetch("), "no network call when nothing is in window");
  assert.match(src, /"--apply", "--out-dir", priv\.dir/, "the capture writes prices only to the resolved private directory");
  assert.match(src, /resolvePrivateDataDir\(/);
  assert.match(src, /if \(has\("--apply"\) && !has\("--commit-ledger"\)\)/);
  assert.match(src, /git\("add", "--", LEDGER_RELPATH\.nba\)/, "only the ledger is ever staged");
  assert.equal((src.match(/git\("add"/g) ?? []).length, 1);
  assert.doesNotMatch(src.replace(/^\s*(\*|\/\/).*$/gm, ""), /writeFileSync\((?!STATE_FILE)/, "the runner writes no file but its private state (prices are the capture script's, to the private dir)");
});
