/**
 * PINNED NBA CARD KEYS (release owner 2026-10-24: the engine refactor must leave the live NBA tiers byte-identical).
 * The exact data-level-a-card keys the NBA game-winner rule produced on committed slates, pinned at the build instants
 * the recorder saw (10-24) and at four 10-25 instants. Computed from the committed lanes and receipts with the display
 * forced on through its context (never a literal accessor override), so the pins hold whatever the switches say.
 * Published lanes are never rewritten, so these inputs cannot move. Any change to the engine, the rule, the rounding or
 * the key format that alters a live card fails here.
 * Run: npx tsx --test src/lib/products/level-a/nba-pinned-keys.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLevelAModel } from "./model.mjs";
import { nbaGameWinnerCardKey } from "./nba-game-winner-tiers.mjs";
import { nbaGameWinnerDisplay } from "./nba-game-winner-source.mjs";

const REPO = path.resolve(process.cwd(), "..");
const PINNED = {
  "2026-10-24": {
    "2026-10-24T14:57:57.033Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909854|401909858|63.2%",
      "nba-game-winner-tiers@1/parlay-lab|medium|401909854|401909855|401909859|49.8%",
      "nba-game-winner-tiers@1/parlay-lab|high|401909853|401909856|401909860|24.8%",
      "nba-game-winner-tiers@1/parlay-lab|longshot|401909853|401909855|401909856|401909858|401909860|13.4%",
      "nba-game-winner-tiers@1/bank-builder|low|401909854|401909858|63.2%",
      "nba-game-winner-tiers@1/moonshot|longshot|401909853|401909855|401909856|401909858|401909860|13.4%"
    ],
    "2026-10-24T22:26:28.397Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909854|401909858|63.2%",
      "nba-game-winner-tiers@1/parlay-lab|medium|401909854|401909855|401909859|49.8%",
      "nba-game-winner-tiers@1/parlay-lab|high|401909855|401909856|401909858|401909859|24.7%",
      "nba-game-winner-tiers@1/bank-builder|low|401909854|401909858|63.2%"
    ],
    "2026-10-25T00:04:17.396Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909859|401909860|52.9%",
      "nba-game-winner-tiers@1/bank-builder|low|401909859|401909860|52.9%"
    ]
  },
  "2026-10-25": {
    "2026-10-25T15:30:00Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/parlay-lab|medium|401909863|401909867|49.1%",
      "nba-game-winner-tiers@1/parlay-lab|high|401909863|401909866|401909867|24.8%",
      "nba-game-winner-tiers@1/parlay-lab|longshot|401909862|401909863|401909864|401909865|401909867|14.26%",
      "nba-game-winner-tiers@1/bank-builder|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/moonshot|longshot|401909862|401909863|401909864|401909865|401909867|14.26%"
    ],
    "2026-10-25T16:00:00Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/parlay-lab|medium|401909863|401909867|49.1%",
      "nba-game-winner-tiers@1/parlay-lab|high|401909863|401909866|401909867|24.8%",
      "nba-game-winner-tiers@1/parlay-lab|longshot|401909862|401909863|401909864|401909865|401909867|14.26%",
      "nba-game-winner-tiers@1/bank-builder|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/moonshot|longshot|401909862|401909863|401909864|401909865|401909867|14.26%"
    ],
    "2026-10-25T21:31:00Z": [
      "nba-game-winner-tiers@1/parlay-lab|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/parlay-lab|medium|401909863|401909867|49.1%",
      "nba-game-winner-tiers@1/parlay-lab|high|401909863|401909866|401909867|24.8%",
      "nba-game-winner-tiers@1/parlay-lab|longshot|401909863|401909864|401909865|401909866|401909867|13.2%",
      "nba-game-winner-tiers@1/bank-builder|low|401909863|401909865|61.1%",
      "nba-game-winner-tiers@1/moonshot|longshot|401909863|401909864|401909865|401909866|401909867|13.2%"
    ],
    "2026-10-25T22:31:00Z": [
      "nba-game-winner-tiers@1/parlay-lab|medium|401909866|401909867|32.4%",
      "nba-game-winner-tiers@1/bank-builder|medium|401909866|401909867|32.4%"
    ]
  }
};
const keysAt = (day, now) => {
  const display = nbaGameWinnerDisplay({ repoRoot: REPO, date: day, ctx: { enabled: true, graded: 0, minN: 0, disclosure: "pinned" } });
  const b = buildLevelAModel({ repoRoot: REPO, now, productDay: day, nbaGameWinners: { enabled: true, display } }).nbaGameWinners;
  return [...b.tiers.map((t) => t.card), b.bankBuilder.card, b.moonshot.card].filter(Boolean).map(nbaGameWinnerCardKey);
};

for (const [day, byNow] of Object.entries(PINNED)) {
  test(`pinned NBA card keys for ${day} at ${Object.keys(byNow).length} build instants`, () => {
    for (const [now, keys] of Object.entries(byNow)) assert.deepEqual(keysAt(day, now), keys, `${day} @ ${now}`);
  });
}

test("every recorded 10-24 NBA entry is among the cards the engine produces at its own build instant", () => {
  const rows = fs.readFileSync(path.join(REPO, "data/internal/products/level-a/suggestions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    .filter((r) => r.productDay === "2026-10-24" && r.policy.startsWith("nba-game-winner-tiers@1"));
  assert.ok(rows.length >= 9, "the nine recorded 10-24 entries");
  for (const r of rows) {
    const computed = keysAt("2026-10-24", r.shownAt).map((k) => k.split("|").slice(0, -1).join("|"));
    assert.ok(computed.includes(`${r.policy}|${r.tier}|${r.legs.map((l) => String(l.eventId)).sort().join("|")}`), `${r.id} @ ${r.shownAt}`);
  }
});
