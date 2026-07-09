/**
 * ANSWER-FIRST GAME REPORT (2026-07-09) — heavy content collapsed, answer-first read stays visible,
 * gate intact.
 *
 * The MLB simulation runner's done-phase used to render a 10-section dashboard with the full pick table,
 * distributions, model-vs-market diagnostics, unavailable modules, and the copy recap all expanded in
 * the main path. These are now inside closed-by-default ExpandableReportSection disclosures, while the
 * fast read (header, priced snapshot, central read, main takeaways, top-6 leans) stays visible. This
 * pins that structure, that the disclosures are closed + mobile-safe, that it stays behind the Generate
 * gate, and that money is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const runner = read("src/components/game/game-simulation-runner.tsx");
const comp = read("src/components/game/answer-first-report.tsx");

test("1 · the heavy sections are wrapped in collapsed ExpandableReportSection disclosures", () => {
  const pairs = [
    ["Full pick table", "<PropTable"],
    ["Outcome distributions", "<DistributionCard"],
    ["Model vs market agreement", "<MarketAgreement"],
    ["Unavailable modules", "<UnavailableModules"],
    ["Copy recap", "<RecapBlock"],
  ];
  for (const [title, inner] of pairs) {
    const re = new RegExp(`<ExpandableReportSection title="${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"[\\s\\S]{0,400}?${inner.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`);
    assert.match(runner, re, `${inner} is inside the "${title}" disclosure`);
  }
});

test("2 · the answer-first sections stay ABOVE the collapsed 'Deeper analysis' block (still visible)", () => {
  const divider = runner.indexOf("Deeper analysis");
  assert.ok(divider > 0, "the Deeper analysis divider exists");
  for (const marker of ["<PricedPropSnapshot", "<CentralRead", "<MainTakeaways", "Biggest leans"]) {
    const at = runner.indexOf(marker);
    assert.ok(at > 0 && at < divider, `${marker} renders before the collapsed section`);
  }
});

test("3 · disclosures are closed by default and mobile-safe (native <details>, no forced open)", () => {
  assert.match(comp, /defaultOpen = false/, "closed by default");
  assert.match(comp, /\{\.\.\.\(defaultOpen \? \{ open: true \} : \{\}\)\}/, "open only when explicitly asked");
  assert.match(comp, /overflow-x-auto/, "wide content scrolls inside the disclosure body (no page overflow)");
  assert.match(comp, /minHeight: 44/, "summary is a comfortable tap target");
  assert.doesNotMatch(comp, /<details[^>]*\sopen[>\s]/, "the <details> is not hard-coded open");
});

test("4 · the collapse stays behind the Generate gate (rendered only in the done phase)", () => {
  const done = runner.indexOf('phase === "done"');
  const divider = runner.indexOf("Deeper analysis");
  assert.ok(done > 0 && done < divider, "the Deeper analysis block is inside the done-phase branch");
  // The gated dashboard (postReveal) is still injected after the reveal, not as a pre-click sibling.
  assert.match(runner, /\{postReveal \?/);
});

test("5 · no empty disclosures — each heavy section renders only when it has content", () => {
  assert.match(runner, /view\.generatedPicks\.length > 0 \?[\s\S]{0,300}?title="Full pick table"/);
  assert.match(runner, /view\.unavailableModules\.length > 0 \?[\s\S]{0,300}?title="Unavailable modules"/);
});

test("6 · no banned copy in the answer-first surfaces", () => {
  for (const src of [comp]) assert.doesNotMatch(stripSafeArea(src), BANNED);
});

test("7 · money md5 unchanged — a pure UX change", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
