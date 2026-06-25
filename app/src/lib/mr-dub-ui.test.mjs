import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const r = (p) => fs.readFileSync(p, "utf8");

test("Mr. Dub is a first-class nav item (desktop nav + sidebar + mobile bottom nav)", () => {
  assert.match(r("src/components/nav.tsx"), /href:\s*"\/mr-dub"/, "desktop nav has Mr. Dub");
  assert.match(r("src/components/command-rail.tsx"), /href:\s*"\/mr-dub"/, "sidebar has Mr. Dub");
  const navRoute = r("src/lib/nav-active-route.ts");
  assert.match(navRoute, /href:\s*"\/mr-dub"/, "mobile bottom nav has Mr. Dub");
  assert.ok(navRoute.includes('"/mr-dub"') && navRoute.includes('"mrdub"'), "mobile route maps /mr-dub → mrdub bucket");
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

test("Mr. Dub page section order: hero → dual bank builder → active/awaiting → daily ledger → exposure → full ledger", () => {
  const p = r("src/app/mr-dub/page.tsx");
  const hero = p.indexOf("Paper Portfolio Scientist");
  const dual = p.indexOf("Mr. Dub's two lanes");
  const active = p.indexOf("Active and awaiting cards");
  const dailyIdx = p.indexOf("Bankroll timeline");
  const exposure = p.indexOf("Exposure and bankroll health");
  const full = p.indexOf("Every paper event");
  assert.ok(hero < dual && dual < active && active < dailyIdx && dailyIdx < exposure && exposure < full, "sections in the required order");
  assert.match(p, /<details/, "daily ledger rows are expandable");
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

test("June 24 settled: Lane A COMPLETED the ladder (Step 5 settled WON), Lane B stopped (Step 3 settled LOST), Mr. Dub carries full history", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  // Lane A Steps 1-5 all WON; Step 5 settled WON → the $10K ladder is completed (operator-gated banking).
  assert.equal(bb.laneA.laneStatus, "completed");
  assert.equal(bb.laneA.publicVisible, true);
  const a1 = bb.laneA.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won");
  assert.ok(a1.legs.some((l) => l.sport === "WORLD_CUP") && a1.legs.some((l) => l.sport === "MLB"), "one World Cup + one MLB");
  assert.ok(a1.legs.every((l) => l.settlementResult === "won"), "both Lane A legs won (official)");
  assert.equal(bb.laneA.steps.find((s) => s.step === 2).status, "settled", "Lane A Step 2 settled won");
  const a5 = bb.laneA.steps.find((s) => s.step === 5);
  assert.equal(a5.status, "settled", "Lane A Step 5 settled WON");
  assert.equal(a5.result, "won", "Lane A Step 5 settled WON → ladder completed ($10089.23, official)");
  // Lane B Steps 1 + 2 WON, then Step 3 settled LOST (Brazil ML won; Switzerland/Canada Under 2.5 lost) → the lane stopped, shown publicly with its honest history.
  assert.equal(bb.laneB.laneStatus, "stopped");
  assert.equal(bb.laneB.publicVisible, true);
  const b1 = bb.laneB.steps.find((s) => s.step === 1);
  assert.equal(b1.status, "settled", "Lane B Step 1 card settled");
  assert.equal(b1.result, "won", "Lane B Step 1 cleared WON (Argentina ML + France/Iraq Under 3.5)");
  const b3 = bb.laneB.steps.find((s) => s.step === 3);
  assert.equal(b3.status, "settled", "Lane B Step 3 settled LOST");
  assert.equal(b3.result, "lost", "Lane B Step 3 settled LOST → lane stopped");
  // Mr. Dub ledger still carries the FULL history: Lane A five step wins + completion; Lane B stop (no bankroll double-count).
  const led = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
  assert.ok(led.events.filter((e) => e.type === "lane_step_won" && e.laneId === "lane-a" && e.paperProfit === 0).length >= 5, "Lane A five step wins ($0 realized — rolled) logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-a" && e.step === 5), "Lane A Step 5 WON card logged");
  assert.ok(led.events.some((e) => e.type === "ladder_completed" && e.laneId === "lane-a"), "Lane A ladder completion logged");
  const bStop = led.events.find((e) => e.type === "lane_stopped" && e.laneId === "lane-b" && e.date === "2026-06-24");
  assert.ok(bStop && bStop.paperProfit === -100, "Lane B Step 3 stop realizes -$100 (retained in history)");
});
