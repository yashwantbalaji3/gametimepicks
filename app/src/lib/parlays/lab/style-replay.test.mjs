import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTierReplay, seriesTotals, replayBankroll, impliedChance, pickForYou, RISK_ORDER } from "./style-replay.mjs";

const DATA = path.join(process.cwd(), "public", "data", "parlays");
const settled = fs.readdirSync(path.join(DATA, "lab-settled")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATA, "lab-settled", f), "utf8")));

test("the replay is the published record: every MLB tier together reproduces the lab ledger exactly", () => {
  const replay = buildTierReplay(settled, { sport: "mlb" });
  const all = RISK_ORDER.flatMap((t) => replay.tiers[t]);
  const t = seriesTotals(all);
  const ledger = JSON.parse(fs.readFileSync(path.join(DATA, "lab-ledger.json"), "utf8")).streams.find((s) => s.id === "mlb").record;
  assert.equal(t.wins, ledger.wins, "wins");
  assert.equal(t.losses, ledger.losses, "losses");
  assert.equal(t.staked, ledger.staked, "cards staked");
  assert.ok(Math.abs(t.returned - ledger.returned) < 0.02, `returned ${t.returned} vs ledger ${ledger.returned}`);
});

test("a flat unit, replayed: wins pay the card's own price, losses cost one unit, pushes return it", () => {
  const series = [
    { date: "2026-08-17", result: "loss", decimal: 2.5 },
    { date: "2026-08-17", result: "loss", decimal: 3 },
    { date: "2026-08-18", result: "win", decimal: 2.5 },
    { date: "2026-08-19", result: "push", decimal: 2 },
    { date: "2026-08-20", result: "loss", decimal: 4 },
  ];
  const r = replayBankroll(series, { bankroll: 100, unit: 10 });
  assert.deepEqual(r.points.map((p) => p.balance), [100, 80, 95, 95, 85], "one point per day, same-day cards netted");
  assert.equal(r.end, 85); assert.equal(r.net, -15); assert.equal(r.lowest, 80);
  assert.equal(r.worstRun, 2, "a push neither breaks nor extends a losing run");
  assert.equal(replayBankroll(series, { bankroll: null, unit: 10 }), null, "no bankroll, no replay");
});

test("the card for a reader: stated level first, nearest stand-in when empty, neighbours beside it", () => {
  const cards = [{ tier: "medium" }, { tier: "high" }, { tier: "longshot" }];
  const low = pickForYou(cards, "low");
  assert.equal(low.main.tier, "medium"); assert.equal(low.substitute, true, "a stand-in says it is one");
  assert.equal(low.safer, null); assert.equal(low.bolder.tier, "high");
  const high = pickForYou(cards, "high");
  assert.equal(high.main.tier, "high"); assert.equal(high.substitute, false);
  assert.equal(high.safer.tier, "medium"); assert.equal(high.bolder.tier, "longshot");
  assert.equal(pickForYou(cards, null), null, "no stated level, no pick");
  assert.equal(pickForYou([], "high"), null);
});

test("the chance a price implies is 1 / decimal", () => {
  assert.ok(Math.abs(impliedChance(2.536) - 0.3943) < 1e-4);
  assert.equal(impliedChance(1), null);
});

test("nothing here projects, sizes by edge, or progresses", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/parlays/lab/style-replay.mjs"), "utf8");
  for (const banned of [/kelly/i, /martingale/i, /Math\.random/, /simulat(e|ion)\(/i, /forecast\(/i]) assert.doesNotMatch(src, banned);
});
