/**
 * THE MANIFEST CARRIES, IT DOES NOT COMPUTE — Program 234 · Release B.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/manifest.test.mjs
 *
 * The charter's acceptance for the player is "source and display values agree exactly". The cheap
 * way to test that is to recompute the same quantity in the test and compare — which proves only
 * that two copies of the same arithmetic agree, and passes happily when both are wrong. So these
 * assertions are about IDENTITY: the number in the chapter is the number in the artifact, reached by
 * a different path.
 *
 * Runs against the repository's real committed board rather than a fixture, because the failure this
 * guards against is a field being renamed upstream — which a fixture would never notice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAllGameDetails } from "../../game-detail.ts";
import { buildMlbPresentation } from "./mlb.ts";
import { isPresentable } from "./types.ts";

const mlb = () => buildAllGameDetails().filter((d) => d.sport === "mlb");

test("every MLB game with a full-game simulation yields a presentation or a stated reason", () => {
  const games = mlb();
  if (!games.length) return;
  for (const d of games) {
    const r = buildMlbPresentation(d);
    if (isPresentable(r)) {
      assert.ok(r.chapters.length >= 3, `${d.slug} produced only ${r.chapters.length} chapters`);
      assert.equal(r.reportHref, `/games/mlb/${d.slug}`, "the full report must always be reachable");
    } else {
      assert.ok(r.reason && r.reason.length > 20, `${d.slug} refused without a usable reason`);
      assert.ok(r.reportHref, "even a refusal routes to the report");
    }
  }
});

test("WIN PROBABILITY IS CARRIED, NOT RECOMPUTED", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    const outcome = r.chapters.find((c) => c.kind === "outcome");
    if (!outcome) continue;
    const home = outcome.stats.find((s) => s.label.endsWith(" win") && s.label.startsWith(d.prediction.homeTeam));
    const away = outcome.stats.find((s) => s.label.endsWith(" win") && s.label.startsWith(d.prediction.awayTeam));
    assert.equal(home?.value, d.fullGameSim.winProbability.home, `${d.slug} home win probability drifted from the artifact`);
    assert.equal(away?.value, d.fullGameSim.winProbability.away, `${d.slug} away win probability drifted from the artifact`);
  }
});

test("THE TOTALS CHAPTER SHOWS THE ARTIFACT'S OWN MEDIAN, MEAN AND TAILS", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    const ch = r.chapters.find((c) => c.kind === "distribution");
    if (!ch) continue;
    const tr = d.fullGameSim.totalRuns;
    assert.equal(ch.stats.find((s) => s.label === "Median total")?.value, tr.median);
    assert.equal(ch.stats.find((s) => s.label === "Mean total")?.value, tr.mean);
    assert.equal(ch.stats.find((s) => s.label === "10th–90th")?.text, `${tr.p10}–${tr.p90} runs`);
    /*
     * THE HISTOGRAM MUST EXIST. The first version of this loop compared bars against the artifact's
     * bins and passed on every game — because the adapter had read an array of objects as an array
     * of numbers, produced no bars at all, and an empty loop asserts nothing. The count is checked
     * before the contents for that reason.
     */
    const bins = tr.distribution ?? [];
    assert.equal(ch.bars.length, bins.length, `${d.slug} drew ${ch.bars.length} bars for ${bins.length} bins — the distribution is not truncated, and it is not empty`);
    ch.bars.forEach((b, i) => {
      assert.equal(b.p, bins[i].probability, `${d.slug} bar ${i} is not the artifact's own bin probability`);
      assert.equal(b.label, String(bins[i].label ?? bins[i].value), `${d.slug} bar ${i} is not labelled as the artifact labels it`);
    });
    assert.ok(ch.bars.some((b) => b.highlight), `${d.slug} draws no median bar`);
  }
});

test("A RUN COUNT APPEARS ONLY WHERE THE ARTIFACT PERMITS THE CLAIM", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    const allowed = Boolean(d.gameLabSimulation?.allowsRunCountClaim);
    if (!allowed) {
      assert.equal(r.provenance.runCount, null, `${d.slug} carries a run count its artifact does not permit`);
      const claims = r.chapters.filter((c) => /simulated games/.test(c.line));
      assert.equal(claims.length, 0, `${d.slug} claims simulated games without permission`);
    } else {
      assert.equal(r.provenance.runCount, d.fullGameSim.runCount, `${d.slug} run count drifted from the artifact`);
    }
  }
});

