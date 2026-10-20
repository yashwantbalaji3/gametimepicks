/**
 * Simulation Theater · official representative vs what-if, as RENDERED (Cross-Product Prediction Consistency,
 * 2026-10-20). The default run is labelled the official representative with its distance and the official numbers
 * beside it; a what-if box score carries the persistent "Hypothetical scenario — not the forecast" banner and never says
 * "projected" (nor "forecast" without the hypothetical label).
 * Run: npx tsx --test src/components/simulation-theater/representative-render.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { BoxScoreForRun } = await import("./BoxScoreTable.tsx");
const { default: BoxScoreDialog } = await import("./BoxScorePanel.tsx");
const { OfficialComparison, OfficialForecastCard, RunRoleNotice, RoleTag } = await import("./RepresentativeParts.tsx");
const { DistributionPanel } = await import("./panels.tsx");
const { BoxScoreBody } = await import("./nba/NbaBoxScore.tsx");
const { OutcomeChips } = await import("./nba/nba-parts.tsx");
const { loadTheater } = await import("../../lib/simulation-theater/loader.mjs");
const { defaultSample } = await import("../../lib/simulation-theater/public-theater.mjs");
const { theaterPalette } = await import("../../lib/simulation-theater/nfl-team-colors.mjs");
const { loadNbaTheater, NBA_REAL_TEST_FIXTURE_SOURCE, NBA_THEATER_OFFICIAL_SOURCE } = await import("../../lib/simulation-theater/nba/loader.mjs");
const { nbaBoxScore } = await import("../../lib/simulation-theater/nba/box-score.mjs");
const { chipTitle } = await import("../../lib/simulation-theater/format.mjs");
const L = await import("../../lib/simulation-theater/representative-labels.mjs");

const REPO = path.resolve(process.cwd(), "..");
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const visible = (html) => unescape(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const html = (el) => renderToStaticMarkup(el);
/** Every sentence-ish chunk of `text` that says projected/forecast must also say hypothetical / not the forecast. */
function assertNoUnlabelledForecastText(text, where) {
  assert.doesNotMatch(text, /projected/i, `${where}: a what-if never says "projected"`);
  if (/forecast/i.test(text)) assert.match(text, /Hypothetical scenario — not the forecast/, `${where}: "forecast" only beside the hypothetical label`);
}

const nfl = loadTheater(REPO, "401873008");
const m = nfl.manifest;
const rep = m?.representative;
const NFL_OK = Boolean(nfl.ok && rep?.state === "SELECTED");
const palette = NFL_OK ? theaterPalette(m.teams.home.abbr, m.teams.away.abbr) : null;

test("NFL opens on the official representative: tag, distance line and the official forecast headline", { skip: NFL_OK ? false : "no NFL record in this checkout" }, () => {
  // the server shell and the island both default to it (TheaterSection.tsx imports a CSS file, so its source is checked)
  for (const f of ["TheaterSection.tsx", "TheaterIsland.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/simulation-theater", f), "utf8");
    assert.match(src, /officialRunIndex\(manifest\)/, `${f} defaults to the official representative`);
    assert.match(src, /<OfficialForecastCard manifest=\{manifest\}/, `${f} shows the official forecast`);
    assert.match(src, /<RoleTag manifest=\{manifest\} runIndex=\{c\.runIndex\} \/>/, `${f} tags every chip`);
  }
  assert.equal(defaultSample(m).runIndex, rep.officialRunIndex);
  const out = [
    html(React.createElement(OfficialForecastCard, { manifest: m, teams: m.teams })),
    ...m.chips.map((c) => html(React.createElement(RoleTag, { manifest: m, runIndex: c.runIndex }))),
    html(React.createElement(RunRoleNotice, { manifest: m, runIndex: rep.officialRunIndex, kindTitle: null })),
  ].join("");
  const txt = visible(out);
  assert.match(out, /data-st-official=""/);
  assert.ok(txt.includes(`${L.OFFICIAL_RUN_TITLE} · ${L.OFFICIAL_RUN_SUBTITLE} · distance ${L.fmtDistance(rep.distance)}`));
  assert.ok(txt.includes(L.OFFICIAL_FORECAST_TITLE));
  assert.ok(txt.includes(`${m.teams.home.abbr} ${L.fmtPct(rep.official.pHomePublished)}`), "headline = the official win probability, not the engine batch");
  assert.ok(!txt.includes(`${(m.batch.winProbability.home * 100).toFixed(1)}%`), "the batch share is not the headline");
  assert.equal((out.match(/data-st-role="what-if"/g) ?? []).length, m.chips.length - 1, "every other chip is tagged What-if · hypothetical");
  assert.equal((out.match(/data-st-role="official"/g) ?? []).length, 1);
});

