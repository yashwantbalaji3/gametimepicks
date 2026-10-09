/**
 * TRUTH-001 — the MLB simulation story labels which engine and which clock each part comes from.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/mlb-story-provenance.test.mjs
 *
 * Pinned on immutable committed history: 2026-10-08 CLE @ CWS (849832). The clock is set to that
 * morning so the active-slate loader builds that day's details exactly as the site did.
 *
 *   1. Chapter 6 ("Player markets") lists the PLAYER-PROP engine's picks (game-simulations artifact,
 *      generated 17:55Z) under a story about the FULL-GAME simulation, with no label, and claimed they
 *      were "separated furthest from the posted line" while ranking by simulated probability.
 *   2. The close printed the slate's generatedAt (03:03Z Oct 9, a later run) as "Generated" for a
 *      forecast carried forward from before the 00:00Z first pitch, and the footer said "produced" at
 *      that time. The report header already used simProvenance; the story now uses the same rule.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

test("2026-10-08 CLE @ CWS: prop-engine chapter labelled; carried forecast gets no post-first-pitch clock", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-08T16:00:00Z") });
  try {
    const { buildAllGameDetails } = await import("../../game-detail.ts");
    const { buildMlbPresentation } = await import("./mlb.ts");
    const { simProvenance } = await import("../../mlb/full-game/sim-provenance.ts");

    const d = buildAllGameDetails().find((g) => g.sport === "mlb" && g.fullGameSim?.gamePk === 849832);
    assert.ok(d, "849832 is on the 2026-10-08 slate");
    assert.equal(simProvenance(d.fullGameSim, d.fullGameSimMeta), "PREGAME_CARRIED", "fixture premise");
    assert.ok(Date.parse(d.fullGameSimMeta.generatedAt) > Date.parse(d.fullGameSim.firstPitch), "slate clock is after first pitch");

    const r = buildMlbPresentation(d);
    assert.ok(!r.unavailable, r.reason);
    const players = r.chapters.find((c) => c.kind === "players");
    assert.ok(players, "the game has prop-engine picks");
    assert.match(players.title, /prop engine/);
    assert.match(players.line, /separate player-prop simulation, not the full-game simulation/);
    assert.doesNotMatch(players.line, /furthest from the posted line/);
    // Ranked by the prop engine's probability, as the line now says.
    const vals = players.rows.map((row) => Number.parseInt(row.value, 10));
    assert.deepEqual(vals, [...vals].sort((a, b) => b - a));

    const closing = r.chapters.find((c) => c.kind === "closing");
    const generated = closing.rows.find((row) => row.label === "Generated");
    assert.equal(generated.detail, "Pregame · carried forward from an earlier run");
    assert.equal(r.provenance.generatedAt, null, "the footer prints no clock that is not this forecast's");
  } finally {
    mock.timers.reset();
  }
});
