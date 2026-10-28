/**
 * P0 10-28 · A MODELLED SPORT IS NEVER DESCRIBED AS UNMODELLED, AND THE NBA RECORD HAS ONE NAME.
 *
 * Production 10-28 (reconciliation rows #5, #10, NEW-1): /sports said NBA was "Schedule only — not modelled" with a
 * "first game 2026-10-27"; /learn said "No validated NBA forecast is published yet"; /bucket-blitz and /mr-dub said the
 * NBA hub carried "official finals only — no forecast, no live board"; /results/forecasts listed the NBA official
 * record as "SHADOW / private research"; /results/nba called it an "archive". Meanwhile the founder-approved NBA
 * composition published Official Forecasts daily and its official side had 52 graded games from Oct 20.
 *
 * Every one of those was a hand-kept sentence. The fix derives them from the public registry's families
 * (lib/public-registry.ts) and the record's one name (lib/results/nba-official-record.mjs); these guards render the
 * visitor pages and fail if any of them drifts back.
 *
 * Run (from app/): npx tsx --test src/lib/uiux/catalog-capability-copy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { COMPETITIONS } = await import("../sports/catalog.ts");
const { publicSport, publishesOfficialForecast, officialForecastCoverage } = await import("../public-registry.ts");
const { NBA_OFFICIAL_RECORD_LABEL, NBA_OFFICIAL_RECORD_TITLE, NBA_OFFICIAL_RECORD_GAP } = await import("../results/nba-official-record.mjs");
const { nbaFirstGradedGameDate } = await import("../results/nba-official-record-reader.mjs");
const { nbaUpcoming } = await import("../sports/upcoming/adapters.mjs");
const { DECLARED_GAPS } = await import("../forecast-ledger/compose.mjs");
const { forecastRecordView } = await import("../results/v2/forecast-ledger-reader.ts");

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
const render = async (rel) => text(renderToStaticMarkup(React.createElement((await import(rel)).default)));

/** The claims that would call a sport unmodelled. "This section is the schedule only." (a scope line about one /sports
 *  section, period-terminated) is not one of them; "Schedule only — not modelled" and "carries schedules only," are. */
const UNMODELLED = [/not modell?ed/i, /\bschedules? only\b(?!\s*\.)/i, /\bno (?:validated |public )?(?:NBA )?forecasts?\b/i, /official finals only/i];

/** Each place a sport's label is named, with the text that follows it up to the end of that sentence-ish window. */
function claimsAbout(t, label) {
  const out = [];
  for (let i = t.indexOf(label); i >= 0; i = t.indexOf(label, i + label.length)) out.push(t.slice(i, i + 200));
  return out;
}

const MODELLED = COMPETITIONS.filter((c) => publishesOfficialForecast(c.key));

test("the catalog's modelled sports are read from the registry's families (NBA is one: sides + player medians, team scores withheld)", () => {
  assert.ok(MODELLED.some((c) => c.key === "nba"), "NBA publishes Official Forecast families");
  const nba = publicSport("nba");
  assert.deepEqual(nba.families.filter((f) => f.publication === "OFFICIAL_FORECAST").map((f) => f.id), ["nba_winner_side", "nba_player_medians"]);
  assert.deepEqual(nba.families.filter((f) => f.publication === "WITHHELD").map((f) => f.id), ["nba_team_scores"]);
  assert.match(officialForecastCoverage("nba"), /^Official Forecasts: favoured side \(Elo rating\) and Predicted Player Statistics .*\. Withheld: team scores/);
  assert.equal(officialForecastCoverage("nhl"), null, "a sport with no Official Forecast family is claimed nothing");
});

