/* The display authorization record: the committed state (site authorized for NBA + NFL 2026-10-29; social not), refuses
   partial records, and NBA_LINE_DISPLAY derives from it.
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

const TERMS_REF = "docs/odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md";

test("committed state (founder 2026-10-29): site authorized for NBA and NFL; social and social prices refuse; the record is frozen", () => {
  for (const sport of ["nba", "nfl"]) {
    const { directionQualified, ...switches } = DISPLAY_AUTHORIZATION[sport];
    assert.ok(directionQualified && Object.isFrozen(directionQualified));
    assert.deepEqual(
      switches,
      { siteDisplay: true, socialDisplay: false, providerTermsRef: TERMS_REF, attribution: null, approvedBy: "founder", approvedAt: "2026-10-29", socialFeedPrices: false, socialFeedPricesConfirmationRef: null },
      sport,
    );
    assert.ok(Object.isFrozen(DISPLAY_AUTHORIZATION[sport]));
    const site = assertDisplayAuthorized(sport, "site");
    assert.deepEqual([site.ok, site.attribution, site.providerTermsRef, site.approvedBy, site.approvedAt], [true, null, TERMS_REF, "founder", "2026-10-29"], sport);
    for (const s of ["social", "socialPrices"]) {
      const v = displayAuthorization(sport, s);
      assert.equal(v.ok, false, `${sport}/${s}`);
      assert.equal(v.attribution, null);
      assert.throws(() => assertDisplayAuthorized(sport, s), (e) => e instanceof DisplayNotAuthorizedError && new RegExp(`REFUSED: ${sport} lines are not authorized`).test(e.message));
    }
  }
  assert.ok(Object.isFrozen(DISPLAY_AUTHORIZATION));
  // the terms document the record cites is committed and records the clauses the design rests on
  const doc = fs.readFileSync(new URL(`../../../../${TERMS_REF}`, import.meta.url), "utf8");
  assert.match(doc, /the-odds-api\.com\/terms-and-conditions\.html/);
  assert.match(doc, /last updated 31 Aug 2026/);
  assert.match(doc, /Attribution to The Odds API is not required/);
  assert.match(doc, /standalone data product/);
  assert.match(doc, /2026-10-29/);
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
  assert.deepEqual({ ...NBA_LINE_DISPLAY }, { public: true, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba });
  assert.equal(NBA_LINE_DISPLAY.reason, "NBA sportsbook lines are shown on the website only; the social feed and social graphics are not authorized to carry them.", "the feed's reason sentence (site-only display, 2026-10-29)");
  assert.deepEqual({ ...nbaLineDisplayFrom(rec()) }, { public: true, social: true, socialPrices: false, reason: null });
  assert.deepEqual({ ...nbaLineDisplayFrom(rec({ socialDisplay: false })) }, { public: true, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba });
  assert.deepEqual({ ...nbaLineDisplayFrom(rec({ approvedBy: null })) }, { public: false, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nba }, "partial → both off");
  // no surface sets its own boolean: line-board.mjs holds no literal switch
  const src = fs.readFileSync(new URL("../sports/nba/line-board.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /public:\s*(true|false)|social:\s*(true|false)/);
});

test("direction qualification, committed state: NBA pts/reb/ast/pra/ptsReb/ptsAst qualified on the site (founder 2026-10-29); threePm and every NFL family unqualified; social shows none", () => {
  const families = { nba: Object.keys(MARKET_KEYS), nfl: Object.entries(NFL_FAMILIES).filter(([, d]) => d.kind === "OU").map(([f]) => f) };
  const QUALIFIED = { nba: ["pts", "reb", "ast", "pra", "ptsReb", "ptsAst"], nfl: [] };
  for (const [sport, fams] of Object.entries(families)) {
    const q = DISPLAY_AUTHORIZATION[sport].directionQualified;
    assert.deepEqual(Object.keys(q).sort(), [...fams].sort(), `${sport}: one entry per over/under family`);
    for (const f of fams) {
      const yes = QUALIFIED[sport].includes(f);
      assert.deepEqual([q[f].qualified, q[f].approvedBy, q[f].approvedAt], yes ? [true, "founder", "2026-10-29"] : [false, null, null], `${sport}/${f}`);
      assert.ok(typeof q[f].evidence === "string" && q[f].evidence.length > 20, `${sport}/${f}: evidence recorded`);
      if (yes) assert.match(q[f].evidence, /n = 910 graded played rows per family \(≥300\).*approved by founder 2026-10-29 under the \[0\.45, 0\.55\] rule/, `${sport}/${f}`);
      assert.ok(Object.isFrozen(q[f]));
      assert.equal(directionAuthorization(sport, f, "site").ok, yes, `${sport}/${f} site`);
      assert.equal(directionAuthorization(sport, f, "social").ok, false, `${sport}/${f}: social is not authorized`);
      assert.equal(publicDirectionGate(sport).shows(f), yes, `${sport}/${f} gate`);
      assert.equal(publicDirectionGate(sport, "social").shows(f), false);
    }
  }
  // each qualified share is inside the approved band (the evidence carries it)
  for (const f of QUALIFIED.nba) {
    const share = Number(/share (0\.\d+)/.exec(DISPLAY_AUTHORIZATION.nba.directionQualified[f].evidence)?.[1]);
    assert.ok(share >= 0.45 && share <= 0.55, `${f} ${share}`);
  }
  assert.match(DISPLAY_AUTHORIZATION.nfl.directionQualified.receptions.evidence, /mid-p.*≈0\.50.*pending a founder decision on tie treatment/);
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
