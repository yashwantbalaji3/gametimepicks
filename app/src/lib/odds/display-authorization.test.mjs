/* The display authorization record: refuses by default, refuses partial records, and NBA_LINE_DISPLAY derives from it.
   Run: node --test src/lib/odds/display-authorization.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DISPLAY_AUTHORIZATION, DISPLAY_SURFACE_FIELD, assertDisplayAuthorized, displayAuthorization, DisplayNotAuthorizedError, NOT_AUTHORIZED_REASON,
  directionAuthorization, publicDirectionGate,
} from "./display-authorization.mjs";
import { MARKET_KEYS } from "../sports/nba/line-comparison.mjs";
import { NFL_FAMILIES } from "../sports/nfl/prop-line-adapter.mjs";
import { NBA_LINE_DISPLAY, nbaLineDisplayFrom } from "../sports/nba/line-board.mjs";

const FULL = { siteDisplay: true, socialDisplay: true, providerTermsRef: "docs/legal/FIXTURE_TERMS.md", attribution: null, approvedBy: "fixture-founder", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null };
const rec = (o = {}) => ({ nba: { ...FULL, ...o } });

test("committed state: nothing is authorized, every surface refuses, and the record is frozen", () => {
  const { directionQualified, ...switches } = DISPLAY_AUTHORIZATION.nba;
  assert.ok(directionQualified && Object.isFrozen(directionQualified));
  assert.deepEqual(
    switches,
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

test("direction qualification, committed state: EVERY family of every sport is unqualified, with evidence recorded; nothing shows a direction", () => {
  const families = { nba: Object.keys(MARKET_KEYS), nfl: Object.entries(NFL_FAMILIES).filter(([, d]) => d.kind === "OU").map(([f]) => f) };
  for (const [sport, fams] of Object.entries(families)) {
    const q = DISPLAY_AUTHORIZATION[sport].directionQualified;
    assert.deepEqual(Object.keys(q).sort(), [...fams].sort(), `${sport}: one entry per over/under family`);
    for (const f of fams) {
      assert.deepEqual([q[f].qualified, q[f].approvedBy, q[f].approvedAt], [false, null, null], `${sport}/${f}`);
      assert.ok(typeof q[f].evidence === "string" && q[f].evidence.length > 20, `${sport}/${f}: evidence recorded`);
      assert.ok(Object.isFrozen(q[f]));
      for (const surface of ["site", "social"]) assert.equal(directionAuthorization(sport, f, surface).ok, false);
      assert.equal(publicDirectionGate(sport).shows(f), false);
    }
  }
  // the evidence the founder cited is on the record for the two families that must stay withheld
  assert.match(DISPLAY_AUTHORIZATION.nfl.directionQualified.reception_yds.evidence, /56\.6%.*0\.845.*0\.80.*95\/112.*1\.04/);
  assert.match(DISPLAY_AUTHORIZATION.nfl.directionQualified.receptions.evidence, /0\.42–0\.45/);
  assert.match(DISPLAY_AUTHORIZATION.nba.directionQualified.threePm.evidence, /0\.438/);
});

test("direction qualification: needs the surface authorized AND a complete qualified entry; anything partial refuses", () => {
  const q = (o = {}) => ({ pts: { qualified: true, evidence: "fixture evidence", approvedBy: "fixture-founder", approvedAt: "2099-01-02", ...o } });
  const r = (entry, extra = {}) => ({ nba: { ...FULL, directionQualified: entry, ...extra } });
  assert.equal(directionAuthorization("nba", "pts", "site", r(q())).ok, true);
  assert.equal(publicDirectionGate("nba", "site", r(q())).shows("pts"), true);
  assert.equal(publicDirectionGate("nba", "site", r(q())).shows("reb"), false, "a family not listed is unqualified");
  for (const [entry, extra, why] of [
    [q(), { siteDisplay: false }, /siteDisplay is not true/],
    [q(), { approvedBy: null }, /approvedBy is missing/],
    [q({ qualified: false }), {}, /not qualified/],
    [q({ qualified: "true" }), {}, /qualified must be true or false/],
    [q({ evidence: " " }), {}, /evidence is missing/],
    [q({ approvedBy: "" }), {}, /pts\.approvedBy is missing/],
    [q({ approvedAt: "2099-13-01" }), {}, /approvedAt must be a YYYY-MM-DD/],
    [null, {}, /no direction qualification entry/],
  ]) {
    const v = directionAuthorization("nba", "pts", "site", r(entry, extra));
    assert.equal(v.ok, false, String(why));
    assert.match(v.reasons.join("; "), why);
  }
  assert.equal(directionAuthorization("nba", "pts", "social", r(q(), { socialDisplay: false })).ok, false, "the social surface is gated on its own switch");
  assert.equal(directionAuthorization("nfl", "pts", "site", r(q())).ok, false, "an NBA qualification never carries over to NFL");
});
