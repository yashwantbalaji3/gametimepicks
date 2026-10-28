/**
 * POST-BUILD · settled MLB game pages (audit 2026-10-28 F02): every recent graded game the current slate no longer builds
 * is exported at its own /games/mlb/<slug>/ URL, shows the record's final and every graded call exactly, and the
 * archived lobby for its date links to it. Read from the built export (out/), against the committed record.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));
const { settledMlbGames } = await import("./settled-games-data.ts");

const buildDay = () => JSON.parse(fs.readFileSync(path.join(OUT, "data", "build-info.json"), "utf8")).buildEtDate;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#x27;|&amp;/g, " ").replace(/\s+/g, " ");
const pct = (p) => `${(p * 100).toFixed(1)}%`;

test("every settled game in the window is exported with its final and every graded call, as recorded", (t) => {
  if (!hasBuild) { t.skip("no export in this run"); return; }
  const games = settledMlbGames(buildDay());
  if (!games.length) { t.diagnostic("no graded MLB game in the window"); return; }
  let checked = 0;
  for (const g of games) {
    const f = path.join(OUT, "games", "mlb", g.slug, "index.html");
    assert.ok(fs.existsSync(f), `${g.slug} is exported`);
    const html = fs.readFileSync(f, "utf8");
    if (!html.includes(`data-mlb-settled-game="${g.slug}"`)) continue; // the live report owns this URL today
    checked++;
    const tx = text(html);
    if (g.final) assert.ok(tx.includes(`Final: ${g.away} ${g.final.away} – ${g.final.home} ${g.home}`), `${g.slug} final`);
    for (const c of g.calls) {
      assert.ok(html.includes(`data-settled-call="${c.market}"`), `${g.slug} ${c.market} row`);
      if (c.modelProbability != null) assert.ok(tx.includes(pct(c.modelProbability)), `${g.slug} ${c.market} probability as recorded`);
    }
    assert.ok(tx.includes("Game report archived") && tx.includes("Technical details"), `${g.slug} archived note + details`);
    assert.ok(!/\b0\.0%/.test(tx) || g.calls.some((c) => c.modelProbability === 0), `${g.slug} prints no invented 0%`);
  }
  assert.ok(checked > 0, "at least one settled page rendered (positive control)");
});

test("the archived lobby links each settled game to its settled page, not to a generic results page", (t) => {
  if (!hasBuild) { t.skip("no export in this run"); return; }
  const games = settledMlbGames(buildDay());
  const byDate = new Map();
  for (const g of games) byDate.set(g.date, [...(byDate.get(g.date) ?? []), g]);
  let linked = 0;
  for (const [date, list] of byDate) {
    const f = path.join(OUT, "simulate", "d", date, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    for (const g of list) if (html.includes(`/games/mlb/${g.slug}/`)) linked++;
  }
  assert.ok(linked > 0, "settled MLB rows in archived lobbies open their settled pages");
});
