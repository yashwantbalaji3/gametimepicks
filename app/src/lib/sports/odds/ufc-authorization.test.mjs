/**
 * THE UFC ODDS ALLOWANCE — what it may buy, and what it may never fund.
 *
 * This gate stands in front of real money on the founder's provider account, so the invariants are
 * about spend rather than presentation:
 *
 *   · one receipt authorizes ONE sport, in both directions — the NFL allowance cannot buy a fight
 *     card and the UFC allowance cannot buy an NFL slate;
 *   · the purchase is fixed by the receipt (h2h, us, bulk) and cannot be widened by a flag;
 *   · each sport's cumulative spend is counted against its own ceiling in its own ledger;
 *   · a missing or ambiguous term refuses. Authorization is never inferred.
 *
 * The per-event endpoint is treated as a defect, not a preference: the July 2026 capture paid 20
 * credits for a card the bulk route prices for 1, so a regression toward it is 20x spend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseSportAuthorizationReceipt, AUTHORIZED_SPORTS, LEDGER_RELPATH,
  emptyLedger, assertCallAllowed, isDuplicateRequest,
} from "./p171-authorization.mjs";

const REPO = path.resolve(process.cwd(), "..");
const UFC_RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_UFC.md");
const NFL_RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_P171.md");
const readReceipt = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

test("the committed UFC receipt parses, with the terms the founder chose", () => {
  const md = readReceipt(UFC_RECEIPT);
  assert.ok(md, "no committed UFC receipt — without one no paid UFC call may be made");
  const a = parseSportAuthorizationReceipt(md, "ufc");
  assert.ok(a.ok, `the UFC receipt did not parse: ${a.errors?.join("; ")}`);
  assert.equal(a.sportKey, "mma_mixed_martial_arts");
  assert.equal(a.ceiling, 500, "the ceiling is the founder's stated circuit breaker; changing it needs a new receipt");
  assert.equal(a.ledgerRelPath, LEDGER_RELPATH.ufc);
});

test("neither receipt can fund the other sport", () => {
  const ufc = readReceipt(UFC_RECEIPT), nfl = readReceipt(NFL_RECEIPT);
  if (!ufc || !nfl) return;
  assert.equal(parseSportAuthorizationReceipt(ufc, "nfl").ok, false, "the UFC receipt must never authorize an NFL call");
  assert.equal(parseSportAuthorizationReceipt(nfl, "ufc").ok, false, "the NFL receipt must never authorize a UFC call");
});

test("a receipt naming two sport keys is refused outright", () => {
  // The obvious way to widen an allowance is to add a second key to a receipt that already parses.
  const widened = readReceipt(UFC_RECEIPT)?.replace("`mma_mixed_martial_arts`", "`mma_mixed_martial_arts` and `americanfootball_nfl`");
  if (!widened) return;
  const a = parseSportAuthorizationReceipt(widened, "ufc");
  assert.equal(a.ok, false, "one receipt authorizes one sport");
  assert.ok(a.errors.some((e) => /one receipt authorizes one sport/.test(e)));
});

test("a receipt missing any operative term refuses", () => {
  const md = readReceipt(UFC_RECEIPT);
  if (!md) return;
  for (const [label, mutant] of [
    ["no ceiling", md.replace(/\*\*500 credits\*\*/, "**as needed**")],
    ["no scope key", md.replace(/`mma_mixed_martial_arts`/g, "the MMA key")],
    ["no retry discipline", md.replace(/do not retry\s+blindly/gi, "retry as required")],
  ]) {
    assert.equal(parseSportAuthorizationReceipt(mutant, "ufc").ok, false, `${label}: an incomplete receipt must refuse`);
  }
});

test("the ceiling is a hard refusal, not a warning", () => {
  const auth = { ok: true, ceiling: 500 };
  const at499 = assertCallAllowed({ authorization: auth, ledger: { cumulativeCredits: 499 }, worstCaseCredits: 1, purpose: "t" });
  assert.equal(at499.ok, true, "a call that lands exactly on the ceiling is allowed");
  const over = assertCallAllowed({ authorization: auth, ledger: { cumulativeCredits: 500 }, worstCaseCredits: 1, purpose: "t" });
  assert.equal(over.ok, false, "a call that would cross the ceiling must be refused BEFORE it is made");
  // No authorization at all refuses regardless of how small the spend is.
  assert.equal(assertCallAllowed({ authorization: { ok: false }, ledger: { cumulativeCredits: 0 }, worstCaseCredits: 1 }).ok, false);
});

