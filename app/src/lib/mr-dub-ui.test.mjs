import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const r = (p) => fs.readFileSync(p, "utf8");

// P196: the spine is grouped by the QUESTION a reader is asking — Now · Sports · Products · Track
// record — instead of a hand-picked lead order maintained separately on three surfaces. What these
// guards exist to protect is that the SIMULATION product leads and the paper-bankroll products
// never do. That still holds, and is asserted against the canonical list below.
test("Mr. Dub is a first-class rail/footer destination (P201 took products off the mobile bar)", () => {
  /*
   * The old third assertion required /mr-dub on the `mobile` surface — which has not been true
   * since P201 removed products from the bar. It passed VACUOUSLY: the forward-scanning regex
   * matched ANY later entry carrying "mobile", and died only when P208 moved the last such entry.
   * The real contract: Mr. Dub stays a first-class destination on the rail and footer, reachable
   * from the mobile Menu sheet (which derives from the rail), with its bucket mapped for any
   * surface that keys on it.
   */
  const nav = r("src/lib/navigation.ts");
  const decl = nav.slice(nav.indexOf('href: "/mr-dub"'));
  const body = decl.slice(0, decl.indexOf("},"));
  assert.match(body, /label: "Mr\. Dub's Portfolio"/, "keeps the founder-renamed label");
  assert.match(body, /surfaces: \["rail", "footer"\]/, "rail + footer (the Menu sheet derives from the rail)");
  const navRoute = r("src/lib/nav-active-route.ts");
  assert.ok(navRoute.includes('"/mr-dub"') && navRoute.includes('"mrdub"'), "bucket mapping preserved");
});

test("Bank Builder public copy is natural — no awkward lifecycle terms on the marketing surface", () => {
  const panel = r("src/components/parlays/bank-builder-preview-panel.tsx");
  assert.ok(!/fresh restart/i.test(panel), 'no "fresh restart" copy');
  // The public panel must not surface failure language in rendered copy.
  for (const banned of [/\bfailed\b/i, /\bcollapsed\b/i]) assert.ok(!banned.test(panel), `no banned lifecycle word ${banned}`);
  // Money readability: the lane steps use the MoneyPath component.
  assert.match(panel, /MoneyPath/, "lanes use the readable MoneyPath component");
});

test("Mr. Dub character graphic exists + is accessible", () => {
  const a = r("src/components/mr-dub/mr-dub-avatar.tsx");
  assert.match(a, /role="img"/, "avatar is an accessible img");
  assert.match(a, /aria-label=\{title\}|<title>/, "avatar has a title/label");
  assert.match(r("src/app/mr-dub/page.tsx"), /MrDubAvatar/, "Mr. Dub page renders the avatar");
});

test("Mr. Dub flagship section order: hero → executive dashboard → today → journey → analytics → timeline → attribution", () => {
  const p = r("src/app/mr-dub/page.tsx");
  const hero = p.indexOf("Paper Portfolio Scientist");
  const dash = p.indexOf("<ExecutiveDashboard");
  const today = p.indexOf("<TodayStatusStrip");
  const journey = p.indexOf("The $100 → $19.5K journey");
  const analytics = p.indexOf("How the bankroll moved");
  const timeline = p.indexOf("Day-by-day timeline");
  const attribution = p.indexOf("Every wager, by product");
  assert.ok([hero, dash, today, journey, analytics, timeline, attribution].every((i) => i >= 0), "every flagship section is present");
  assert.ok(hero < dash && dash < today && today < journey && journey < analytics && analytics < timeline && timeline < attribution, "sections in the flagship order");
  // The flagship renders the premium derived components (all fed by buildFlagship — no hand-authored money).
  assert.match(p, /buildFlagship/, "page derives everything from the canonical flagship model");
  for (const c of ["<ExecutiveDashboard", "<BankBuilderJourneySection", "<AnalyticsCharts", "<InteractiveTimeline", "<ProductAttribution"]) {
    assert.ok(p.includes(c), `renders ${c}`);
  }
});

