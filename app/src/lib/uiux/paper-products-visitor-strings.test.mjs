/**
 * PAPER PRODUCTS · VISITOR STRINGS (overnight 2026-10-28, workstream W2).
 *
 * The selection/paper product pages printed operator and model vocabulary in the reading path: a model id on every
 * model-suggestion leg ("Source: nba-official-composition@1 (nba-preseason-experimental-v0.1)"), the protected fold's
 * rule name ("Rule S: …", 33× on /mr-dub), the internal tier names ("Priced-card universe (Level B)", "(Level A)"),
 * a runbook row ("backstop 11:41 UTC", "A watchdog re-runs…"), an operator note ("Open decision: … product decision"),
 * and ~13 separate "no card" boxes on /build. This guard keeps them out of what a visitor reads — everywhere EXCEPT
 * inside a "Technical details" disclosure, which is where the audit detail was relocated (never deleted).
 *
 * Three layers, all deterministic:
 *   1. COMPONENTS on fixtures that carry the internal ids, so the check is never vacuous on a day with no legs.
 *   2. PAGES rendered from the committed data (server components, react-dom/server) — the strings that can only come
 *      from a page's own composition (status line, reconciliation, timeline notes).
 *   3. The relocated detail is still there: inside Technical details, word for word.
 *
 * Visible text = the HTML minus every <details> whose <summary> says "Technical details" (nesting-aware), tags
 * stripped, entities decoded. Text folded inside other disclosures still counts as visible: folding is not a licence.
 *
 * Run: npx tsx --test src/lib/uiux/paper-products-visitor-strings.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

/** Operator / model vocabulary that may appear only inside Technical details. */
export const BANNED_OUTSIDE_TECHNICAL = [
  [/\bRule S\b/, "the fold's rule name"],
  [/\bLevel [AB]\b/, "an internal tier name"],
  [/\b\d{1,2}:\d{2} UTC\b/, "a UTC runbook time"],
  [/\bbackstop\b/i, "a runbook backstop"],
  [/\bwatchdog\b/i, "the watchdog"],
  [/Open decision:/, "an operator note"],
  [/operational gap/i, "an operator phrase"],
  [/[a-z][\w-]*@\d+\b/, "a versioned internal id (owner@N)"],
  [/\bv\d+\.\d+\b/, "a model version"],
  [/Provenance on file/, "a per-row provenance label"],
];

