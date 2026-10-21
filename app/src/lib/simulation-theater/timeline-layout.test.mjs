/**
 * Simulation Theater V2 · drive-timeline layout (iteration 3): every segment ≥24 px (WCAG 2.5.8) AND ∝ playback time,
 * for every representative run of every fixture, at every track width from a 320 px phone to a desktop stage.
 * The browser check (e2e/simulation-theater.spec.ts) measures the real hit targets with elementFromPoint.
 *
 * Run: npx tsx --test src/lib/simulation-theater/timeline-layout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { TL_GAP, TL_LABEL_GAP, TL_LABEL_W, TL_MIN_TARGET, TL_PERIOD_GAP, timelineLayout } from "./timeline-layout.mjs";
import { FIXTURE_EVENT_IDS, loadTheater } from "./loader.mjs";
import { compiledFor } from "./state-at.mjs";

const REPO = path.resolve(process.cwd(), "..");

function runs() {
  const out = [];
  for (const id of FIXTURE_EVENT_IDS) {
    const t = loadTheater(REPO, id);
    for (const s of t.manifest.samples) {
      if (!s.validation.ok) continue;
      const c = compiledFor(s, { reducedMotion: false });
      const groups = [];
      for (const ev of s.events) {
        const d = c.driveSpans[ev.index].t1 - c.driveSpans[ev.index].t0;
        const last = groups[groups.length - 1];
        if (last && last.period === ev.period) last.durs.push(d); else groups.push({ period: ev.period, durs: [d] });
      }
      out.push({ id, run: s.runIndex, groups });
    }
  }
  return out;
}

/** Lines a period's segments occupy when wrapped greedily into `avail` px (flex-wrap with TL_GAP). */
function lines(widths, avail) {
  const ls = [[]];
  let used = 0;
  for (const w of widths) {
    const add = (ls[ls.length - 1].length ? TL_GAP : 0) + w;
    if (ls[ls.length - 1].length && used + add > avail + 0.001) { ls.push([w]); used = w; } else { ls[ls.length - 1].push(w); used += add; }
  }
  return ls;
}

// track widths seen in the browser (320 → 274, 390 → 342, 1440 → 834 with the side panel), plus a sweep
const WIDTHS = [274, 278, 342, 834, ...Array.from({ length: 140 }, (_, i) => 240 + i * 7)];

test("every segment ≥24 px and ∝ playback time; nothing overflows its line; one row whenever one row can keep both", () => {
  const all = runs();
  assert.ok(all.length >= 12, `${all.length} runs`);
  let rowsCount = 0;
  const at = {};
  for (const { id, run, groups } of all) {
    const durs = groups.flatMap((g) => g.durs);
    for (const W of WIDTHS) {
      const L = timelineLayout(groups, W);
      assert.equal(L.widths.length, durs.length);
      const tag = `${id} run ${run} @${W}px (${L.mode})`;
      for (const w of L.widths) assert.ok(w >= TL_MIN_TARGET, `${tag}: segment ${w} px < 24`);
      // ∝ playback time: one scale for the whole run (to the 0.01 px floor)
      for (let i = 0; i < durs.length; i++) assert.ok(Math.abs(L.widths[i] - durs[i] * L.scale) <= 0.011, `${tag}: drive ${i} not ∝ time`);
      if (L.mode === "row") {
        const total = L.widths.reduce((a, w) => a + w, 0) + groups.reduce((a, g) => a + (g.durs.length - 1) * TL_GAP, 0) + (groups.length - 1) * TL_PERIOD_GAP;
        assert.ok(total <= W + 0.001, `${tag}: row ${total} > ${W}`);
      } else {
        rowsCount++;
        assert.equal(L.rowWidth, W - TL_LABEL_W - TL_LABEL_GAP);
        let k = 0;
        for (const g of groups) {
          const ws = L.widths.slice(k, k + g.durs.length);
          k += g.durs.length;
          for (const line of lines(ws, L.rowWidth)) {
            const used = line.reduce((a, w) => a + w, 0) + (line.length - 1) * TL_GAP;
            assert.ok(used <= L.rowWidth + 0.001, `${tag}: line ${used} > ${L.rowWidth}`);
          }
        }
        // the single-row layout really could not keep both promises
        const sRow = (W - groups.reduce((a, g) => a + (g.durs.length - 1) * TL_GAP, 0) - (groups.length - 1) * TL_PERIOD_GAP) / durs.reduce((a, d) => a + d, 0);
        assert.ok(sRow * Math.min(...durs) < TL_MIN_TARGET + 0.01, `${tag}: rows chosen although one row fits`);
      }
      if (id === "401873008" && run === 428 && [274, 342, 834].includes(W)) at[W] = `${L.mode}, min ${Math.min(...L.widths).toFixed(1)} px`;
    }
  }
  console.log(`# timeline: run 428 → 320 px ${at[274]} · 390 px ${at[342]} · 1440 px ${at[834]}; rows layouts ${rowsCount} of ${all.length * WIDTHS.length}`);
});

test("degenerate inputs are safe", () => {
  assert.deepEqual(timelineLayout([], 300).widths, []);
  assert.deepEqual(timelineLayout([{ period: 1, durs: [1000, 2000] }], 0).widths, [0, 0]);
});
