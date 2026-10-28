/**
 * Social graphics V2 (prototype): verified view-models, the founder's content rules (no projected scores, totals or
 * ranges; no internal ids, hashes or URLs on the graphic; misses shown), the site's number formatting, text fitting,
 * determinism, the touchdown-list refusals, and colour coverage for every NFL team.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../lib/util.mjs";
import { gitDataSource, dirDataSource } from "../recap/multisport-facts.mjs";
import { publicLabelOf } from "../recap/public-registry.mjs";
import { pregameWinner, touchdowns, postgame, teamOf } from "../recap/social-v2.mjs";
import { socialHtml, renderSocial, DISCLOSURES } from "../render/social-v2.mjs";
import { pngSize } from "../render/render-png.mjs";
import { tempDir } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, hasPinned } from "./queue-fixtures.mjs";

const skip = hasPinned ? false : `pinned data commit ${QUEUE_PINNED.slice(0, 12)} is not in this clone`;
const src = () => gitDataSource(REPO_ROOT, QUEUE_PINNED);
const label = () => publicLabelOf("NFL", dirDataSource(REPO_ROOT));
const visibleText = (html) => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>|<[^>]+>|data:image\/png;base64,[A-Za-z0-9+/=]+/g, " ");

test("Format C on PIT @ NO: the verified final, the frozen Steelers 64.8% forecast, correct; TD calls 0 of 3", { skip }, () => {
  const m = postgame({ src: src(), eventId: "401873011", label: label() });
  assert.ok(m.ok, m.reason);
  assert.deepEqual([m.away.abbr, m.finalAway, m.home.abbr, m.finalHome], ["PIT", 16, "NO", 10]);
  assert.equal(m.favouredTeam.name, "Pittsburgh Steelers");
  assert.equal(m.winProbabilityDisplay, "64.8%");
  assert.equal(m.result, "WIN");
  assert.equal(m.td.complete, true);
  assert.deepEqual(m.td.candidates.map((c) => [c.name, c.outcome]), [["Jaylen Warren", "miss"], ["Alvin Kamara", "miss"], ["Chris Olave", "miss"]]);
  assert.equal(m.td.hits, 0, "misses are shown, not hidden");
});

test("Format C miss example SF @ ATL: 49ers 70.6% missed; TD calls 1 of 3 with McCaffrey at the site's 70.5%", { skip }, () => {
  const m = postgame({ src: src(), eventId: "401873017", label: label() });
  assert.equal(m.result, "LOSS");
  assert.equal(m.winProbabilityDisplay, "70.6%");
  assert.equal(m.td.hits, 1);
  const cmc = m.td.candidates.find((c) => c.name === "Christian McCaffrey");
  assert.equal(cmc.probability, 0.7055);
  assert.equal(cmc.probabilityDisplay, "70.5%", "the site's formatter: (p * 100).toFixed(1)");
  const html = visibleText(socialHtml(m));
  assert.match(html, /Prediction Missed/);
  assert.match(html, /Prediction vs\. Final/);
  assert.match(html, /Predicted Winner/);
  assert.match(html, /1 of 3 scored/);
});

test("graphics carry none of the removed clutter: no projections, totals, ranges, ids, hashes or URLs", { skip }, () => {
  const s = src();
  const models = [
    postgame({ src: s, eventId: "401873011", label: label() }),
    pregameWinner({ src: s, eventId: "401873023", now: QUEUE_NOW }),
    touchdowns({ src: s, eventId: "401873023", mode: "pregame", now: QUEUE_NOW }),
  ];
  for (const m of models) {
    assert.ok(m.ok, m.reason);
    const full = visibleText(socialHtml(m));
    // the mandated footer ("Model projections · …") appears exactly once; everything else is checked without it
    assert.equal(full.split(DISCLOSURES.NFL).length - 1, 1, `${m.format}: exactly one standard footer`);
    const text = full.replace(DISCLOSURES.NFL, " ");
    assert.doesNotMatch(text, /projected|projection|total|80%|range/i, `${m.format}: projected scores/totals/ranges stay off the graphic`);
    assert.doesNotMatch(text, /fl1-|sha256|[0-9a-f]{12}|https?:|\.com|Model Performance|anytime_td|nfl_game/i, `${m.format}: no internal ids, hashes, URLs or field names`);
    assert.match(full, /Model projections · Not betting advice · Not affiliated with the NFL or its clubs/, "the standard disclosure stays");
  }
});

test("Format A labels the number as the latest published pregame forecast and matches the site", { skip }, () => {
  const m = pregameWinner({ src: src(), eventId: "401873023", now: QUEUE_NOW });
  assert.equal(m.favouredTeam.abbr, "GB");
  assert.equal(m.winProbabilityDisplay, "63.8%");
  assert.equal(m.status, "MATCHES_SITE");
  assert.equal(m.stamp, "Latest published pregame forecast");
  assert.ok(!pregameWinner({ src: src(), eventId: "401873023", now: "2026-10-26T00:00:00Z" }).ok, "nothing frozen yet → no graphic");
});

test("Format B: top three of the published population; stale, tied or empty lists are refused", { skip }, () => {
  const s = src();
  const pre = touchdowns({ src: s, eventId: "401873023", mode: "pregame", now: QUEUE_NOW });
  assert.deepEqual(pre.candidates.map((c) => [c.name, c.probabilityDisplay]), [["Chuba Hubbard", "54.9%"], ["Josh Jacobs", "46.4%"], ["Christian Watson", "39.5%"]]);
  assert.equal(pre.showResults, false);
  assert.ok(!touchdowns({ src: s, eventId: "401873023", mode: "pregame", now: "2026-10-30T00:16:00Z" }).ok, "after kickoff a pregame list is stale");
  const rec = touchdowns({ src: s, eventId: "401873011", mode: "record", showResults: false });
  assert.deepEqual(rec.candidates.map((c) => c.name), ["Jaylen Warren", "Alvin Kamara", "Chris Olave"]);
  assert.equal(rec.showResults, false);

  // synthetic boards: a tie at the cut, an OUT player, a QUESTIONABLE one
  const root = tempDir("gtp-cc-tdboard-");
  const board = (players) => {
    fs.mkdirSync(path.join(root, "app/public/data/nfl/player-board"), { recursive: true });
    fs.writeFileSync(path.join(root, "app/public/data/nfl/player-board/9.json"), JSON.stringify({ kickoffUtc: "2026-11-01T18:00Z", matchup: "CAR @ GB", generatedAt: "2026-10-31T12:00:00Z",
      families: { anytime_td: { state: "PUBLISHED" } }, players: players.map(([name, team, participation, p]) => ({ name, team, participation, markets: { anytime_td: { probability: p } } })) }));
    return dirDataSource(root);
  };
  const now = "2026-10-31T13:00:00Z";
  assert.match(touchdowns({ src: board([["A B", "GB", "AVAILABLE_ROLE_UNCERTAIN", 0.5], ["C D", "GB", "AVAILABLE_ROLE_UNCERTAIN", 0.4], ["E F", "CAR", "AVAILABLE_ROLE_UNCERTAIN", 0.3], ["G H", "CAR", "AVAILABLE_ROLE_UNCERTAIN", 0.3]]), eventId: "9", mode: "pregame", now }).reason, /tie at rank 3/);
  const out = touchdowns({ src: board([["A B", "GB", "OUT", 0.6], ["C D", "GB", "QUESTIONABLE", 0.4], ["E F", "CAR", "AVAILABLE_ROLE_UNCERTAIN", 0.3]]), eventId: "9", mode: "pregame", now });
  assert.deepEqual(out.candidates.map((c) => c.name), ["C D", "E F"], "an OUT player never appears, and the list is not padded to three");
  assert.equal(out.status, "NEEDS_VERIFICATION", "a QUESTIONABLE player sends the post to founder verification");
});

test("render: 1080×1350, identical bytes twice, and a name that can't fit refuses instead of clipping", { skip }, async () => {
  const m = postgame({ src: src(), eventId: "401873017", label: label() });
  const dir = tempDir();
  const a = await renderSocial(m, { outFile: path.join(dir, "a.png") });
  const b = await renderSocial(m, { outFile: path.join(dir, "b.png") });
  assert.deepEqual(pngSize(fs.readFileSync(path.join(dir, "a.png"))), { width: 1080, height: 1350 });
  assert.equal(a.sha256, b.sha256);
  assert.ok(a.fit.every((f) => f.fits));
  const long = { ...m, home: { ...m.home, nickname: "Supercalifragilisticexpialidocious-Extraordinarily-Long" } };
  await assert.rejects(renderSocial(long, { outFile: path.join(dir, "c.png") }), /does not fit/);
});

test("every NFL team has a verified colour record (no team needs a hand-made design)", () => {
  const teams = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH"];
  for (const t of teams) {
    const x = teamOf(t, "City Name");
    assert.match(x.color, /^#[0-9A-F]{6}$/i, t);
    assert.match(x.accent, /^#[0-9A-F]{6}$/i, t);
  }
});

test("terms: social wording is a presentation map; Top 5 rushing/passing are held exactly as the board holds them", { skip }, async () => {
  const { TERMS } = await import("../render/social-v2.mjs");
  assert.equal(TERMS.prediction, "GameTimePicks Prediction");
  const { topBoard } = await import("../recap/social-v2.mjs");
  const s = src();
  for (const fam of ["anytime_td", "player_reception_yds", "player_receptions"]) {
    const b = topBoard({ src: s, date: "2026-10-25", family: fam });
    assert.ok(b.ok, b.reason);
    assert.deepEqual(b.rows.map((r) => r.rank), [1, 2, 3, 4, 5], "the published order, never re-ranked");
  }
  for (const fam of ["player_rush_yds", "player_pass_yds"]) {
    const b = topBoard({ src: s, date: "2026-10-25", family: fam });
    assert.equal(b.ok, false);
    assert.equal(b.held, true, `${fam} is not on the published board`);
  }
  const td = topBoard({ src: s, date: "2026-10-25", family: "anytime_td" });
  assert.equal(td.rows[0].name, "Jahmyr Gibbs");
  assert.equal(td.rows[0].valueDisplay, "84.3%");
  assert.match(visibleText(socialHtml(td)), /Top 5 TD Predictions/);
  const rec = topBoard({ src: s, date: "2026-10-25", family: "player_reception_yds" });
  assert.match(visibleText(socialHtml(rec)), /Top 5 Projections[\s\S]*PROJECTED YDS/);
});

test("NBA: predicted winner only — no win probability is drawn; finals from the finals record", { skip }, async () => {
  const { nbaPregame, nbaFinal } = await import("../recap/social-v2.mjs");
  const p = nbaPregame({ src: src(), eventId: "401909877" });
  assert.ok(p.ok, p.reason);
  assert.equal(p.favouredTeam.abbr, "BOS");
  const text = visibleText(socialHtml(p));
  assert.doesNotMatch(text, /\d%/, "the NBA Elo probability display is switched off");
  assert.match(text, /Predicted Winner/i);
  const f = nbaFinal({ src: src(), eventId: "401909877" });
  assert.deepEqual([f.finalAway, f.finalHome, f.winner], [124, 125, "home"]);
});

test("Format C shows the TD section only when the published cohort is completely graded", { skip }, () => {
  const m = postgame({ src: src(), eventId: "401873011", label: label() });
  const partial = { ...m, td: { ...m.td, complete: false, decided: 2 } };
  assert.doesNotMatch(visibleText(socialHtml(partial)), /scored/, "an incomplete cohort is left off, never shown as misses");
  assert.match(visibleText(socialHtml(m)), /0 of 3 scored/);
});

test("NBA stat lines: a long name shows as initial + full surname, so the card still renders", async () => {
  const { shortName } = await import("../recap/social-v2.mjs");
  assert.equal(shortName("Nickeil Alexander-Walker"), "N. Alexander-Walker");
  assert.equal(shortName("Jayson Tatum"), "Jayson Tatum");
});
