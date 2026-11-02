/**
 * NFL SIMULATION PAGE CONSISTENCY (founder rule, 2026-11-02). One official forecast per game, player and market; a
 * hypothetical simulation is distinct from it; a stale simulation is never represented as current.
 *
 * The measured case is CHI @ SEA 401873036: the sim of record (write-once, 2026-11-01) was built on revision
 * 2026-11-01/401873036, the official record is 2026-11-02/401873036-rev-1929Z. Pinned parts read that write-once receipt
 * and the week 8 fixture (__fixtures__/week8-pre-tnf), so they do not move with the slate. The page tests follow whatever
 * is committed and hard-code no number.
 *
 * The real page function renders here without a build (async server component, awaited, then static markup), so this file
 * stays in the suite's unit phase. CSS, layout and the exported bytes need a real build and a browser.
 *
 * Read-only over committed files. Run (from app/): npx tsx --test src/lib/consistency/nfl-theater-consistency.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
createRequire(import.meta.url).extensions[".css"] = (m) => { m.exports = {}; };

const { SIM_FRESHNESS, SIM_FRESHNESS_LABEL, forecastRevisions, nflOfficialRevision, revisionId, simInputProvenance } = await import("../simulation-theater/sim-input-provenance.mjs");
const { nflOfficialView, nflTheaterOfficial, readNflRosterPositions } = await import("../simulation-theater/loader.mjs");
const { REP_STATE, withNflRepresentative } = await import("../simulation-theater/official-representative.mjs");
const { publicTheaterLoad, defaultSample } = await import("../simulation-theater/public-theater.mjs");
const { runRole, officialRunIndex } = await import("../simulation-theater/representative-labels.mjs");
const { adaptReceipt } = await import("../simulation-theater/adapter-nfl-sim-v2.mjs");
const { nflOfficialDefault } = await import("../simulation-theater/official-default.mjs");
const { readShadowReceipts, showableSimulationEvents, simulationOfRecord } = await import("../sports/nfl/sim-v2/public-receipt.mjs");
const { gameView, formatValue } = await import("../sports/nfl/forecast-view.mjs");
const { officialSnapshotFor, loadForecastViews } = await import("../sports/nfl/forecast-view-load.mjs");
const { playerOf } = await import("./official-snapshot.mjs");
const { default: NflOfficialDefault } = await import("../../components/simulation-theater/NflOfficialDefault.tsx");
const { default: SimulationV2Report } = await import("../../components/nfl/simulation-v2-report.tsx");
const { default: Page } = await import("../../app/nfl/simulation/[eventId]/page.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const text = (h) => unescape(h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const EVENT = "401873036";
const SWIFT = "nfl-athlete-4259545";
const WILLIAMS = "nfl-athlete-4431611";
const INPUT = `data/internal/nfl/forecast-receipts/2026-11-01/${EVENT}.json`;
const LATER = `data/internal/nfl/forecast-receipts/2026-11-02/${EVENT}-rev-1929Z.json`;
const simFile = `data/internal/research/nfl/sim-v2/shadow/2026-11-01/${EVENT}-1cb30455eda2054a.json`;
const SIM = readJson(path.join(REPO, simFile));
const PIN = path.join(APP, "src/lib/sports/nfl/__fixtures__/week8-pre-tnf");
const pinForecast = readJson(path.join(PIN, "forecasts-week8.json")).forecasts.find((f) => String(f.providerEventId) === EVENT);
const pinBoard = readJson(path.join(PIN, "player-board", `${EVENT}.json`));
const pinOfficial = officialSnapshotFor(pinForecast, pinBoard);

const receipt = (file, generatedAt, extra = {}) => ({ file, receipt: { providerEventId: "1", kickoffUtc: "2026-11-03T01:15Z", generatedAt, model: { id: "m", version: 2, inputHash: "h" }, ...extra } });
const f = (name) => `data/internal/nfl/forecast-receipts/${name}.json`;

/* ─────────────────────────── the freshness rule ─────────────────────────── */

