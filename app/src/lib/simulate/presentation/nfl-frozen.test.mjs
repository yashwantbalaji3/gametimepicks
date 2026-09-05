/**
 * THE NFL ADAPTER, PROVEN ON A FROZEN ARTIFACT — Program 234 · Release C.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/nfl-frozen.test.mjs
 *
 * NFL's live slate is legitimately empty — `nflSimulateEligibility()` reports NO_ACTIVE_SLATE, which
 * is a real state and not an outage. An adapter proven only against a live slate would therefore be
 * proven never, and would rot silently until the season opened.
 *
 * So it is proven here against the artifact this repository has actually committed: the settled
 * preseason game in `public/data/nfl/index.json`. The charter's instruction for exactly this case is
 * to demonstrate with a frozen historical artifact labelled with its true event date — which is also
 * the property most worth guarding, because a persuasive frame is the easiest place in the product
 * to accidentally present a played game as an upcoming one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildNflPresentation } from "./nfl.ts";
import { isPresentable } from "./types.ts";

const INDEX = path.join(process.cwd(), "public/data/nfl/index.json");

/** The committed index event, mapped to the eligibility shape the adapter reads. */
function frozenEvent() {
  if (!fs.existsSync(INDEX)) return null;
  const e = (JSON.parse(fs.readFileSync(INDEX, "utf8")).events ?? [])[0];
  if (!e?.winProbability) return null;
  return {
    ...e,
    readiness: "BASELINE_ONLY",
    simulationReady: false,
    readinessReason: "Preseason public-beta model: a reproducible run built from a shared prior, not a measured separation between these two teams.",
    playerCandidates: 0,
    venue: e.venue ?? null,
    reportHref: `/nfl/game/${e.providerEventId}/`,
  };
}

test("a settled NFL game presents its frozen forecast rather than refusing outright", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation(e, { indexGeneratedAt: e.receipt?.generatedAt ?? null });
  assert.ok(isPresentable(m), `refused: ${!isPresentable(m) ? m.reason : ""}`);
  assert.equal(m.readiness, "archived", "a played game is archived, not ready and not merely degraded");
});

test("IT IS LABELLED WITH ITS TRUE EVENT DATE, not today's", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation(e);
  if (!isPresentable(m)) return;
  assert.equal(m.displayDate, e.kickoffUtc.slice(0, 10), "the display date is the event's own");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  if (m.displayDate !== today) {
    assert.notEqual(m.displayDate, today, "a historical event must never be dated today");
  }
});

test("EVERY CHAPTER SPEAKS IN THE PAST TENSE — no played game is framed as upcoming", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation(e);
  if (!isPresentable(m)) return;
  const opening = m.chapters.find((c) => c.kind === "event");
  assert.match(opening.line, /has been played|frozen/i, "the opening chapter must say the game is over");
  const outcome = m.chapters.find((c) => c.kind === "outcome");
  assert.match(outcome.line, /before kickoff/i, "the forecast must be attributed to when it was made");
  const limits = m.chapters.find((c) => c.kind === "limits");
  assert.ok(
    limits.rows.some((r) => /frozen pre-event forecast/i.test(r.detail)),
    "the limits chapter must state that this was not regenerated",
  );
});

test("the frozen numbers are the artifact's numbers", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation(e);
  if (!isPresentable(m)) return;
  const outcome = m.chapters.find((c) => c.kind === "outcome");
  assert.equal(outcome.stats.find((s) => s.label.startsWith(e.home.abbr))?.value, e.winProbability.home);
  assert.equal(outcome.stats.find((s) => s.label.startsWith(e.away.abbr))?.value, e.winProbability.away);
  const dist = m.chapters.find((c) => c.kind === "distribution");
  assert.equal(dist.stats.find((s) => s.label === "Median total")?.value, e.total.median);
});

test("A BASELINE READ IS NEVER PROMOTED BY BEING ANIMATED", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation({ ...e, lifecycle: "UPCOMING", locked: false });
  if (!isPresentable(m)) return;
  assert.equal(m.readiness, "degraded", "BASELINE_ONLY is degraded, never ready");
  const text = JSON.stringify(m);
  assert.match(text, /BASELINE|shared prior/i, "the frame must say which kind of read this is");
  const limits = m.chapters.find((c) => c.kind === "limits");
  assert.ok(limits.rows.some((r) => r.detail === e.readinessReason), "the event's own reason is carried verbatim");
});

test("no player chapter is invented for a sport with no published player market", () => {
  const e = frozenEvent();
  if (!e) return;
  const m = buildNflPresentation(e);
  if (!isPresentable(m)) return;
  assert.ok(!m.supportedChapters.includes("players"), "NFL publishes no player market here — the chapter must be absent, not empty");
  const limits = m.chapters.find((c) => c.kind === "limits");
  assert.ok(limits.rows.some((r) => /player market/i.test(r.detail)), "and its absence must be stated");
});

test("a run count is carried only when the forecast artifact states one", () => {
  const e = frozenEvent();
  if (!e) return;
  assert.equal(buildNflPresentation(e).provenance.runCount, null, "the index states no trial count");
  const withCount = buildNflPresentation(e, { runCount: 20000 });
  assert.equal(withCount.provenance.runCount, 20000, "the forecast artifact's own count is carried when supplied");
  assert.equal(buildNflPresentation(e, { runCount: 0 }).provenance.runCount, null, "zero is not a count");
});