test("each sport counts against its own ledger", () => {
  assert.notEqual(LEDGER_RELPATH.ufc, LEDGER_RELPATH.nfl, "a shared ledger would let one sport's spend consume another's ceiling");
  const l = emptyLedger("docs/receipts/ODDS_AUTHORIZATION_UFC.md", { sport: "ufc", program: "UFC" });
  assert.equal(l.sport, "ufc");
  assert.match(l.artifact, /ufc/, "a ledger labelled for the wrong sport makes the spend unreadable after the fact");
  assert.equal(l.cumulativeCredits, 0);
});

test("isDuplicateRequest returns an OBJECT — testing the return value blocks everything", () => {
  /*
   * The capture script did exactly this and refused every call forever: {duplicate:false} is
   * truthy. It failed in the safe direction, which is precisely why it could have sat unnoticed.
   */
  const clean = isDuplicateRequest({ requests: [] }, { fingerprint: "f", nowIso: "2026-08-18T00:00:00Z" });
  assert.equal(clean.duplicate, false);
  assert.ok(clean, "the return value itself is truthy — call sites must read .duplicate");

  const now = "2026-08-18T00:10:00Z";
  const held = { requests: [{ fingerprint: "f", at: "2026-08-18T00:00:00Z", creditsUsed: 1 }] };
  assert.equal(isDuplicateRequest(held, { fingerprint: "f", nowIso: now, freshnessMinutes: 30 }).duplicate, true);
  assert.equal(isDuplicateRequest(held, { fingerprint: "other", nowIso: now, freshnessMinutes: 30 }).duplicate, false);
});

test("the capture script cannot be widened past what the receipt authorizes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "ufc", "capture-ufc-odds.mjs"), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // The purchase terms must be constants, not argv-driven — a flag that widens them is a flag that
  // spends outside the authorization.
  assert.match(body, /const MARKETS = \["h2h"\]/, "markets must be fixed at h2h");
  assert.match(body, /const REGIONS = \["us"\]/, "regions must be fixed at us");
  assert.ok(!/arg\(\s*"--markets"/.test(body) && !/arg\(\s*"--regions"/.test(body),
    "markets/regions must not be settable from the command line");

  // The per-event endpoint is out of scope by receipt: 20 credits where bulk costs 1.
  assert.ok(!/\/events\/\$\{[^}]*\}\/odds/.test(body), "the per-event odds endpoint is out of scope");
  assert.match(body, /\/v4\/sports\/\$\{SPORT_KEY\}\/odds/, "the bulk route is the only authorized endpoint");

  // Worst case must be computed from the provider's cost formula BEFORE the call.
  assert.match(body, /WORST_CASE_CREDITS = MARKETS\.length \* REGIONS\.length/);
  assert.ok(body.indexOf("assertCallAllowed") < body.indexOf("await fetch"), "the ceiling is checked before the call, never after");

  // Spending must be opt-in.
  assert.match(body, /const APPLY = has\("--apply"\)/, "the default must be a dry run");
  assert.ok(body.indexOf("if (!APPLY)") < body.indexOf("await fetch"), "the dry-run exit must precede any network call");
});

