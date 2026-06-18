import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

test("Mr. Dub page section order: standings → dual bank builder → daily ledger → full ledger → exposure", () => {
  const p = r("src/app/mr-dub/page.tsx");
  const standings = p.indexOf("Current standings");
  const dual = p.indexOf("Mr. Dub's two lanes");
  const dailyIdx = p.indexOf("Bankroll timeline");
  const full = p.indexOf("Every paper event");
  const exposure = p.indexOf("Bankroll intelligence");
  assert.ok(standings < dual && dual < dailyIdx && dailyIdx < full && full < exposure, "sections in the required order");
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
