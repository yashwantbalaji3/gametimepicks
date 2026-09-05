/**
 * RECOVERED FORECAST HISTORY — Program 235 · Release C.
 *
 * Run: npx tsx --test src/lib/sports/epl/forecast-recovery.test.mjs
 *
 * P234 reported an archive gap and named the wrong fixture. Newcastle v Bournemouth is in
 * `2026-09-03.json` and `2026-09-04.json` — the dated files are named by GENERATION date, not
 * kickoff date, so a fixture forecast the evening before appears under that evening's file, and its
 * page has been reachable throughout. Retirement of started events behaved correctly.
 *
 * The real gap is a schema transition. Nine dated rows carry probabilities and no `slug`, because
 * the producer had not started emitting one; the archive loader keys on `slug && probs`, so they are
 * in the file and absent from the product. Eight reappear later with slugs. One — Arsenal v Coventry
 * City — kicked off before the next dated file was written and never did.
 *
 * These assertions are about what a repair must never do: invent an identity, alter a published
 * forecast, mask a real one, or quietly resurrect an event that has no genuine pre-event receipt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { loadEplForecastArchive, findEplForecastAnywhere } from "./forecast-view.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DIR = path.join(APP, "public/data/soccer/epl/forecasts");
const RECOVERED = path.join(DIR, "recovered.json");
const doc = fs.existsSync(RECOVERED) ? JSON.parse(fs.readFileSync(RECOVERED, "utf8")) : null;

test("the recovery artifact exists and is non-empty — everything below is vacuous otherwise", () => {
  assert.ok(doc, "no recovery artifact");
  assert.ok((doc.rows ?? []).length > 0, "the recovery artifact recovered nothing");
  assert.equal(doc.dataClass, "PUBLIC_DERIVED", "a recovered public forecast must not carry a private class");
});

test("P234's NAMED FIXTURE WAS NEVER MISSING — and this proves it rather than repeating it", () => {
  const r = findEplForecastAnywhere("newcastle-united-v-bournemouth-2026-09-05");
  assert.ok(r, "the fixture P234 called an archive gap does not resolve");
  /* And it resolves from a DATED file, not from the recovery — nothing was repaired for it. */
  const inRecovery = (doc?.rows ?? []).some((x) => x.slug === "newcastle-united-v-bournemouth-2026-09-05");
  assert.equal(inRecovery, false, "the recovery invented a repair for a fixture that was already present");
});

test("EVERY RECOVERED ROW CARRIES ITS PROVENANCE — three separate facts, three fields", () => {
  for (const r of doc.rows) {
    assert.ok(r.recovery, `${r.slug} has no provenance`);
    /* Forecast creation, slug publication and this repair are different moments. */
    assert.match(r.recovery.forecastGeneratedAt ?? "", /^\d{4}-\d{2}-\d{2}T/, `${r.slug}: no forecast generation time`);
    assert.match(r.recovery.slugPublishedAt ?? "", /^\d{4}-\d{2}-\d{2}T/, `${r.slug}: no slug publication time`);
    assert.match(r.recovery.materializedAt ?? "", /^\d{4}-\d{2}-\d{2}T/, `${r.slug}: no materialization time`);
    assert.notEqual(r.recovery.forecastGeneratedAt, r.recovery.materializedAt, `${r.slug}: the repair is dated as though it were the forecast`);
    assert.match(r.recovery.slugSourceCommit ?? "", /^[0-9a-f]{40}$/, `${r.slug}: no source commit for its slug`);
  }
});

test("THE RECOVERED FORECAST IS THE ONE THAT WAS PUBLISHED, unaltered", () => {
  for (const r of doc.rows) {
    const source = JSON.parse(fs.readFileSync(path.join(REPO, r.recovery.forecastSourceFile), "utf8"));
    const original = (source.rows ?? []).find((x) => x.eventId === r.eventId);
    assert.ok(original, `${r.slug}: its own source file no longer contains the event`);
    /* Everything except the two fields the repair adds must be byte-identical to what was published. */
    const { slug, recovery, ...carried } = r;
    assert.deepEqual(carried, original, `${r.slug}: the repair altered the published forecast`);
    assert.deepEqual(r.probs, original.probs, `${r.slug}: probabilities moved`);
  }
});