test("the published snapshot never carries a key or a raw payload", () => {
  const p = path.join(process.cwd(), "public", "data", "ufc", "odds-latest.json");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  assert.doesNotMatch(raw, /apiKey/i, "the snapshot names the key parameter");
  assert.doesNotMatch(raw, /"bookmakers"/, "a raw provider payload must never be republished");
  /*
   * `authorization` is NOT banned outright: these snapshots carry an `authorization` PROVENANCE
   * block — the receipt path, the ceiling, the cumulative spend — which is exactly the audit trail
   * the receipt requires them to carry. Banning the word condemned that block on its first real
   * capture. What must never appear is a credential VALUE, so the check is on a string-valued
   * authorization (an HTTP-header shape) rather than the provenance object.
   */
  assert.doesNotMatch(raw, /"(secret|token|password)"\s*:/i, "a credential-shaped FIELD is in the snapshot");
  assert.doesNotMatch(raw, /"authorization"\s*:\s*"/i, "a string-valued authorization field looks like a header credential");

  /*
   * DELIBERATELY NOT a bare-hex scan. The first version asserted no 28+ character hex run and
   * failed instantly on twenty provider event ids — because a provider event id and an API key are
   * the same SHAPE, and no amount of tuning separates them. A heuristic that cannot distinguish the
   * thing it forbids from the thing it must allow is not a guard, it is a future false positive
   * that gets weakened until it means nothing.
   *
   * The real protection compares against the ACTUAL secret at write time, which is the only check
   * that can tell them apart, so this asserts the writer performs it.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "ufc", "capture-ufc-odds.mjs"), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /* The leak check takes a STRING and RETURNS a verdict. Asserting only that it is CALLED was not
     enough: the first version passed the object and ignored the result, which crashed after the
     credit was spent. So the guard requires the serialized payload and a read of `.ok`. */
  assert.match(body, /assertNoSecretLeak\(payload, \[KEY\]\)/, "the leak scan must receive the serialized payload, not an object");
  assert.match(body, /if \(!leak\.ok\)/, "the leak verdict must be READ — an unchecked fail-closed helper is a no-op");
  assert.ok(body.indexOf("assertNoSecretLeak") < body.indexOf("writeFileSync(path.join(OUT"),
    "the leak scan must run BEFORE the snapshot is written to a public path");
});

test("the private ledger records spend without recording the account", () => {
  const p = path.join(REPO, LEDGER_RELPATH.ufc);
  if (!fs.existsSync(p)) return;
  const l = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(Number.isFinite(l.cumulativeCredits), "a ledger with no total is not a ledger");
  assert.ok(l.cumulativeCredits <= 500, `cumulative UFC spend ${l.cumulativeCredits} is past the authorized ceiling`);
  const raw = JSON.stringify(l);
  assert.doesNotMatch(raw, /apiKey/i, "the ledger must never name the key parameter");
  assert.doesNotMatch(raw, /"(secret|token|password)"\s*:/i, "the ledger must never hold a credential field");
  // A failed call must be recorded, at its real cost, rather than dropped.
  for (const r of l.requests ?? []) {
    assert.ok(Number.isFinite(r.creditsUsed), `a request with no recorded cost: ${r.purpose}`);
    if (r.status !== 200) assert.equal(r.creditsUsed, 0, "an uncharged failure must not be booked as spend");
  }
});

test("every AUTHORIZED_SPORTS entry has a ledger of its own", () => {
  for (const sport of Object.keys(AUTHORIZED_SPORTS)) {
    assert.ok(LEDGER_RELPATH[sport], `${sport} can be authorized but has nowhere to count its spend`);
  }
});

test("no unguarded path can spend UFC credits outside the receipt", () => {
  /*
   * The receipt guards app/scripts/ufc/capture-ufc-odds.mjs. It does not, by itself, guard the
   * LEGACY python path — pipeline/ufc/build_odds.py predates it, buys one credit PER BOUT, and
   * consults no receipt, ledger or ceiling. Three manual workflows still carry ODDS_API_KEY and can
   * invoke it. Authorising a sport without closing its older spender is how a 500-credit circuit
   * breaker gets bypassed by a route nobody remembered.
   */
  const legacy = path.join(REPO, "pipeline", "ufc", "build_odds.py");
  if (!fs.existsSync(legacy)) return;
  const src = fs.readFileSync(legacy, "utf8");

  const fetchAt = src.indexOf("fetch_event_odds(e.get(");
  if (fetchAt === -1) return;                       // the per-event loop is gone entirely — fine
  const refuseAt = src.indexOf("REFUSED: the per-event UFC odds path is out of scope");
  assert.ok(refuseAt > -1, "the per-event UFC path must refuse to spend under the bulk-only receipt");
  assert.ok(refuseAt < fetchAt, "the refusal must precede the paid loop, not follow it");
});
