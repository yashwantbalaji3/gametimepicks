/**
 * NFL QB results on the Trends panel and the game page (2026-11-11): a settled fixture game with a frozen receipt, a
 * final and a grade row renders all three under its "graded against" line; a HOLD game says "not graded: served version
 * not verified" and shows no grade; no verdict below n = 300; reader vocabulary (no score or comparison word); no line,
 * price or odds; real committed data; and the flag-OFF wiring.
 * Run: npx tsx --test src/lib/sports/nfl/qb-results.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const R = await import("./qb-results.ts");
const { default: Section } = await import("../../../components/nfl/qb-results/nfl-qb-results-section.tsx");
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ── fixture: one settled game, two QBs ─────────────────────────────────────────────────────────────────────────── */
const q = (id, team, [yds, td, cmp, att, int]) => ({ playerId: `nfl-athlete-${id}`, name: `QB ${id}`, team, stats: { passYds: { p50: yds }, passTd: { p50: td }, cmp: { p50: cmp }, passAtt: { p50: att }, int: { p50: int } } });
const RECEIPT = { eventId: "g1", eventStart: "2026-11-13T01:15Z", generatedAt: "2026-11-12T20:00:00Z", home: { abbr: "WSH" }, away: { abbr: "LAR" }, playerStatDistributions: [q("1", "WSH", [220, 1, 22, 33, 1]), q("2", "LAR", [240, 2, 24, 36, 0])] };
const box = (id, team, [cmp, att, yds, td, int]) => ({ playerId: `nfl-athlete-${id}`, teamAbbr: team, passCmp: cmp, passAtt: att, passYds: yds, passTd: td, passInt: int });
const GAME = { providerEventId: "g1", players: [box("1", "WSH", [25, 35, 251, 2, 0]), box("2", "LAR", [20, 31, 199, 1, 1])] };
const GRADED = { rule: "SERVED_RULE", status: "GRADED", basis: "FROZEN_REVISION_SERVED", revision: { generatedAt: "2026-11-12T19:00:00Z", contentHash: "ab12cd34ef56ab12" }, servedProof: { deployment: { id: "dpl_fixture" }, publishedAt: "2026-11-12T19:00:00Z", deploymentReadyAt: "2026-11-12T19:06:00Z" } };
const HOLD = { rule: "SERVED_RULE", status: "HOLD", hold: { reason: "NOT_VERIFIED_SERVED", detail: "EVIDENCE_GAP" }, revision: null, servedProof: null };
const fam = (model = { primary: 1.23 }) => ({ actual: 0, model, baseline: { primary: 2.34 }, league: { primary: 3.45 } });
const LEDGER = (pairedN, look = {}) => ({
  confirmatory: Object.fromEntries(["passTd", "passYds", "passCmp", "passAtt", "passInt"].map((f) => [f, { pairedN, lookTaken: false, verdict: null, ...look }])),
  rows: [{ eventId: "g1", playerId: "nfl-athlete-1", team: "WSH", confirmatory: true, window: "CONFIRMATORY", families: { passTd: fam(), passYds: fam(), passCmp: fam(), passAtt: fam(), passInt: fam() } }],
});
const render = (result) => renderToStaticMarkup(React.createElement(Section, { result }));
const full = () => R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: GRADED, ledger: LEDGER(12) });

test("a settled game with a frozen receipt, a final and a grade row renders all three under its graded-against line", () => {
  const g = full();
  assert.equal(g.state, "GRADED");
  const qb1 = g.qbs.find((x) => x.playerId === "1");
  assert.deepEqual(qb1.markets.find((m) => m.market === "passYds"), { market: "passYds", label: "Passing yards", projection: 220, actual: 251, grade: { state: "GRADED", window: "confirmatory row" }, status: "under forward evaluation · 12/300", verdict: null });
  assert.equal(g.qbs.find((x) => x.playerId === "2").markets[0].grade, null, "no ledger row yet → not graded yet");
  const h = render(g), t = text(h);
  assert.match(t, /MODEL PROJECTION frozen pregame/);
  assert.match(t, /FINAL · settled/);
  assert.match(t, /graded against the official revision of Nov 12, 2:00 PM ET \(content ab12cd34ef56ab12\) · the frozen revision, served before kickoff · served proof: deployment dpl_fixture ready Nov 12, 2:06 PM ET/);
  assert.match(t, /Passing yards 220 251 graded · confirmatory row under forward evaluation · 12\/300/);
  assert.match(t, /QB 2 · LAR @ WSH[^]*?Passing TDs 2 1 not graded yet under forward evaluation · 12\/300/);
  assert.equal((h.match(/data-qb-result=/g) ?? []).length, 2);
});

test("a HOLD game says 'not graded: served version not verified' and never shows a grade", () => {
  const g = R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: HOLD, ledger: LEDGER(12) });
  assert.equal(g.state, "HOLD");
  assert.equal(g.gradedAgainst, null);
  assert.ok(g.qbs.every((x) => x.markets.every((m) => m.grade === null)), "the ledger row is ignored on a HOLD game");
  const t = text(render(g));
  assert.match(t, /not graded: served version not verified/);
  assert.doesNotMatch(t, /graded ·|graded against/);
  assert.match(t, /Passing yards 220 251 — under forward evaluation/, "projection and final still shown; the grade cell is empty");
});