test("THE SLUG WAS RECOVERED, NOT DERIVED — a committed public revision carried it", () => {
  for (const r of doc.rows) {
    const raw = execFileSync("git", ["show", `${r.recovery.slugSourceCommit}:app/public/data/soccer/epl/forecasts/latest.json`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const rev = JSON.parse(raw);
    assert.equal(rev.public, true, `${r.slug}: its slug came from a revision that was not public`);
    const published = (rev.rows ?? []).find((x) => x.eventId === r.eventId);
    assert.ok(published, `${r.slug}: the named commit does not carry this event id`);
    assert.equal(published.slug, r.slug, `${r.slug}: the recovered slug is not the one that was published`);
  }
});

test("THE FORECAST PRECEDED ITS KICKOFF — a repair may not resurrect a post-event forecast", () => {
  for (const r of doc.rows) {
    const generated = Date.parse(r.recovery.forecastGeneratedAt);
    const kickoff = Date.parse(r.kickoffUtc);
    assert.ok(Number.isFinite(generated) && Number.isFinite(kickoff), `${r.slug}: unparseable times`);
    assert.ok(generated < kickoff, `${r.slug}: its forecast was generated after kickoff and must not be recovered`);
  }
});

test("A RECOVERED ROW NEVER MASKS A REAL ONE — the dated archive always wins", () => {
  const dated = new Set();
  for (const f of fs.readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const row of (JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows ?? [])) {
      if (row?.slug && row?.probs) dated.add(row.slug);
    }
  }
  assert.ok(dated.size > 0, "population");
  for (const r of doc.rows) {
    assert.equal(dated.has(r.slug), false, `${r.slug} is already in a dated file — the recovery would shadow it`);
  }
});

test("THE ARCHIVE GAINS EXACTLY THE RECOVERED FIXTURES, and no duplicates", () => {
  const archive = loadEplForecastArchive();
  const slugs = archive.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length, "the archive contains a duplicate slug");
  for (const r of doc.rows) {
    assert.ok(slugs.includes(r.slug), `${r.slug} was recovered and is still absent from the archive`);
  }
});

test("A RERUN PRODUCES IDENTICAL LOGICAL OUTPUT", () => {
  const before = JSON.parse(fs.readFileSync(RECOVERED, "utf8"));
  execFileSync("npx", ["tsx", "scripts/archive/recover-forecast-history.mjs", "--apply"], { cwd: APP, encoding: "utf8" });
  const after = JSON.parse(fs.readFileSync(RECOVERED, "utf8"));
  /* materializedAt is this run's own clock and legitimately differs; everything else must not. */
  const strip = (d) => ({
    ...d, materializedAt: null,
    rows: (d.rows ?? []).map((r) => ({ ...r, recovery: { ...r.recovery, materializedAt: null } })),
  });
  assert.deepEqual(strip(after), strip(before), "a rerun changed the recovered record");
  assert.equal(after.rows.length, before.rows.length, "a rerun changed the recovered population");
});

test("AN EVENT WITH NO PUBLISHED SLUG STAYS MISSING — the repair is fail-closed", () => {
  /*
   * The recovery only ever assigns a slug some committed public revision actually carried. A dated
   * row whose event id appears in no such revision is reported as unavailable and left out, because
   * building a slug out of the event id would produce a plausible string that was never published.
   */
  const src = fs.readFileSync(path.join(APP, "scripts/archive/recover-forecast-history.mjs"), "utf8");
  assert.match(src, /unavailable\.push/, "the tool has no unavailable path at all");
  const eventIds = new Set(doc.rows.map((r) => r.eventId));
  for (const r of doc.rows) {
    assert.ok(r.eventId && eventIds.has(r.eventId), "a recovered row lost its canonical identity");
    assert.notEqual(r.slug, r.eventId, "a slug was taken verbatim from an event id");
  }
});

test("NO PRIVATE RESEARCH PAYLOAD REACHED THE PUBLIC ARTIFACT", () => {
  const text = JSON.stringify(doc);
  assert.doesNotMatch(text, /PRIVATE_RESEARCH/, "a private data class reached a public artifact");
  /* The internal snapshots carry a `model` block and a `market` block; the public row shape does not. */
  for (const r of doc.rows) {
    assert.equal(r.market, undefined, `${r.slug} carries a market block from a private capture`);
    assert.equal(r.publicActivation, undefined, `${r.slug} carries an internal activation field`);
  }
});
