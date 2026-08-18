/**
 * THE EPL ODDS ALLOWANCE, AND THE THREE-WAY ISOLATION BETWEEN RECEIPTS.
 *
 * Same contract as the UFC allowance, one sport over — plus the cross-sport matrix, which is the
 * invariant that gets harder to hold with every receipt added. With three allowances on disk there
 * are nine (receipt, sport) pairs and exactly three of them may parse. A receipt that satisfies a
 * gate it was not written for turns three separate ceilings into one shared pool.
 *
 * EPL differs from UFC in one way worth pinning: it buys TWO markets, so the worst-case cost of a
 * call is 2 credits rather than 1. The ceiling arithmetic has to use the real formula
 * (markets x regions), not a hardcoded 1, or the breaker trips at twice the intended spend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSportAuthorizationReceipt, AUTHORIZED_SPORTS, LEDGER_RELPATH } from "./p171-authorization.mjs";

const REPO = path.resolve(process.cwd(), "..");
const RECEIPTS = { nfl: "ODDS_AUTHORIZATION_P171.md", ufc: "ODDS_AUTHORIZATION_UFC.md", epl: "ODDS_AUTHORIZATION_EPL.md" };
const read = (name) => {
  const p = path.join(REPO, "docs", "receipts", name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

test("the committed EPL receipt parses, with the terms the founder chose", () => {
  const md = read(RECEIPTS.epl);
  assert.ok(md, "no committed EPL receipt — without one no paid EPL call may be made");
  const a = parseSportAuthorizationReceipt(md, "epl");
  assert.ok(a.ok, `the EPL receipt did not parse: ${a.errors?.join("; ")}`);
  assert.equal(a.sportKey, "soccer_epl");
  assert.equal(a.ceiling, 500, "the ceiling is the founder's stated circuit breaker; changing it needs a new receipt");
  assert.equal(a.ledgerRelPath, LEDGER_RELPATH.epl);
});

test("EVERY receipt authorizes exactly one sport — the full matrix", () => {
  const docs = Object.fromEntries(Object.entries(RECEIPTS).map(([s, f]) => [s, read(f)]).filter(([, md]) => md));
  const sports = Object.keys(AUTHORIZED_SPORTS);
  for (const [owner, md] of Object.entries(docs)) {
    for (const sport of sports) {
      const ok = parseSportAuthorizationReceipt(md, sport).ok;
      if (sport === owner) assert.ok(ok, `the ${owner} receipt must authorize ${owner}`);
      else assert.equal(ok, false, `the ${owner} receipt must NEVER authorize ${sport} — that merges two ceilings into one pool`);
    }
  }
});

test("every authorized sport has its own ledger, and no two share one", () => {
  const paths = Object.keys(AUTHORIZED_SPORTS).map((s) => {
    const p = LEDGER_RELPATH[s];
    assert.ok(p, `${s} can be authorized but has nowhere to count its spend`);
    return p;
  });
  assert.equal(new Set(paths).size, paths.length, "two sports share a ledger — one sport's spend would consume another's ceiling");
});

test("the EPL capture cannot be widened past what the receipt authorizes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "epl", "capture-epl-odds.mjs"), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(body, /const MARKETS = \["h2h", "totals"\]/, "markets must be fixed at h2h + totals");
  assert.match(body, /const REGIONS = \["us"\]/, "regions must be fixed at us");
  assert.ok(!/arg\(\s*"--markets"/.test(body) && !/arg\(\s*"--regions"/.test(body),
    "markets/regions must not be settable from the command line");

  // Two markets means the worst case is 2, not 1. A hardcoded cost would trip the breaker at
  // double the intended spend.
  assert.match(body, /WORST_CASE_CREDITS = MARKETS\.length \* REGIONS\.length/,
    "worst-case cost must come from the provider's formula, never a literal");

  assert.ok(!/\/events\/\$\{[^}]*\}\/odds/.test(body), "the per-event odds endpoint is out of scope");
  assert.match(body, /\/v4\/sports\/\$\{SPORT_KEY\}\/odds/, "the bulk route is the only authorized endpoint");
  assert.ok(body.indexOf("assertCallAllowed") < body.indexOf("await fetch"), "the ceiling is checked before the call, never after");
  assert.match(body, /const APPLY = has\("--apply"\)/, "the default must be a dry run");
  assert.ok(body.indexOf("if (!APPLY)") < body.indexOf("await fetch"), "the dry-run exit must precede any network call");
  assert.match(body, /assertNoSecretLeak\(snapshot, \[KEY\]\)/, "the snapshot must be scanned against the real key before it is written");

  // Only markets we paid for may be recorded — a market key arriving in the payload that we did not
  // buy must not be silently persisted as though it were part of the capture.
  assert.match(body, /MARKETS\.includes\(m\.key\)/, "the parser must ignore any market outside the authorized set");
});

test("three-way prices are de-vigged as a set, not per outcome", () => {
  /*
   * The one modelling-adjacent invariant worth guarding here. A three-way book price sums to well
   * over 1; scoring a model against the raw implied number scores it against the bookmaker's margin
   * as well as its opinion. Soccer makes this easy to get wrong, because treating the draw as a
   * two-way complement looks reasonable and is not.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "epl", "capture-epl-odds.mjs"), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(body, /noVig/, "the capture must publish no-vig probabilities");
  assert.match(body, /sum = raw\.reduce/, "the de-vig must normalise across the whole outcome set");
});

test("the published EPL snapshot attaches no model claim", () => {
  const p = path.join(process.cwd(), "public", "data", "soccer", "epl", "odds", "latest.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const raw = JSON.stringify(doc);
  assert.doesNotMatch(raw, /apiKey/i, "the snapshot names the key parameter");
  assert.doesNotMatch(raw, /"bookmakers"/, "a raw provider payload must never be republished");
  // The model card requires this snapshot BEFORE its comparison can run, and that comparison is a
  // bar it has not passed. A price capture that shipped a lean would be asserting the result.
  for (const banned of [/"lean"/, /"edge"/i, /"pick"/, /"recommendation"/]) {
    assert.doesNotMatch(raw, banned, `the capture carries a model claim it has not earned: ${banned}`);
  }
});

test("the EPL ledger records spend without recording the account", () => {
  const p = path.join(REPO, LEDGER_RELPATH.epl);
  if (!fs.existsSync(p)) return;
  const l = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(l.sport, "epl");
  assert.ok(l.cumulativeCredits <= 500, `cumulative EPL spend ${l.cumulativeCredits} is past the authorized ceiling`);
  assert.doesNotMatch(JSON.stringify(l), /apiKey/i, "the ledger must never name the key parameter");
  for (const r of l.requests ?? []) {
    assert.ok(Number.isFinite(r.creditsUsed), `a request with no recorded cost: ${r.purpose}`);
    if (r.status !== 200) assert.equal(r.creditsUsed, 0, "an uncharged failure must not be booked as spend");
  }
});

test("the matchweek cron fires before the earliest kickoff", () => {
  const wf = path.join(REPO, ".github", "workflows", "epl-matchweek.yml");
  if (!fs.existsSync(wf)) return;
  const src = fs.readFileSync(wf, "utf8");
  const hours = [...src.matchAll(/- cron: "(\d+) (\d+) \* \* \d+"/g)].map((m) => Number(m[2]));
  assert.ok(hours.length >= 1, "no cron schedule found");
  // EPL's earliest regular kickoff is Saturday 12:30 UK = 11:30 UTC in summer. GitHub crons drift
  // an hour or more, so a capture scheduled past 09:00 UTC can land AFTER kickoff — which the
  // receipt forbids, and which would price matches already in progress.
  for (const h of hours) {
    assert.ok(h <= 9, `a capture at ${h}:00 UTC can drift past the 11:30 UTC earliest kickoff`);
  }
});
