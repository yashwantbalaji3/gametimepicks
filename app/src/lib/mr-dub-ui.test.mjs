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

test("settled: Lane A advanced (Step 1 WON), Lane B stopped+hidden, Mr. Dub carries full truth", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-19T03:48:00Z");
  const bb = v.bankBuilderPreview;
  // Lane A cleared Step 1 (Mexico DNB + Soto) and advanced; public.
  assert.equal(bb.laneA.laneStatus, "advanced");
  assert.equal(bb.laneA.publicVisible, true);
  const a1 = bb.laneA.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won");
  assert.ok(a1.legs.some((l) => l.sport === "WORLD_CUP") && a1.legs.some((l) => l.sport === "MLB"), "one World Cup + one MLB");
  assert.ok(a1.legs.every((l) => l.settlementResult === "won"), "both Lane A legs won (official)");
  // Lane B stopped (Goldschmidt HRR 1 lost) → hidden publicly, queued restart.
  assert.equal(bb.laneB.laneStatus, "stopped");
  assert.equal(bb.laneB.publicVisible, false);
  assert.ok(bb.laneB.restart && bb.laneB.restart.status === "queued", "Lane B fresh $100 restart queued");
  const b2 = bb.laneB.steps.find((s) => s.step === 2);
  assert.equal(b2.result, "lost");
  // Mr. Dub: Lane A advance logged + Lane B stop logged; no bankroll double-count.
  const led = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
  assert.ok(led.events.some((e) => e.type === "lane_advanced" && e.laneId === "lane-a" && e.paperProfit === 0), "Lane A advance ($0) logged");
  const bStop = led.events.find((e) => e.type === "lane_stopped" && e.laneId === "lane-b");
  assert.ok(bStop && bStop.paperProfit === -100, "Lane B stop realizes -$100");
});