test("daily-summary embeds each day's events for the expandable dropdown; totals reconcile", () => {
  const d = JSON.parse(r("public/data/mr-dub/daily-summary.json"));
  const p = JSON.parse(r("public/data/mr-dub/portfolio.json"));
  for (const day of d.days) {
    assert.ok(Array.isArray(day.events), `day ${day.date} embeds events`);
    const sum = Math.round(day.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
    assert.equal(sum, day.pl, `day ${day.date} P/L equals the sum of its events`);
  }
  // Running bankroll reconciles to the portfolio's current bankroll.
  assert.equal(d.days[d.days.length - 1].closing, p.currentBankroll, "daily closing == portfolio current bankroll");
});

test("2nd ladder BANKED: Lane A's completed ladder is archived, the live lanes are a fresh cycle-2, Mr. Dub carries full history", () => {
  // Banking moved Lane A's completed $100→$10k ladder out of the live view-model and into the archived cycle-1
  // artifact. The live view-model is now a fresh cycle-2 (shown publicly, not a completed ladder).
  const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;
  assert.equal(bb.laneA.publicVisible, true);
  assert.notEqual(bb.laneA.laneStatus, "completed", "live Lane A is a fresh cycle, not a banked completed ladder");
  // The banked Lane A ladder history is preserved in the archived cycle-1 artifact (5 settled WON rungs).
  const run = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8")).run;
  assert.equal(run.laneA.laneStatus, "completed", "banked Lane A completed the ladder");
  const a1 = run.laneA.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won");
  assert.ok(a1.legs.some((l) => l.sport === "WORLD_CUP") && a1.legs.some((l) => l.sport === "MLB"), "one World Cup + one MLB");
  assert.ok(a1.legs.every((l) => l.settlement?.result === "won"), "both Lane A legs won (official)");
  assert.equal(run.laneA.steps.find((s) => s.step === 2).status, "settled", "Lane A Step 2 settled won");
  const a5 = run.laneA.steps.find((s) => s.step === 5);
  assert.equal(a5.status, "settled", "Lane A Step 5 settled WON");
  assert.equal(a5.result, "won", "Lane A Step 5 settled WON → ladder completed ($10089.23, official)");
  // Banked Lane B: Steps 1 + 2 WON, then Step 3 settled LOST → the lane stopped, preserved with its honest history.
  assert.equal(run.laneB.laneStatus, "stopped");
  const b1 = run.laneB.steps.find((s) => s.step === 1);
  assert.equal(b1.status, "settled", "Lane B Step 1 card settled");
  assert.equal(b1.result, "won", "Lane B Step 1 cleared WON");
  const b3 = run.laneB.steps.find((s) => s.step === 3);
  assert.equal(b3.status, "settled", "Lane B Step 3 settled LOST");
  assert.equal(b3.result, "lost", "Lane B Step 3 settled LOST → lane stopped");
  // Mr. Dub ledger carries the FULL history: crown ladder five step wins + the banked 2nd ladder + dual-lane losses (no double-count).
  const led = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
  assert.ok(led.events.filter((e) => e.type === "ladder_step_won" && e.laneId === "crown-ladder").length >= 5, "crown ladder five step wins logged");
  const ladder2 = led.events.filter((e) => e.type === "ladder_step_won" && e.laneId === "lane-a");
  assert.ok(ladder2.length >= 5, "2nd ladder logged as its day-by-day step wins (complete journey)");
  assert.equal(Math.round(ladder2.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100, 10089.23, "Lane A ladder steps sum to the banked final $10,089.23");
  const losses = led.events.find((e) => e.type === "dual_lane_losses");
  assert.ok(losses && losses.paperProfit === -300, "dual-lane losses realize -$300 once (retained in history, no double-count)");
});
