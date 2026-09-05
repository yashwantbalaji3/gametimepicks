/**
 * THE RULES EVERY ADAPTER OBEYS — Program 234 · Release C.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/adapters.test.mjs
 *
 * Four adapters read four different artifacts, and the ways they can go wrong are the same in each.
 * These assertions are cross-sport on purpose: a rule enforced only where it was first broken gets
 * re-broken in the next sport that comes along.
 *
 * The run-count rule is the sharpest of them. The player's histogram once carried a hardcoded
 * caption reading "Total runs · share of simulated games", which appeared under an EPL goals chart —
 * the wrong unit AND a trial-count claim for a model that solves an exact matrix and runs no trials
 * at all. A claim is allowed only where the provenance carries the number that backs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildAllGameDetails } from "../../game-detail.ts";
import { buildMlbPresentation } from "./mlb.ts";
import { buildEplPresentation } from "./epl.ts";
import { buildUfcPresentation } from "./ufc.ts";
import { buildNflPresentation } from "./nfl.ts";
import { loadEplForecasts } from "../../sports/epl/forecast-view.ts";
import { nflSimulateEligibility } from "../../sports/nfl/simulate-eligibility.ts";
import { isPresentable } from "./types.ts";

const APP = process.cwd();
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")); } catch { return null; } };

/** Every manifest this repository can currently build, one per sport where the slate allows. */
function allManifests() {
  const out = [];
  for (const d of buildAllGameDetails().filter((g) => g.sport === "mlb")) {
    out.push(["mlb", buildMlbPresentation(d)]);
  }
  for (const r of loadEplForecasts()?.rows ?? []) {
    out.push(["epl", buildEplPresentation(r)]);
  }
  const card = readJson("public/data/ufc/card-latest.json");
  if (card) out.push(["ufc", buildUfcPresentation(card)]);
  const nfl = nflSimulateEligibility();
  for (const e of nfl.events ?? []) {
    out.push(["nfl", buildNflPresentation(e, { indexGeneratedAt: nfl.indexGeneratedAt })]);
  }
  return out;
}

const presentable = () => allManifests().filter(([, m]) => isPresentable(m));

test("at least two sports can currently be presented — this suite must not pass by having nothing to check", () => {
  const sports = new Set(presentable().map(([s]) => s));
  assert.ok(sports.size >= 2, `only ${[...sports].join(", ") || "no"} sport(s) produced a manifest; the cross-sport rules below would be vacuous`);
});

test("A RUN-COUNT CLAIM REQUIRES A RUN COUNT", () => {
  for (const [sport, m] of presentable()) {
    const text = [
      ...m.chapters.map((c) => `${c.line} ${c.title} ${c.axisCaption ?? ""}`),
      ...m.chapters.flatMap((c) => c.rows.map((r) => `${r.label} ${r.detail}`)),
      ...m.chapters.flatMap((c) => c.stats.map((s) => `${s.label} ${s.note ?? ""} ${s.text ?? ""}`)),
    ].join(" ");
    const claims = /simulated (games|matches|fights)|\b[\d,]+-run\b|\biterations\b/i.test(text);
    if (claims) {
      assert.ok(
        m.provenance.runCount != null && m.provenance.runCount > 0,
        `${sport} ${m.eventId} claims simulated trials and its provenance carries no run count`,
      );
    }
  }
});

test("EVERY MANIFEST CARRIES A LIMITS CHAPTER", () => {
  for (const [sport, m] of presentable()) {
    const limits = m.chapters.find((c) => c.kind === "limits");
    assert.ok(limits, `${sport} ${m.eventId} presents with no limits chapter`);
    assert.ok(limits.rows.length > 0, `${sport} ${m.eventId} has an empty limits chapter, which is worse than none`);
  }
});

test("every distribution chapter names its own units", () => {
  for (const [sport, m] of presentable()) {
    for (const c of m.chapters.filter((ch) => ch.kind === "distribution" && ch.bars.length)) {
      assert.ok(c.axisCaption && c.axisCaption.length > 3, `${sport} ${m.eventId} draws a histogram with no axis caption — the player used to supply a baseball one for every sport`);
    }
  }
});

test("no manifest is empty, and every chapter can be told apart from the others", () => {
  for (const [sport, m] of presentable()) {
    assert.ok(m.chapters.length >= 3, `${sport} ${m.eventId} has ${m.chapters.length} chapters`);
    assert.equal(new Set(m.chapters.map((c) => c.id)).size, m.chapters.length, `${sport} ${m.eventId} repeats a chapter id`);
    for (const c of m.chapters) {
      assert.ok(c.line && c.line.length > 10, `${sport} ${m.eventId} chapter ${c.id} has no sentence`);
    }
  }
});

test("EVERY BAR IS A PROBABILITY — a share outside [0,1] is a units bug, drawn as a chart", () => {
  for (const [sport, m] of presentable()) {
    for (const c of m.chapters) {
      for (const b of c.bars) {
        assert.ok(Number.isFinite(b.p) && b.p >= 0 && b.p <= 1, `${sport} ${m.eventId} ${c.id}: bar "${b.label}" is ${b.p}`);
      }
      for (const s of c.stats) {
        if (s.format === "probability") {
          assert.ok(s.value == null || (s.value >= 0 && s.value <= 1), `${sport} ${m.eventId} ${c.id}: "${s.label}" is ${s.value} as a probability`);
        }
      }
    }
  }
});

test("a total auto-play sits in a watchable range", () => {
  for (const [sport, m] of presentable()) {
    const secs = m.chapters.reduce((a, c) => a + c.holdMs, 0) / 1000;
    assert.ok(secs >= 20 && secs <= 120, `${sport} ${m.eventId} runs ${secs.toFixed(0)}s`);
  }
});

test("THE REPORT IS ALWAYS REACHABLE — including from a refusal", () => {
  for (const [sport, m] of allManifests()) {
    assert.ok(m.reportHref && m.reportHref.startsWith("/"), `${sport} produced a manifest with no route home`);
    if (!isPresentable(m)) {
      assert.ok(m.reason && m.reason.length > 20, `${sport} refused without a usable reason: "${m.reason}"`);
    }
  }
});

test("NO EXPIRED CLAIM travels into a UFC presentation", () => {
  const card = readJson("public/data/ufc/card-latest.json");
  if (!card) return;
  const m = buildUfcPresentation(card);
  if (!isPresentable(m)) return;
  /*
   * The artifact's own `model.notModelled.moneyline` still reads "our authorisation to buy odds
   * covers NFL only". A UFC odds receipt exists, /ufc shows posted prices, and the model has been
   * scored against the de-vigged line since 2026-08-22. Carrying the artifact's sentence verbatim —
   * which every other limits row does — would reprint an expired claim inside a persuasive frame.
   */
  const text = JSON.stringify(m);
  assert.doesNotMatch(text, /covers NFL only/i, "the expired odds-authorisation sentence reached a UFC presentation");
});