test("THE PLAYER CHAPTER REPEATS THE DECISION ENGINE'S OWN PICKS", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    const ch = r.chapters.find((c) => c.kind === "players");
    if (!ch) continue;
    const src = d.prediction.topPlayerPredictions.slice(0, 5);
    assert.equal(ch.rows.length, src.length);
    src.forEach((p, i) => {
      assert.equal(ch.rows[i].label, p.player);
      assert.ok(ch.rows[i].detail.includes(p.pick), `${p.player}'s pick must be the engine's own`);
      assert.ok(ch.rows[i].detail.includes(String(p.line)), `${p.player}'s line must be the engine's own`);
    });
  }
});

test("A DEGRADED RUN SAYS SO — the limits chapter never hides the report's own verdict", () => {
  const degraded = mlb().filter((d) => d.fullGameSim?.status === "degraded");
  if (!degraded.length) return;
  for (const d of degraded) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    assert.equal(r.readiness, "degraded");
    const limits = r.chapters.find((c) => c.kind === "limits");
    assert.ok(limits, "a degraded run must still carry a limits chapter");
    assert.ok(
      limits.rows.some((row) => /degraded/i.test(row.detail)),
      `${d.slug} is degraded and the presentation does not say so`,
    );
  }
});

test("EVERY LISTED LIMIT COMES FROM THE ARTIFACT", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    const limits = r.chapters.find((c) => c.kind === "limits");
    if (!limits) continue;
    const notes = d.fullGameSim.completeness?.notes ?? [];
    for (const n of notes) {
      assert.ok(limits.rows.some((row) => row.detail === String(n)) || limits.rows.length >= 5,
        `${d.slug} dropped the artifact's own completeness note without reaching the row cap`);
    }
  }
});

test("supportedChapters describes the chapters that exist, and nothing else", () => {
  for (const d of mlb()) {
    const r = buildMlbPresentation(d);
    if (!isPresentable(r)) continue;
    assert.deepEqual([...r.supportedChapters], r.chapters.map((c) => c.kind));
    assert.equal(new Set(r.chapters.map((c) => c.id)).size, r.chapters.length, "chapter ids must be unique");
  }
});

test("THE PROJECTION IS PURE — two builds of the same report are identical", () => {
  const games = mlb();
  if (!games.length) return;
  for (const d of games.slice(0, 4)) {
    assert.deepEqual(
      buildMlbPresentation(d),
      buildMlbPresentation(d),
      `${d.slug} presented differently on a second build — a replay would change the prediction`,
    );
  }
});

test("ONE REVISION ONLY — mismatched artifact hashes refuse", () => {
  /*
   * PICK A GAME THAT ACTUALLY PRESENTS.
   *
   * This selected the first game carrying both fields, which on 2026-09-06 was MIL @ CIN — the one
   * game of fifteen whose simulation is `unavailable` because first pitch preceded the slate's
   * generation. It refused for THAT reason, the assertion that it refuses passed, and the hash check
   * below was never reached. A guard that passes because of an unrelated refusal is proving nothing.
   *
   * So: a game that presents cleanly, and an assertion that it does, before tampering with it.
   */
  const d = mlb().find((g) => g.fullGameSim && g.prediction && isPresentable(buildMlbPresentation(g)));
  if (!d) return;
  assert.ok(isPresentable(buildMlbPresentation(d)), "the fixture game must present cleanly, or the tamper proves nothing");

  const tampered = {
    ...d,
    prediction: { ...d.prediction, artifactHash: "a-different-revision-entirely" },
  };
  const r = buildMlbPresentation(tampered);
  assert.ok(!isPresentable(r), "a presentation must not narrate two artifact revisions as one game");
  assert.match(r.reason, /revision/i);
});

test("A GAME THAT COULD NOT BE RECONCILED IS REFUSED OUTRIGHT", () => {
  const d = mlb()[0];
  if (!d) return;
  const r = buildMlbPresentation({ ...d, reconciled: { ok: false, reason: "gamePk disagreement" } });
  assert.ok(!isPresentable(r));
  assert.match(r.reason, /disagree/i);
});
