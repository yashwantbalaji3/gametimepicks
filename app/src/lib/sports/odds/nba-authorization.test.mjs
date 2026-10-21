/**
 * NBA odds authorization READINESS: a future NBA receipt can be read, its dated expiry is enforced with a clock, and its
 * prop markets are a closed list. No NBA receipt is committed, so nothing here authorizes a call.
 * Run: npx tsx --test src/lib/sports/odds/nba-authorization.test.mjs
 *
 * The receipt text below is a TEST FIXTURE in the shape the points plan proposes (docs/nba points-market plan §1c). It
 * is not a founder answer and is never written to docs/receipts/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  AUTHORIZED_SPORTS, LEDGER_RELPATH, etEndOfDayMs, expiryTerm, parseAuthorizationReceipt, parseSportAuthorizationReceipt, propMarketsAuthorized,
} from "./p171-authorization.mjs";

const FIXTURE = `# TEST FIXTURE — NBA points receipt shape (not a founder answer)

| Term | Value |
|---|---|
| Scope | NBA only (\`basketball_nba\`), regular season |
| Cumulative ceiling | **800 credits** (circuit breaker) |
| Markets added | \`player_points\` only |
| Expiry | the ceiling, or 2026-11-20 23:59 ET, whichever comes first |
| Discipline | do not retry blindly |
`;

test("every committed NBA receipt is DATED (never open-ended) and points-only; none exists before the founder answers", () => {
  const dir = path.join(process.cwd(), "..", "docs", "receipts");
  for (const f of fs.readdirSync(dir).filter((x) => /NBA/i.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const e = expiryTerm(text);
    assert.equal(e.kind, "DATED", `${f}: an NBA receipt must carry a dated expiry`);
    const parsed = parseSportAuthorizationReceipt(text, "nba", { now: new Date(e.expiresAtMs - 60_000).toISOString() });
    assert.equal(parsed.ok, true, `${f}: ${parsed.errors?.join("; ")}`);
    assert.deepEqual(parsed.propMarkets, ["player_points"], `${f}: points only`);
    assert.equal(parseSportAuthorizationReceipt(text, "nba", { now: new Date(e.expiresAtMs + 1).toISOString() }).ok, false, `${f}: refuses after its date`);
    assert.match(text, /founder/i, `${f}: quotes the founder's answer`);
  }
  assert.equal(AUTHORIZED_SPORTS.nba.sportKey, "basketball_nba");
  assert.equal(LEDGER_RELPATH.nba, "data/internal/research/odds/nba/authorization-ledger.json", "NBA gets its own ledger; one ceiling never funds another");
});

test("a DATED expiry is read as DATED (never as CEILING_ONLY) and ends at 23:59:59.999 ET", () => {
  const e = expiryTerm(FIXTURE);
  assert.equal(e.kind, "DATED");
  assert.equal(e.expiresOnEt, "2026-11-20");
  assert.equal(new Date(e.expiresAtMs).toISOString(), "2026-11-21T04:59:59.999Z", "11-20 is after the DST change: EST, UTC−5");
  assert.equal(new Date(etEndOfDayMs("2026-10-25")).toISOString(), "2026-10-26T03:59:59.999Z", "EDT, UTC−4");
  assert.ok(Number.isNaN(etEndOfDayMs("2026-13-40")));
});

test("the dated half is ENFORCED: no clock refuses, a clock after the date refuses, a clock before it parses", () => {
  const none = parseSportAuthorizationReceipt(FIXTURE, "nba");
  assert.equal(none.ok, false);
  assert.match(none.errors.join("; "), /no clock was given/);
  const late = parseSportAuthorizationReceipt(FIXTURE, "nba", { now: "2026-11-21T05:00:00Z" });
  assert.equal(late.ok, false);
  assert.match(late.errors.join("; "), /expired at the end of 2026-11-20 ET/);
  const ok = parseSportAuthorizationReceipt(FIXTURE, "nba", { now: "2026-11-21T04:59:00Z" });
  assert.equal(ok.ok, true, ok.errors?.join("; "));
  assert.equal(ok.ceiling, 800);
  assert.deepEqual(ok.propMarkets, ["player_points"]);
  assert.equal(parseAuthorizationReceipt(FIXTURE).ok, false, "the clockless legacy reader refuses a dated receipt instead of ignoring the date");
});

test("one receipt, one sport, both directions", () => {
  for (const other of ["nfl", "ufc", "epl"]) assert.equal(parseSportAuthorizationReceipt(FIXTURE, other, { now: "2026-10-22T00:00:00Z" }).ok, false, other);
  const mixed = FIXTURE.replace("regular season", "regular season, also `americanfootball_nfl`");
  assert.equal(parseSportAuthorizationReceipt(mixed, "nba", { now: "2026-10-22T00:00:00Z" }).ok, false);
});

test("prop markets are a closed list: points-only authorizes player_points and nothing else", () => {
  const parsed = parseSportAuthorizationReceipt(FIXTURE, "nba", { now: "2026-10-22T00:00:00Z" });
  assert.deepEqual(propMarketsAuthorized(parsed, ["player_points"]), { ok: true, refused: [] });
  assert.deepEqual(propMarketsAuthorized(parsed, ["player_points", "player_rebounds"]).refused, ["player_rebounds"]);
  assert.equal(propMarketsAuthorized(parsed, []).ok, false, "an empty request is not an authorization");
  assert.equal(propMarketsAuthorized({ ok: false }, ["player_points"]).ok, false, "a refused receipt authorizes nothing");
});

test("committed receipts keep their classification (no pre-existing receipt has a date in its Expiry row)", () => {
  const dir = path.join(process.cwd(), "..", "docs", "receipts");
  // The NBA points pilot receipt (founder 2026-10-21: "October 21, 2026 only") is DATED by design; every OTHER receipt
  // keeps its ceiling-only classification exactly as before.
  const NBA_PILOT = "ODDS_AUTHORIZATION_NBA_POINTS_PILOT_2026-10-21.md";
  const others = fs.readdirSync(dir).filter((x) => x.endsWith(".md") && x !== NBA_PILOT);
  assert.ok(others.length >= 4, "the pre-existing receipts are still scanned");
  for (const f of others) assert.notEqual(expiryTerm(fs.readFileSync(path.join(dir, f), "utf8")).kind, "DATED", f);
  const pilot = expiryTerm(fs.readFileSync(path.join(dir, NBA_PILOT), "utf8"));
  assert.equal(pilot.kind, "DATED", "the NBA pilot receipt expires on its date");
  assert.equal(pilot.expiresOnEt, "2026-10-21");
});
