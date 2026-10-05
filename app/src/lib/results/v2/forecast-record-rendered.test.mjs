/**
 * Session 13 · Results V2 rendered guard — reads the BUILT export (out/). The Forecast Record pages exist for every
 * ledger family, show the ledger's own counts, ship their CSV, stay light, and render no broken values.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { forecastRecordView, ledgerFamilies, familyRows, SPORT_SLUGS } from "./forecast-ledger-reader.ts";

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
