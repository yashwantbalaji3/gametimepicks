/**
 * §7: `generatedAt > eventStart` IS NOT PREGAME — no exception.
 *
 * 🔴 THE DEFECT, on the committed artifact for 2026-09-26. Three of thirteen games carry
 * `completeness.startedBeforeGeneration: true`, and the full-game report's header rendered, for
 * each of them, an "Unavailable" chip and:
 *
 *     Simulated 5:24 PM · pregame
 *
 * The same artifact calling itself both. §7: a post-start report may be useful; it simply cannot be
 * called a pregame simulation.
 *
 * ⚠ AND THE SIBLING COMPONENT ALREADY KEPT THE RULE. `mlb-simulation-report-v2.tsx` states it in
 * its own header — "Never labels a post-first-pitch capture as pregame". Two components, one rule,
 * one of them wrong, which is how a since-fixed defect comes back on the other surface.
 *
 * Run: cd app && npx tsx --test src/lib/mlb/full-game/pregame-provenance.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const ReportModule = await import("../../../components/game/mlb-full-game-report.tsx");
const Report = ReportModule.default;
const { simProvenance } = ReportModule;

const APP = process.cwd();
const DIR = path.join(APP, "public/data/mlb/full-game-simulations");

/** The newest committed slate that actually contains a started-before-generation game. */
function slateWithStarted() {
  for (const f of fs.readdirSync(DIR).sort().reverse()) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const started = (j.games ?? []).find((g) => g?.completeness?.startedBeforeGeneration === true);
    const pre = (j.games ?? []).find((g) => g?.completeness?.startedBeforeGeneration !== true);
    if (started && pre) return { file: f, artifact: j, started, pre };
  }
  return null;
}

const found = slateWithStarted();
const meta = (a) => ({ generatedAt: a.generatedAt, modelVersion: a.modelVersion, runCount: a.runCount });
/** The component's real prop shape — `fullGame`, not `g`. */
const render = (fullGame) => ({
  fullGame, meta: meta(found.artifact), prediction: null, deepDive: null,
  awayCode: fullGame.awayTeam ?? "AWY", homeCode: fullGame.homeTeam ?? "HOM",
});
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("a committed slate carries BOTH a pregame and a started game — else this suite is vacuous", () => {
  assert.ok(found, `no slate under ${DIR} has both a started and a not-started game`);
});

test("🔴 §7 · a game simulated AFTER first pitch is not labelled pregame", { skip: !found }, () => {
  const t = text(renderToStaticMarkup(React.createElement(Report, render(found.started))));
  assert.match(t, /after first pitch/i, "it must say what it actually is");
  assert.equal(/· pregame/.test(t), false,
    "a post-start simulation called itself pregame beside its own Unavailable chip");
});

test("🔴 a CARRIED-FORWARD game shows no time at all — the slate's clock is not its clock", { skip: !found }, () => {
  /*
   * The producer carries a game's pregame forecast forward verbatim when a later run happens after
   * its first pitch, and a carried game keeps NO per-game timestamp. On 2026-09-26 the slate's
   * generatedAt is 21:24Z while three games with 20:05–20:10Z first pitches are correctly
   * `startedBeforeGeneration: false` — and the header rendered "Simulated 5:24 PM · pregame", a
   * clock from after kickoff attached to a forecast made before it.
   */
  const carried = found.artifact.games.find((g) => {
    const started = g?.completeness?.startedBeforeGeneration;
    const gen = Date.parse(found.artifact.generatedAt);
    const first = Date.parse(g?.firstPitch ?? "");
    return started === false && Number.isFinite(first) && gen >= first;
  });
  if (!carried) { assert.ok(true, "no carried-forward game in this slate"); return; }
  const t = text(renderToStaticMarkup(React.createElement(Report, render(carried))));
  assert.match(t, /carried forward from an earlier run/i, "it must say where the forecast came from");
  assert.match(t, /Pregame/i, "and that the forecast itself IS pregame");
  assert.equal(/Simulated \d/.test(t), false,
    "a time from a later run must not be printed as this game's simulation time");
});

test("§7 · a genuine pregame simulation, stamped by its OWN run, still shows its time", { skip: !found }, () => {
  const pre = found.artifact.games.find((g) => {
    const started = g?.completeness?.startedBeforeGeneration;
    const gen = Date.parse(found.artifact.generatedAt);
    const first = Date.parse(g?.firstPitch ?? "");
    return started === false && Number.isFinite(first) && gen < first;
  });
  if (!pre) { assert.ok(true, "every not-started game in this slate is carried forward"); return; }
  const t = text(renderToStaticMarkup(React.createElement(Report, render(pre))));
  assert.match(t, /· pregame/, "the rule must not cost a correct label");
  assert.match(t, /Simulated \d/, "and a forecast from THIS run keeps its time");
  assert.equal(/after first pitch/i.test(t), false);
});

test("🔴 the producer's flag is authoritative — no instant comparison may overturn it", { skip: !found }, () => {
  /*
   * ⚠ A DEFECT I WROTE. My first cut fell back to `generatedAt < firstPitch` and labelled the three
   * genuine carried-forward pregame forecasts "after first pitch". The flag is the only field that
   * knows; re-deriving it here makes the component a second owner with strictly less information.
   */
  const started = { ...found.started, firstPitch: null };
  assert.equal(simProvenance(started, { generatedAt: found.artifact.generatedAt }), "AFTER_FIRST_PITCH");
  /* A not-started game whose first pitch is long after the run is plain pregame. */
  assert.equal(simProvenance(
    { completeness: { startedBeforeGeneration: false }, firstPitch: "2099-01-01T00:00:00Z" },
    { generatedAt: found.artifact.generatedAt },
  ), "PREGAME");
  /* An artifact written before the flag existed says nothing, and so does the label. */
  assert.equal(simProvenance({ completeness: {}, firstPitch: "2099-01-01T00:00:00Z" },
    { generatedAt: found.artifact.generatedAt }), "UNSTATED");
});

test("the label is read from the ARTIFACT, never from the reader's clock", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/game/mlb-full-game-report.tsx"), "utf8");
  const fn = src.slice(src.indexOf("export function simProvenance"), src.indexOf("function Methodology"));
  assert.equal(/Date\.now\(\)|new Date\(\)/.test(fn), false,
    "whether a file was written pregame is a fact about when it was written, not when it is read");
});
