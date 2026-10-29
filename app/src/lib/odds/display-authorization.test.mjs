/* The display authorization record: refuses by default, refuses partial records, and NBA_LINE_DISPLAY derives from it.
   Run: node --test src/lib/odds/display-authorization.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DISPLAY_AUTHORIZATION, DISPLAY_SURFACE_FIELD, assertDisplayAuthorized, displayAuthorization, DisplayNotAuthorizedError, NOT_AUTHORIZED_REASON,
} from "./display-authorization.mjs";
import { NBA_LINE_DISPLAY, nbaLineDisplayFrom } from "../sports/nba/line-board.mjs";

const FULL = { siteDisplay: true, socialDisplay: true, providerTermsRef: "docs/legal/FIXTURE_TERMS.md", attribution: null, approvedBy: "fixture-founder", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null };
const rec = (o = {}) => ({ nba: { ...FULL, ...o } });

test("committed state: nothing is authorized, every surface refuses, and the record is frozen", () => {
  assert.deepEqual(
    { ...DISPLAY_AUTHORIZATION.nba },
    { siteDisplay: false, socialDisplay: false, providerTermsRef: null, attribution: null, approvedBy: null, approvedAt: null, socialFeedPrices: false, socialFeedPricesConfirmationRef: null },
  );
  assert.ok(Object.isFrozen(DISPLAY_AUTHORIZATION) && Object.isFrozen(DISPLAY_AUTHORIZATION.nba));
  for (const s of Object.keys(DISPLAY_SURFACE_FIELD)) {
    const v = displayAuthorization("nba", s);
    assert.equal(v.ok, false, s);
    assert.equal(v.attribution, null);
    assert.throws(() => assertDisplayAuthorized("nba", s), (e) => e instanceof DisplayNotAuthorizedError && /REFUSED: nba lines are not authorized/.test(e.message));
  }
});

test("a complete record authorizes exactly the surfaces switched on; attribution is optional", () => {
  assert.equal(displayAuthorization("nba", "site", rec()).ok, true);
  assert.equal(displayAuthorization("nba", "social", rec()).ok, true);
  assert.equal(displayAuthorization("nba", "site", rec({ socialDisplay: false })).ok, true, "site and social are independent");
  assert.equal(displayAuthorization("nba", "social", rec({ socialDisplay: false })).ok, false);
  const withAttr = assertDisplayAuthorized("nba", "site", rec({ attribution: "Fixture attribution sentence." }));
  assert.deepEqual([withAttr.attribution, withAttr.providerTermsRef, withAttr.approvedBy], ["Fixture attribution sentence.", "docs/legal/FIXTURE_TERMS.md", "fixture-founder"]);
});

test("partial or malformed records refuse (a half-filled record is never a permission)", () => {
  for (const [o, why] of [
    [{ providerTermsRef: null }, /providerTermsRef is missing/], [{ providerTermsRef: "  " }, /providerTermsRef is missing/],
    [{ approvedBy: null }, /approvedBy is missing/], [{ approvedAt: null }, /approvedAt is missing/],
    [{ approvedAt: "2099-02-30" }, /YYYY-MM-DD/], [{ approvedAt: "yesterday" }, /YYYY-MM-DD/],
    [{ siteDisplay: "true" }, /siteDisplay must be true or false/], [{ socialFeedPrices: undefined }, /socialFeedPrices must be true or false/],
    [{ attribution: "" }, /attribution, when present/],
  ]) {
    const v = displayAuthorization("nba", "site", rec(o));
    assert.equal(v.ok, false, JSON.stringify(o));
    assert.match(v.reasons.join("; "), why);
  }
  assert.equal(displayAuthorization("nfl", "site", rec()).ok, false, "a sport without a record refuses");
  assert.equal(displayAuthorization("nba", "email", rec()).ok, false, "an unknown surface refuses");
  assert.equal(displayAuthorization("nba", "site", null).ok, false);
});

test("social feed prices are a separate switch that needs written provider confirmation and the social surface", () => {
  assert.equal(displayAuthorization("nba", "socialPrices", rec()).ok, false, "off by default even when social is on");
  assert.match(displayAuthorization("nba", "socialPrices", rec({ socialFeedPrices: true })).reasons.join("; "), /socialFeedPricesConfirmationRef is missing/);
  assert.match(displayAuthorization("nba", "socialPrices", rec({ socialFeedPrices: true, socialFeedPricesConfirmationRef: "docs/legal/FIXTURE_CONFIRM.md", socialDisplay: false })).reasons.join("; "), /socialDisplay is not true/);
  assert.equal(displayAuthorization("nba", "socialPrices", rec({ socialFeedPrices: true, socialFeedPricesConfirmationRef: "docs/legal/FIXTURE_CONFIRM.md" })).ok, true);
});

test("NBA_LINE_DISPLAY is DERIVED from the record — one switch, not two", () => {
  assert.deepEqual({ ...NBA_LINE_DISPLAY }, { ...nbaLineDisplayFrom(DISPLAY_AUTHORIZATION) });
  assert.deepEqual({ ...NBA_LINE_DISPLAY }, { public: false, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba });
  assert.equal(NBA_LINE_DISPLAY.reason, "Provider display terms for NBA lines are not confirmed for this site (founder decision pending).", "the feed's reason sentence is unchanged");
  assert.deepEqual({ ...nbaLineDisplayFrom(rec()) }, { public: true, social: true, socialPrices: false, reason: null });
  assert.deepEqual({ ...nbaLineDisplayFrom(rec({ socialDisplay: false })) }, { public: true, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba });
  assert.deepEqual({ ...nbaLineDisplayFrom(rec({ approvedBy: null })) }, { public: false, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba }, "partial → both off");
  // no surface sets its own boolean: line-board.mjs holds no literal switch
  const src = fs.readFileSync(new URL("../sports/nba/line-board.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /public:\s*(true|false)|social:\s*(true|false)/);
});
