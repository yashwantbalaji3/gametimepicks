/**
 * Session 13 · Results V2 rendered guard — reads the BUILT export (out/). The Forecast Record pages exist for every
 * ledger family, show the ledger's own counts, ship their CSV, stay light, and render no broken values.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { forecastRecordView, ledgerFamilies, familyRows, SPORT_SLUGS, researchHrefFor, subjectRows, familyHref } from "./forecast-ledger-reader.ts";

const OUT = path.join(process.cwd(), "out");
const html = (rel) => fs.readFileSync(path.join(OUT, rel), "utf8");
/** Visible text of <main> only (nav chrome and the RSC payload would make a text guard vacuous). */
const mainText = (h) => {
  const m = /<main[\s\S]*?<\/main>/.exec(h);
  return (m ? m[0] : h).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
};

test("the Forecast Record overview renders the ledger's own counts and links every family", { skip: !fs.existsSync(OUT) && "no built export" }, () => {
  const h = html("results/forecasts/index.html");
  const t = mainText(h);
  const rec = forecastRecordView();
  assert.match(t, /Forecast record/);
  assert.ok(t.includes(rec.kpis.forecasts.toLocaleString("en-US")), "forecasts published = ledger rows");
  assert.ok(t.includes(rec.kpis.measured.toLocaleString("en-US")), "measured = ledger measured");
  assert.doesNotMatch(t, /NaN|undefined|\[object Object\]|Infinity/);
  assert.doesNotMatch(t, /% accurate/i, "no pooled accuracy headline");
  for (const { sport, family } of ledgerFamilies()) {
    assert.ok(h.includes(`/results/forecasts/${SPORT_SLUGS[sport]}/${family.replace(/_/g, "-")}/`), `${sport} ${family} linked`);
  }
  assert.ok(html("results/index.html").includes("/results/forecasts/"), "/results links the Forecast Record");
});

test("every family page exists, counts its rows, ships a matching CSV and stays light", { skip: !fs.existsSync(OUT) && "no built export" }, () => {
  for (const { sport, family } of ledgerFamilies()) {
    const slug = `${SPORT_SLUGS[sport]}/${family.replace(/_/g, "-")}`;
    const rel = `results/forecasts/${slug}/index.html`;
    assert.ok(fs.existsSync(path.join(OUT, rel)), `${rel} exists`);
    const h = html(rel);
    const t = mainText(h);
    const n = familyRows(sport, family).length;
    assert.ok(t.includes(`${n.toLocaleString("en-US")} forecasts published`), `${slug}: page states its row count`);
    assert.doesNotMatch(t, /NaN|undefined|\[object Object\]|Infinity/, slug);
    assert.ok(Buffer.byteLength(h) < 400_000, `${slug}: ${Buffer.byteLength(h)} bytes — over the 400KB family-page ceiling`);
    const csv = path.join(OUT, `data/forecast-record/v1/${SPORT_SLUGS[sport]}-${family.replace(/_/g, "-")}.csv`);
    assert.ok(fs.existsSync(csv), `${slug}: CSV shipped`);
    assert.equal(fs.readFileSync(csv, "utf8").trimEnd().split("\n").length - 1, n, `${slug}: CSV rows = page rows`);
  }
});

// ── Research V2 (Session 13): the intelligence graph's links exist in the built pages ─────────────────────────────

test("a player's Research page shows their own forecast history, and links each forecast type's record", { skip: !fs.existsSync(OUT) && "no built export" }, () => {
  // Every ledger player with a Research page, sampled deterministically: the first 25 by id.
  const { rows } = readLedgerForTest();
  const ids = [...new Set(rows.filter((r) => r.subjectType === "PLAYER").map((r) => r.subjectId))].sort().filter((id) => researchHrefFor(id)).slice(0, 25);
  assert.ok(ids.length >= 10, `players with a Research page and ledger rows: ${ids.length}`);
  let checked = 0;
  for (const id of ids) {
    const href = researchHrefFor(id);
    const rel = `${href.replace(/^\//, "")}index.html`;
    if (!fs.existsSync(path.join(OUT, rel))) continue;
    checked += 1;
    const h = html(rel);
    const t = mainText(h);
    const n = subjectRows(id).length;
    assert.match(t, /Our forecasts for /, `${href}: history section`);
    assert.ok(t.includes(`${n} published forecast${n === 1 ? "" : "s"}`), `${href}: states ${n} forecasts`);
    const fam = subjectRows(id)[0];
    assert.ok(h.includes(familyHref(fam.sport, fam.family)), `${href}: links its forecast type's record`);
  }
  assert.ok(checked >= 10, `only ${checked} player pages were built — the guard would be vacuous`);
});

test("family pages link players to Research; Model Lab links every family's record", { skip: !fs.existsSync(OUT) && "no built export" }, () => {
  const fam = html("results/forecasts/nfl/player-receptions/index.html");
  assert.match(fam, /href="\/players\/nfl\/[a-z0-9-]+\/"/, "a forecast row links its player's Research page");
  const models = html("models/index.html");
  for (const { sport, family } of ledgerFamilies()) assert.ok(models.includes(familyHref(sport, family)), `/models links ${sport} ${family}`);
});

function readLedgerForTest() {
  return { rows: readAll() };
}
function readAll() {
  const dir = path.resolve(process.cwd(), "..", "data/internal/forecast-ledger/v1");
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) for (const l of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) if (l.trim()) out.push(JSON.parse(l));
  return out;
}