test("a sim is CURRENT only on the official revision file; the same inputHash on another revision is not current", () => {
  const rs = [receipt(f("2026-11-01/1"), "2026-11-01T16:00:18Z"), receipt(f("2026-11-02/1-rev-1929Z"), "2026-11-02T19:29:37Z")];
  const official = nflOfficialRevision(rs, "1");
  assert.equal(official.revision, "2026-11-02/1-rev-1929Z");
  const revisions = forecastRevisions(rs);
  const sim = (file) => ({ eventId: "1", inputSnapshotIds: { forecastReceipt: file } });
  assert.equal(simInputProvenance({ receipt: sim(f("2026-11-02/1-rev-1929Z")), official, revisions }).state, SIM_FRESHNESS.CURRENT);
  const old = simInputProvenance({ receipt: sim(f("2026-11-01/1")), official, revisions });
  assert.equal(old.state, SIM_FRESHNESS.EARLIER_FORECAST);
  assert.equal(old.current, false);
  assert.equal(old.label, "Built on an earlier forecast");
  assert.equal(old.input.forecastGeneratedAt, "2026-11-01T16:00:18Z");
  assert.equal(old.official.generatedAt, "2026-11-02T19:29:37Z");
});

test("what cannot be established is never current: no official revision, no named input, or an accessor on another revision", () => {
  const rs = [receipt(f("2026-11-02/1"), "2026-11-02T19:29:37Z")];
  const official = nflOfficialRevision(rs, "1");
  const named = { eventId: "1", inputSnapshotIds: { forecastReceipt: f("2026-11-02/1") } };
  assert.equal(simInputProvenance({ receipt: named, official: null }).state, SIM_FRESHNESS.UNVERIFIED);
  assert.equal(simInputProvenance({ receipt: { eventId: "1" }, official }).state, SIM_FRESHNESS.UNVERIFIED);
  assert.equal(nflOfficialRevision(rs, "1", { generatedAt: "2026-11-02T19:29:37.000Z" }).file, f("2026-11-02/1"), "same instant, other spelling");
  assert.equal(nflOfficialRevision(rs, "1", { generatedAt: "2026-11-02T00:05:54Z" }), null, "the page's accessor is on another revision");
  assert.equal(nflOfficialRevision([], "1"), null);
});

test("MEASURED 401873036: the sim of record's input, assumptions and timestamps are recorded from the receipt", () => {
  const revisions = { [INPUT]: { file: INPUT, revision: revisionId(INPUT), generatedAt: "2026-11-01T16:00:18Z", inputHash: "319a691b988f1f47", modelVersion: "m" } };
  const official = { file: LATER, revision: revisionId(LATER), generatedAt: "2026-11-02T19:29:37Z", inputHash: "9431c644102c9bd0", modelVersion: "m" };
  const p = simInputProvenance({ receipt: SIM, official, revisions });
  assert.equal(p.state, SIM_FRESHNESS.EARLIER_FORECAST);
  assert.equal(p.role, "HYPOTHETICAL");
  assert.equal(p.input.forecastRevision, `2026-11-01/${EVENT}`);
  assert.equal(p.official.forecastRevision, `2026-11-02/${EVENT}-rev-1929Z`);
  assert.equal(p.simulation.generatedAt, "2026-11-01T18:19:04Z");
  assert.equal(p.simulation.engine, "nfl-drive-sim-v2");
  assert.deepEqual(p.input.anchors, { home: 25, away: 20 });
  assert.equal(p.input.injuriesAsOf, "2026-11-01T18:16:53Z");
  assert.equal(p.input.roleSharesAsOf, "2026-11-01T18:16:53Z");
  assert.ok(p.assumptions.some((a) => a.includes("total 45, margin 5")), "the anchor it actually used");
  assert.ok(p.assumptions.some((a) => a.includes("Betting markets are not an input")));
});

/* ─────────────────────────── stale-input refusal ─────────────────────────── */

const adapted = adaptReceipt(SIM, { file: simFile }).manifest;
const earlier = { snapshot: pinOfficial.snapshot, refusal: null, revision: { file: LATER, revision: revisionId(LATER), generatedAt: "2026-11-02T19:29:37Z", inputHash: "x", modelVersion: "m" }, revisions: {} };

test("a stale batch has no central run: every run is a labelled what-if, and the official numbers stay", () => {
  assert.ok(pinOfficial.snapshot, "the pinned official snapshot builds");
  const m = withNflRepresentative(adapted, SIM, earlier);
  const rep = m.representative;
  assert.equal(rep.state, REP_STATE.INPUT_NOT_CURRENT);
  assert.equal(rep.refusal.code, "SIM_INPUT_NOT_CURRENT");
  assert.equal(officialRunIndex(m), null);
  assert.ok(rep.runs.length > 0);
  for (const r of rep.runs) {
    assert.equal(r.hypothetical, true);
    assert.equal(runRole(m, r.runIndex).role, "WHAT_IF");
  }
  assert.equal(rep.official.snapshotId, pinOfficial.snapshot.snapshotId, "the official summary is the snapshot, never the batch");
  assert.equal(m.simProvenance.state, SIM_FRESHNESS.EARLIER_FORECAST);
});