test("NFL box score: official run = projected + official expectations; every what-if = hypothetical banner, no 'projected'", { skip: NFL_OK ? false : "no NFL record in this checkout" }, () => {
  const off = defaultSample(m);
  const so = html(React.createElement(BoxScoreForRun, { manifest: m, sample: off }));
  assert.match(so, /data-stbx-role="official"/);
  assert.match(visible(so), /Projected box score · run #/);
  assert.ok(visible(so).includes(L.COMPARISON_TITLE));
  assert.ok(visible(so).includes(L.RECONCILIATION_NOTE));
  assert.ok(visible(so).includes(L.fmtExpectation(rep.official.team.total.expected)), "the fractional official total, unrounded to 2 dp");
  assert.ok(visible(so).includes(L.NFL_PLAYERS_NOT_MODELED_NOTE));
  for (const c of m.chips.filter((x) => x.available && x.runIndex !== rep.officialRunIndex)) {
    const s = m.samples[c.sampleIndex];
    const d = html(React.createElement(BoxScoreDialog, { open: true, onClose: () => {}, manifest: m, sample: s, palette }));
    const t = visible(d);
    assert.match(d, /data-stbx-role="what-if"/);
    assert.ok(t.includes(L.WHAT_IF_BANNER), `run ${s.runIndex}: persistent banner`);
    assert.ok(t.includes(L.WHAT_IF_BOX_WATERMARK));
    assert.ok(t.includes(`${L.WHAT_IF_BOX_TITLE} · run #`));
    assertNoUnlabelledForecastText(t, `NFL what-if run #${s.runIndex}`);
    const st = visible(html(React.createElement(BoxScoreForRun, { manifest: m, sample: s })));
    assert.ok(st.includes(L.WHAT_IF_BANNER));
    assertNoUnlabelledForecastText(st, `NFL static what-if run #${s.runIndex}`);
    const note = visible(html(React.createElement(RunRoleNotice, { manifest: m, runIndex: s.runIndex, kindTitle: chipTitle(s.kinds) })));
    assert.ok(note.includes(L.WHAT_IF_BANNER) && note.includes(`${L.WHAT_IF_TAG} · ${chipTitle(s.kinds)}`));
  }
});

test("NFL distribution panel: the official forecast first; the engine batch's win shares are labelled 'not the forecast'", { skip: NFL_OK ? false : "no NFL record in this checkout" }, () => {
  const t = visible(html(React.createElement(DistributionPanel, { manifest: m, sample: defaultSample(m) })));
  assert.ok(t.indexOf(L.OFFICIAL_FORECAST_TITLE) >= 0 && t.indexOf(L.OFFICIAL_FORECAST_TITLE) < t.indexOf("Drive-engine batch"));
  assert.match(t, /won \(engine batch, not the forecast\)/);
});

test("no official forecast: the card says so, the comparison invents nothing, and every chip is a what-if", () => {
  const mm = { representative: { version: "theater-representative@1", sport: "NBA", state: "NO_OFFICIAL", refusal: { code: "RECEIPT_INTEGRITY", message: "x" }, official: null, officialRunIndex: null, runs: [{ runIndex: 1, kinds: [], role: "WHAT_IF", hypothetical: true, distance: null }] } };
  const teams = { home: { abbr: "HOM" }, away: { abbr: "AWY" } };
  const card = visible(html(React.createElement(OfficialForecastCard, { manifest: mm, teams })));
  assert.ok(card.includes(L.NO_OFFICIAL_NBA));
  assert.ok(card.includes(L.NO_OFFICIAL_RUNS_NOTE));
  const cmp = visible(html(React.createElement(OfficialComparison, { manifest: mm, final: { home: 100, away: 99 }, teams, hypothetical: true })));
  assert.ok(cmp.includes(L.NO_OFFICIAL_NBA));
  assert.doesNotMatch(cmp, /\d+\.\d\d/, "no expectation figure");
  assert.match(html(React.createElement(RoleTag, { manifest: mm, runIndex: 1 })), /What-if · hypothetical/);
});

// the fixture is a byte copy of real 2026-10-20 v1 output: measure it against the committed OFFICIAL v0.1 file of that date
const NBA = loadNbaTheater(REPO, "401909088", { source: NBA_REAL_TEST_FIXTURE_SOURCE, officialSource: NBA_THEATER_OFFICIAL_SOURCE });
test("NBA box score: official means beside modeled stats (per game played), NO official team expectation (withheld), and hypothetical what-ifs", () => {
  assert.equal(NBA.ok, true);
  const r = NBA.manifest.representative;
  assert.equal(r.state, "SELECTED");
  const pal = NBA.palettes.team;
  for (const s of NBA.manifest.samples) {
    const box = nbaBoxScore(s, NBA.manifest);
    const hypothetical = L.runRole(NBA.manifest, s.runIndex).hypothetical;
    assert.equal(hypothetical, s.runIndex !== r.officialRunIndex);
    const out = html(React.createElement(BoxScoreBody, { result: box, palette: pal, idBase: "t", manifest: NBA.manifest, hypothetical }));
    const t = visible(out);
    assert.match(out, /data-nba-official-exp="pts"/);
    assert.doesNotMatch(out, /data-nba-official-exp="team"/, "the official NBA team score is WITHHELD — never printed as an expectation");
    assert.ok(t.includes(L.NBA_PLAYER_EXPECTATION_NOTE));
    assert.ok(t.includes(L.RECONCILIATION_NOTE));
    // a played row's official average is the snapshot's mean for THAT athlete id
    const played = box.box.teams.home.rows.find((x) => x.status === "played" && r.players[x.providerAthleteId]?.families?.pts?.expected != null);
    assert.ok(t.includes(`avg ${L.fmtExpectation(r.players[played.providerAthleteId].families.pts.expected)}`));
    if (hypothetical) {
      assert.ok(t.includes(L.WHAT_IF_BANNER), `run ${s.runIndex}`);
      assertNoUnlabelledForecastText(t, `NBA what-if run #${s.runIndex}`);
    } else {
      assert.ok(!t.includes(L.WHAT_IF_BANNER));
    }
  }
  const chips = html(React.createElement(OutcomeChips, { manifest: NBA.manifest, selected: 0, idBase: "c" }));
  assert.equal((chips.match(/data-st-role="official"/g) ?? []).length, 1);
  assert.equal((chips.match(/data-st-role="what-if"/g) ?? []).length, NBA.manifest.samples.length - 1);
});