test("no verdict below n = 300; the single look's verdict appears only once taken", () => {
  for (const n of [0, 120, 299]) {
    const g = R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: GRADED, ledger: LEDGER(n, { lookTaken: true, verdict: "MET" }) });
    assert.ok(g.qbs.every((x) => x.markets.every((m) => m.verdict === null && m.status.endsWith(`· ${n}/300`))), `n=${n}`);
    assert.doesNotMatch(render(g), /MET/);
  }
  const looked = R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: GRADED, ledger: LEDGER(300, { lookTaken: true, verdict: "MET" }) });
  assert.match(text(render(looked)), /under forward evaluation · 300\/300 · MET/);
  const notLooked = R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: GRADED, ledger: LEDGER(300) });
  assert.doesNotMatch(render(notLooked), /MET/);
});

test("vocabulary: before the look no score, comparison or verdict word; the labels are the canonical ones", () => {
  for (const g of [full(), R.qbGameResult({ receipt: RECEIPT, game: GAME, final: true, gradedAgainst: HOLD, ledger: LEDGER(12) }), R.qbGameResult({ receipt: RECEIPT, game: GAME, final: false, gradedAgainst: GRADED, ledger: null })]) {
    const t = text(render(g));
    assert.doesNotMatch(t, /\b(beat|beats|better|worse|outperform\w*|accura\w*|edge|hit|win|won|lose|lost|correct|wrong|validated|verdict|MET|NOT[_ ]MET|crps|log loss|1\.23|2\.34|3\.45)\b/i, t.slice(0, 200));
    assert.doesNotMatch(t, /ESTIMATE|PROJECTED MEDIAN|\best\./, "MODEL PROJECTION is the only projection label");
    assert.match(t, /MODEL PROJECTION/);
  }
  assert.match(text(render(R.qbGameResult({ receipt: RECEIPT, game: GAME, final: false, gradedAgainst: GRADED, ledger: null }))), /final not recorded yet/);
});

test("no line, price or odds anywhere in the record", () => {
  const h = render(full()), json = JSON.stringify(full());
  for (const s of [text(h), json]) assert.doesNotMatch(s, /(?<![\w.:-])[+-]\d{3}(?!\d)|overPrice|underPrice|American|\bodds\b|\bbook\b|sportsbook|\bline\b/i);
  assert.doesNotMatch(h, /data-trn-hit|data-trn-record="line"/);
});

test("REAL DATA: a week-10 game reads its receipt of record and the box score; legacy rule; a game not yet played gives nothing", async () => {
  const none = () => null;
  const g = await R.loadQbGameResult("401873043", (e) => ({ rule: "LEGACY_RULE", status: "GRADED", eventId: e }), "2026-11-11T02:00:00Z");
  assert.equal(g.state, "LEGACY");
  assert.match(g.gradedAgainst, /rule for games before Nov 13, 2026/);
  const pe = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/player-events-v1/2026.json"), "utf8")).games.find((x) => x.providerEventId === "401873043");
  for (const qb of g.qbs) {
    const p = pe.players.find((x) => x.playerId === `nfl-athlete-${qb.playerId}`);
    assert.ok(p && qb.final, qb.name);
    assert.deepEqual(qb.markets.map((m) => m.actual), [p.passTd, p.passYds, p.passCmp, p.passAtt, p.passInt], `${qb.name}: actuals are the box score`);
    assert.ok(qb.markets.every((m) => m.grade === null && m.verdict === null), "no ledger committed yet → no grade, no verdict");
  }
  assert.equal(await R.loadQbGameResult("401873052", none, "2026-11-11T02:00:00Z"), null, "TNF has not kicked off at this instant");
});

test("flag OFF: the game page and the drawer route reach the results only inside the GTP_NFL_TRENDS_PUBLIC branch", () => {
  const page = read("src/app/nfl/game/[eventId]/page.tsx");
  assert.match(page, /async function QbResultsSlot\(\{ eventId \}: \{ eventId: string \}\) \{\n  if \(process\.env\.GTP_NFL_TRENDS_PUBLIC === "1"\) \{[^]*?import\("@\/lib\/sports\/nfl\/qb-results"\)[^]*?\n  \}\n  return null;\n\}/);
  assert.doesNotMatch(page, /^import [^\n]*(qb-results|served-grade-io)/m);
  const route = read("src/app/data/nfl-trends.json/route.ts");
  assert.match(route, /if \(process\.env\.GTP_NFL_TRENDS_PUBLIC === "1"\) \{[^]*?loadQbResultsFor[^]*?gradedAgainstFor[^]*?\n  \}\n  return Response\.json\(\{ disabled: true \}\);/);
  assert.match(read("src/components/trends/trends-panel.tsx"), /p\.results\?\.length[^]*?<TrendsResultCard/);
});