test("the same batch keeps its central run when its input IS the official revision (control), and is refused when the revision is unknown", () => {
  const control = withNflRepresentative(adapted, SIM, { ...earlier, revision: { ...earlier.revision, file: INPUT, revision: revisionId(INPUT) } });
  assert.equal(control.representative.state, REP_STATE.SELECTED);
  assert.equal(control.simProvenance.current, true);
  assert.equal(withNflRepresentative(adapted, SIM, { ...earlier, revision: null }).representative.state, REP_STATE.INPUT_NOT_CURRENT);
});

test("the provenance reaches the Theater payload, and the replay still plays a run of the stale batch", () => {
  const load = publicTheaterLoad({ eventId: EVENT, file: simFile, receipt: SIM, showable: true, refusals: [] }, earlier);
  assert.ok(load.ok);
  assert.equal(load.manifest.simProvenance.input.forecastRevision, `2026-11-01/${EVENT}`);
  assert.ok(defaultSample(load.manifest), "historical runs stay playable");
});

/* ─────────────────────────── CHI @ SEA: official slot vs simulated slot ─────────────────────────── */

test("MEASURED Swift and Williams: the official panel prints the board, the report prints the simulation, each under its own label", () => {
  const swift = playerOf(pinOfficial.snapshot, SWIFT).families;
  const williams = playerOf(pinOfficial.snapshot, WILLIAMS).families;
  assert.equal(swift.anytime_td.expected, 0.6687);
  assert.equal(williams.player_pass_yds.median, 235.1034);
  const sim = (id) => SIM.playerStatDistributions.find((p) => p.playerId === id);
  assert.equal(sim(SWIFT).anytimeTd, 0.4209);
  assert.equal(sim(WILLIAMS).stats.rushYds.p50, 34);
  assert.equal(sim(WILLIAMS).stats.passYds.p50, 205);

  const view = gameView({ forecast: pinForecast, board: pinBoard, official: pinOfficial.snapshot });
  const panel = renderToStaticMarkup(React.createElement(NflOfficialDefault, { model: nflOfficialDefault(view), gameHref: `/nfl/game/${EVENT}/` }));
  assert.ok(panel.includes(formatValue("probability", 0.6687)), "official Swift TD on the panel");
  assert.ok(!panel.includes("42.1%"), "the simulated Swift TD is not on the official panel");
  assert.match(text(panel), /Official projected game/);

  const provenance = simInputProvenance({ receipt: SIM, official: earlier.revision, revisions: {} });
  const report = renderToStaticMarkup(React.createElement(SimulationV2Report, { r: SIM, provenance, gameHref: `/nfl/game/${EVENT}/` }));
  assert.ok(report.includes("42.1%"), "the simulated Swift TD stays on the report");
  assert.ok(!report.includes("66.9%"), "the report prints no official number");
  const td = report.slice(report.indexOf('id="s2-td"') - 4);
  assert.match(td.slice(0, 200), /Simulated touchdown scorers \(hypothetical\)/);
  for (const id of ["s2-outcome", "s2-dist", "s2-periods", "s2-team", "s2-players", "s2-td"]) {
    assert.match(report, new RegExp(`id="${id}">[^<]*hypothetical`), `${id}: section heading says hypothetical`);
  }
  assert.match(report, /data-sim-provenance="EARLIER_FORECAST"/);
  assert.match(text(report), /built on an earlier forecast/);
  assert.doesNotMatch(text(report), /match the Game Time Forecast/, "a stale batch never claims to match the forecast");
});

/* ─────────────────────────── the real page, rendered without a build ─────────────────────────── */

const entries = readShadowReceipts(REPO);
const showable = showableSimulationEvents(entries);
const liveIds = new Set(loadForecastViews(path.join(APP, "public")).map((v) => v.providerEventId));
const sample = [...showable.filter((id) => liveIds.has(id)).slice(-2), ...showable.filter((id) => !liveIds.has(id)).slice(-2)];
const render = async (eventId) => renderToStaticMarkup(await Page({ params: { eventId } }));
const payloadOf = (html) => JSON.parse(html.match(/<script type="application\/json" data-sim-provenance-json="">([\s\S]*?)<\/script>/)?.[1] ?? "null");