const decode = (s) => s.replace(/&rsquo;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Remove each <details> whose own <summary> contains "Technical details", with everything inside it (nesting-aware). */
export function withoutTechnicalDetails(html) {
  let out = html;
  for (;;) {
    const re = /<details\b[^>]*>\s*<summary\b[\s\S]*?<\/summary>/g;
    let m, cut = null;
    while ((m = re.exec(out))) {
      if (/Technical details/.test(m[0].replace(/<[^>]+>/g, " "))) { cut = m.index; break; }
    }
    if (cut == null) return out;
    let depth = 0, i = cut;
    const tag = /<(\/?)details\b[^>]*>/g;
    tag.lastIndex = cut;
    let t;
    while ((t = tag.exec(out))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { i = t.index + t[0].length; break; }
    }
    out = out.slice(0, cut) + out.slice(i);
  }
}
const technicalOnly = (html) => {
  const parts = [];
  const re = /<details\b[^>]*>\s*<summary\b[\s\S]*?<\/summary>/g;
  let m;
  while ((m = re.exec(html))) if (/Technical details/.test(m[0].replace(/<[^>]+>/g, " "))) parts.push(html.slice(m.index, html.indexOf("</details>", m.index)));
  return decode(parts.join(" ").replace(/<[^>]+>/g, " "));
};
const visibleText = (html) => decode(withoutTechnicalDetails(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const offences = (text) => BANNED_OUTSIDE_TECHNICAL.filter(([re]) => re.test(text)).map(([re, why]) => `${why}: "${text.match(re)[0]}" … ${JSON.stringify(text.slice(Math.max(0, text.search(re) - 60), text.search(re) + 60))}`);

// ── 1. components on fixtures that carry the ids ─────────────────────────────────────────────────────────────
const NBA_OWNER = "nba-official-composition@1";
const NBA_MODEL = "nba-preseason-experimental-v0.1";
const leg = (i, o = {}) => ({
  sport: "nba", eventId: `40190${i}`, eventLabel: `AW${i} @ HM${i}`, startUtc: "2026-10-28T23:00:00Z", market: "winner",
  selection: { code: "home", label: `HM${i} (official side)` }, probability: null, probabilityNote: null,
  forecast: { owner: NBA_OWNER, modelId: NBA_MODEL, stampedAt: "2026-10-28T13:16:03Z", ref: null },
  uncertainty: null, settlement: { grader: "nba-settlement-contract", market: "moneyline", side: "home" }, ...o,
});
const mixedCard = { policy: "level-a-mixed@1", tier: "medium", tierLabel: "Medium Risk", legs: [leg(1, { probability: 0.62 }), leg(2, { sport: "mlb", probability: 0.58, forecast: { owner: "mlb-prediction official snapshot", modelId: "decision-engine@3", stampedAt: "2026-10-28T12:00:00Z", ref: null } })], sports: ["nba", "mlb"], jointProbability: 0.36, method: "m", dependency: "Assumes the games are independent.", whySelected: "Highest joint.", label: "l" };
const MODEL = {
  productDay: "2026-10-28", label: "Model suggestion — paper only. No sportsbook price, no payout, not a bet.", method: "Joint probability = product (treated as independent across games).",
  legs: [], untiered: [leg(3), leg(4)], refusedByReason: {},
  parlayLab: ["low", "medium", "high", "longshot"].map((tier) => ({ tier, tierLabel: tier, card: tier === "medium" ? mixedCard : null, reason: tier === "medium" ? null : "no card" })),
  bankBuilder: { card: mixedCard, reason: null }, moonshot: { card: null, reason: "no card" }, nbaProjections: [],
};

test("model suggestions: no model id or owner@N in the reading path on any of the three pages; the ids are in Technical details", async () => {
  const { default: LevelASuggestions } = await import("../../components/products/level-a-suggestions.tsx");
  for (const mode of ["parlay-lab", "bank-builder", "moonshot"]) {
    const html = renderToStaticMarkup(React.createElement(LevelASuggestions, { model: MODEL, mode }));
    const text = visibleText(html);
    assert.deepEqual(offences(text), [], `${mode}: operator/model vocabulary in the reading path`);
    assert.ok(!text.includes(NBA_MODEL) && !text.includes("Source: "), `${mode}: the per-leg Source line is gone`);
    assert.match(text, /Official forecast · frozen /, `${mode}: the reader still sees that it is the official forecast and when it froze`);
    const tech = technicalOnly(html);
    assert.ok(tech.includes(`${NBA_OWNER} (${NBA_MODEL})`), `${mode}: the NBA owner and model id are relocated, not removed`);
    if (mode !== "moonshot") assert.ok(tech.includes("decision-engine@3"), `${mode}: every shown leg's source is listed`);
    assert.match(html, /paper only\. No sportsbook price, no payout, not a bet\./, `${mode}: the paper-only disclosure stays visible`);
  }
});

test("priced-card universe: no internal tier names", async () => {
  const { default: EligibleUniverse } = await import("../../components/products/eligible-universe.tsx");
  const availability = { date: "2026-10-27", totalEligible: 6, sports: [
    { sport: "mlb", label: "MLB", eligibleLegs: 6, events: 1, marketPricedOnly: true, reason: null },
    { sport: "nba", label: "NBA", eligibleLegs: 0, events: 0, marketPricedOnly: false, reason: "not eligible for prediction products" },
  ] };
  for (const compact of [true, false]) {
    const text = visibleText(renderToStaticMarkup(React.createElement(EligibleUniverse, { availability, compact, scope: "Bank Builder", levelASports: ["nba"] })));
    assert.deepEqual(offences(text), [], `compact=${compact}`);
    assert.match(text, /Sports that can join a priced card for Bank Builder/);
    assert.match(text, /no forecast behind it/, "the market-construction caveat stays");
  }
});

test("Parlay Center no-card state: one 'No card today', other lanes' real cards named, per-tier detail folded but present", async () => {
  const { default: ParlayCenterNoCard } = await import("../../components/parlays/parlay-center-no-card.tsx");
  const html = renderToStaticMarkup(React.createElement(ParlayCenterNoCard, {
    lastCardDate: "2026-09-27", reason: "Nothing on the Tue, Oct 27 slate cleared the card rules.",
    otherLanes: [{ sport: "epl", label: "Premier League", href: "/cards/epl", date: "2026-10-31", cards: [{ tier: "medium", combinedAmerican: 150 }, { tier: "high", combinedAmerican: 356 }] }],
  }, React.createElement("p", null, "Low Risk No card today")));
  const outside = decode(html.replace(/<details[\s\S]*<\/details>/, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  assert.equal((outside.match(/No card today/g) ?? []).length, 1, "exactly one empty state outside the fold");
  assert.match(outside, /Last card Sun, Sep 27, 2026/);
  assert.match(outside, /next expected: Premier League cards for Sat, Oct 31/);
  assert.match(outside, /Premier League · Sat, Oct 31 · 2 cards from posted prices \(medium \+150 · high \+356\)/, "a real card is never hidden");
  assert.match(html, /<details[\s\S]*Low Risk No card today[\s\S]*<\/details>/, "the per-tier reasons are folded, not removed");
});

// ── 2. pages rendered from the committed data ─────────────────────────────────────────────────────────────────
const PAGES = ["build", "bank-builder", "moonshot", "mr-dub", "markets", "cage-chaos", "homer-nukes", "endzone-vault"];

test("pages: no operator or model vocabulary outside Technical details (committed data)", async () => {
  for (const route of PAGES) {
    const mod = await import(`../../app/${route}/page.tsx`);
    const html = renderToStaticMarkup(await mod.default({ params: {} }));
    assert.deepEqual(offences(visibleText(html)), [], `/${route}/`);
  }
});

test("pages: the relocated detail is still on the page, inside Technical details", async () => {
  const bb = renderToStaticMarkup(await (await import("../../app/bank-builder/page.tsx")).default());
  const tech = technicalOnly(bb);
  assert.match(tech, /\d{1,2}:\d{2} UTC/, "the runbook schedule (with its UTC backstop) moved, not vanished");
  assert.match(tech, /What the record systems say/, "the record-systems reconciliation moved, not vanished");
  const { RUNBOOKS } = await import("../launch/runbook-registry.mjs");
  const by = RUNBOOKS.mlb.products.when.match(/by \d{1,2}:\d{2} [AP]M ET/)?.[0];
  if (/Not yet updated for today/.test(visibleText(bb))) assert.ok(visibleText(bb).includes(`Next check ${by}.`), "a not-run status names the next check in ET");
});

test("/mr-dub: the fold's notes render in words; 'lane' only shrinks", async () => {
  const html = renderToStaticMarkup(await (await import("../../app/mr-dub/page.tsx")).default());
  const text = visibleText(html);
  assert.doesNotMatch(text, /Rule S|\(s\) lost/);
  /* Ratchet: 117 rendered "lane"s on 10-28 (local render of committed data) → 49 after this change; the remainder is
     the "Lane A / Lane B" product names (a founder naming decision) and the shared "single-card lane" scope label. The
     count scales with settled history only through those names, so it is bounded by the 12 shown movements, the 10
     visible timeline days and the folded rows; 60 leaves headroom for that without letting the notes come back. */
  const lanes = (text.match(/\blanes?\b/gi) ?? []).length;
  assert.ok(lanes <= 60, `/mr-dub renders "lane" ${lanes}× (ceiling 60)`);
});

// ── 3. the scanner itself ─────────────────────────────────────────────────────────────────────────────────────
test("probe: each banned shape is caught outside Technical details and allowed inside", () => {
  const td = (inner) => `<details class="gtp-more-disclosure"><summary><span>Technical details</span></summary><div>${inner}</div></details>`;
  for (const s of ["Rule S: 1 Bank Builder step(s) lost", "Priced-card universe (Level B)", "(backstop 11:41 UTC)", "A watchdog re-runs", "Open decision: build it?",
    "This is an operational gap", "Source: nba-official-composition@1", "(nba-preseason-experimental-v0.1)", "TB @ CLE · Provenance on file"]) {
    assert.notDeepEqual(offences(visibleText(`<p>${s}</p>`)), [], `probe missed: ${s}`);
    assert.deepEqual(offences(visibleText(td(`<p>${s}</p>`))), [], `false positive inside Technical details: ${s}`);
    assert.notDeepEqual(offences(visibleText(`<details><summary>More</summary><p>${s}</p></details>`)), [], `another disclosure is not a licence: ${s}`);
  }
  // nesting: a details inside Technical details is removed with it; text after it is still scanned.
  assert.notDeepEqual(offences(visibleText(td("<details><summary>x</summary>a</details>") + "<p>Rule S</p>")), []);
  for (const ok of ["TB @ CLE · 5:08 PM ET", "Official forecast · frozen Oct 27, 9:16 AM ET", "Lane A · Step 2", "Sat, Oct 31 · 3 cards"])
    assert.deepEqual(offences(visibleText(`<p>${ok}</p>`)), [], `false positive: ${ok}`);
});