test("🔴 visitor pages never call a catalog-modelled sport unmodelled, schedule-only or forecast-less", async () => {
  const pages = {
    "/sports": "../../app/sports/page.tsx",
    "/learn": "../../app/learn/page.tsx",
    "/bucket-blitz": "../../app/bucket-blitz/page.tsx",
    "/mr-dub signature band": "../../components/products/signature-products-band.tsx",
  };
  for (const [route, rel] of Object.entries(pages)) {
    const t = await render(rel);
    for (const c of MODELLED) {
      for (const claim of claimsAbout(t, c.label)) {
        for (const re of UNMODELLED) assert.doesNotMatch(claim, re, `${route}: "${claim.slice(0, 140)}…" calls ${c.label} unmodelled`);
      }
    }
  }
  /* /sports links each modelled sport's hub from its section and states the registry's coverage for it. */
  const sports = await render("../../app/sports/page.tsx");
  assert.ok(sports.includes(officialForecastCoverage("nba")), "/sports states NBA's Official Forecast coverage in the registry's words");
});

test("🔴 /sports 'first game' is the first graded official game, or absent — never the next game of a rolling capture", () => {
  const first = nbaFirstGradedGameDate();
  const out = nbaUpcoming({ nowIso: "2026-10-27T16:00:00Z" });
  assert.doesNotMatch(out.seasonContext, /full schedule not yet published/, "the capture is a rolling window, not an unpublished schedule");
  if (first) {
    assert.match(out.seasonContext, new RegExp(`first game ${first}\\b`));
    const nextGameEt = out.events[0]?.canonicalEventId.split(":")[2]; // nba:nba:<ET date>:<id>
    if (nextGameEt && nextGameEt !== first) {
      assert.doesNotMatch(out.seasonContext, new RegExp(`first game ${nextGameEt}`), "the first UPCOMING event is never printed as the first game");
    }
  }
  const none = nbaUpcoming({ nowIso: "2026-10-27T16:00:00Z", firstGameDate: null });
  assert.doesNotMatch(none.seasonContext, /first game/, "with nothing graded, no first game is shown");
  const fixed = nbaUpcoming({ nowIso: "2026-10-27T16:00:00Z", firstGameDate: "2026-10-20" });
  assert.match(fixed.seasonContext, /first game 2026-10-20/);
});

test("🔴 the NBA record carries ONE label on /results/forecasts and /results/nba — official, never SHADOW / private / archive", async () => {
  assert.equal(NBA_OFFICIAL_RECORD_TITLE, `NBA · ${NBA_OFFICIAL_RECORD_LABEL}`);
  /* /results/forecasts: the declared gap is the record's own entry, and the page renders "<sport> · <family>". */
  assert.ok(DECLARED_GAPS.includes(NBA_OFFICIAL_RECORD_GAP), "compose.mjs declares the record (the nightly manifest converges on it)");
  const rec = forecastRecordView();
  const nbaGaps = rec.declaredGaps.filter((g) => g.sport === "NBA");
  if (rec.declaredGaps.length) {
    assert.equal(nbaGaps.length, 1, "one NBA line");
    assert.equal(`${nbaGaps[0].sport} · ${nbaGaps[0].family}`, NBA_OFFICIAL_RECORD_TITLE);
    assert.doesNotMatch(nbaGaps[0].reason, /SHADOW|PRIVATE_RESEARCH|private research|never public|archive/i);
    const fr = await render("../../app/results/forecasts/page.tsx");
    assert.ok(fr.includes(`${NBA_OFFICIAL_RECORD_TITLE} :`) || fr.includes(`${NBA_OFFICIAL_RECORD_TITLE}:`), "/results/forecasts prints the record's name");
    assert.doesNotMatch(fr, /NBA · game model|SHADOW \/ private research/);
  }
  /* /results/nba: the page title and the Results tab name the same record; "archive" is left to the retired model. */
  const { metadata } = await import("../../app/results/nba/page.tsx");
  assert.ok(String(metadata.title?.absolute ?? metadata.title).startsWith(NBA_OFFICIAL_RECORD_TITLE), `title: ${JSON.stringify(metadata.title)}`);
  assert.doesNotMatch(String(metadata.title?.absolute ?? metadata.title), /archive|audit/i);
  const tabs = text(renderToStaticMarkup(React.createElement((await import("../../components/results-sport-tabs.tsx")).default, { activeSport: "nba", nbaHasData: true, mlbHasData: true })));
  assert.ok(tabs.includes(`NBA · ${NBA_OFFICIAL_RECORD_LABEL}`), `tab reads: ${tabs}`);
  assert.doesNotMatch(tabs, /NBA · archive/);
});
