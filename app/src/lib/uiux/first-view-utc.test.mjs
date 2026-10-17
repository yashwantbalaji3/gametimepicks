/**
 * No raw ISO-UTC timestamp in first-view text on any exported page (P246 house rule, enforced 2026-10-15).
 *
 * `formatUpdatedEt` / <EtTime> print artifact stamps as "Oct 14, 7:43 PM ET" and keep the exact ISO value in
 * the `<time datetime>` attribute and hover title, so precision is never lost. Before this guard, 410 raw
 * "2026-10-13T00:56:16Z"-style stamps sat in visible text (NFL game provenance, EPL match "Generated", UFC
 * bout, NFL week board stamp, the EPL/UFC card ladders, /nfl/simulation availability, the /nfl schedule line).
 *
 * Scope: visible text inside <main>. Excluded, deliberately — attributes (where the exact value belongs),
 * <code>, and <details> disclosures (the "exact reason on request" rule, GTP-27).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const ISO_UTC = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/;

function firstViewText(html) {
  const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
  return main
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<code[\s\S]*?<\/code>|<details[\s\S]*?<\/details>/g, "")
    .replace(/<[^>]+>/g, " ");
}

test("no exported page shows a raw ISO-UTC timestamp in first-view text", () => {
  assert.ok(fs.existsSync(OUT), "needs a built export at app/out/");
  const pages = fs.readdirSync(OUT, { recursive: true }).filter((f) => f.endsWith("index.html"));
  assert.ok(pages.length > 1000, `only ${pages.length} pages found — the scan is not seeing the export`);
  const offenders = [];
  for (const rel of pages) {
    const text = firstViewText(fs.readFileSync(path.join(OUT, rel), "utf8"));
    const m = ISO_UTC.exec(text);
    if (m) offenders.push(`/${path.dirname(rel)}/ … ${text.slice(Math.max(0, m.index - 50), m.index + 25).replace(/\s+/g, " ").trim()}`);
  }
  assert.deepEqual(offenders.slice(0, 10), [], `${offenders.length} page(s) print a raw UTC stamp — use <EtTime> / formatUpdatedEt`);
});

test("the exact value is kept: stamps render as <time datetime=ISO> with ET text", () => {
  const dir = path.join(OUT, "nfl", "game");
  if (!fs.existsSync(dir)) return;
  const game = fs.readdirSync(dir).find((d) => fs.existsSync(path.join(dir, d, "index.html")));
  assert.ok(game, "no NFL game page in the export");
  const html = fs.readFileSync(path.join(dir, game, "index.html"), "utf8");
  const times = [...html.matchAll(/<time dateTime="([^"]+)" title="([^"]+)">([^<]+)<\/time>/g)];
  assert.ok(times.length >= 2, "the provenance block must carry <time> elements");
  for (const [, dt, title, text] of times) {
    assert.match(dt, ISO_UTC, "the attribute keeps the exact ISO value");
    assert.equal(title, dt);
    assert.match(text, /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M ET$/, `visible text is the ET stamp, got "${text}"`);
  }
});