for (const id of sample) {
  test(`page ${id}, flag OFF: official panel first and fed only by the accessor; inputs recorded; hypothetical after it`, async () => {
    const html = await render(id);
    const iPanel = html.indexOf('id="official-projected-game"');
    const iProv = html.indexOf('data-sim-provenance="');
    const iOutcome = html.indexOf('id="s2-outcome"');
    assert.ok(iPanel > 0 && iPanel < iProv && iProv < iOutcome, `panel → provenance → simulation (${[iPanel, iProv, iOutcome]})`);
    assert.ok(!html.includes("data-stp-section"), "flag OFF: no Theater section");

    const view = nflOfficialView(REPO, id);
    assert.ok(view, `${id}: the official view exists (live or archived)`);
    const panel = renderToStaticMarkup(React.createElement(NflOfficialDefault, { model: nflOfficialDefault(view, { positions: readNflRosterPositions(REPO) }), gameHref: `/nfl/game/${id}/` }));
    assert.ok(html.includes(panel), "the page's panel is byte-identical to the render from the official view alone");

    const rec = simulationOfRecord(entries, id);
    const official = nflTheaterOfficial(REPO, id);
    const want = simInputProvenance({ receipt: rec.receipt, official: official.revision, revisions: official.revisions });
    const got = payloadOf(html);
    assert.deepEqual(got, JSON.parse(JSON.stringify(want)), "the page payload is the provenance");
    assert.equal(got.input.forecastGeneratedAt != null, true, "the input revision's timestamp is recorded");
    assert.ok(got.simulation.generatedAt && got.simulation.engineVersion && got.input.forecastRevision && got.assumptions.length >= 3);
    assert.match(html, new RegExp(`data-sim-provenance="${got.state}"`));
    assert.ok(text(html).includes(SIM_FRESHNESS_LABEL[got.state]), "the state is printed in words");
    if (!got.current) {
      assert.match(html, new RegExp(`data-sim-input-revision="${got.input.forecastRevision}"`));
      assert.match(text(html), /Nothing in this simulation is current or official/);
    }
  });
}

test("page, flag ON: the section opens on the same panel and the stale replay is labelled, with no central run", async () => {
  const id = sample.find((x) => !simInputProvenance({ receipt: simulationOfRecord(entries, x).receipt, ...((o) => ({ official: o.revision, revisions: o.revisions }))(nflTheaterOfficial(REPO, x)) }).current);
  assert.ok(id, "a committed stale sim exists");
  process.env.GTP_NFL_THEATER_PUBLIC = "1";
  try {
    const html = await render(id);
    const iPanel = html.indexOf('id="official-projected-game"'), iScen = html.indexOf('data-stp-scenarios=""'), iProv = html.indexOf('data-sim-provenance="');
    assert.ok(iPanel > 0 && iPanel < iScen && iScen < iProv, `panel → scenarios → provenance (${[iPanel, iScen, iProv]})`);
    const scen = text(html.slice(iScen, html.indexOf('id="s2-outcome"')));
    assert.ok(scen.includes(SIM_FRESHNESS_LABEL.EARLIER_FORECAST) || scen.includes(SIM_FRESHNESS_LABEL.UNVERIFIED));
    assert.match(scen, /no stored run is the central run/);
    assert.doesNotMatch(scen, /· central run|stored run closest to|Central scenario/, "no run of a stale batch takes the central role");
  } finally {
    delete process.env.GTP_NFL_THEATER_PUBLIC;
  }
});

test("SOURCE: the report takes no official number, and the page's panel takes no simulation input", () => {
  const report = fs.readFileSync(path.join(APP, "src/components/nfl/simulation-v2-report.tsx"), "utf8");
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/simulation/[eventId]/page.tsx"), "utf8");
  assert.doesNotMatch(report, /canonical\.|forecastSummary|player-board/);
  assert.match(page, /nflOfficialDefault\(nflOfficialView\(REPO_ROOT, eventId\)/, "the panel's only input is the official view");
  assert.doesNotMatch(page, /canonicalFor|unionFrozenForecasts/, "no second accessor for the official numbers");
});
