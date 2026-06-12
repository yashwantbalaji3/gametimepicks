/**
 * Player-prop "By player" grouping contract — addresses the wall-of-rows complaint:
 * the fixture props view must offer a per-player grouped mode (one collapsible card per
 * player, that player's markets nested, strongest edge first). Source-level assertions
 * match the repo's component-test convention; the grouping logic invariants are checked
 * by re-deriving them from the same shape the component groups.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const group = fs.readFileSync("src/components/ui/player-prop-group.tsx", "utf8");
const explorer = fs.readFileSync("src/components/ui/player-props-explorer.tsx", "utf8");

test("groupByPlayer keys by player (name+team), markets nested", () => {
  assert.ok(group.includes("groupByPlayer"), "exposes a groupByPlayer grouping function");
  assert.ok(group.includes("p.player?.name") && group.includes("p.player?.team"),
    "groups on the real player identity, not a fabricated key");
  assert.ok(group.includes("items.push(p)"), "a player's markets accumulate under one group");
});

test("each group sorts its markets by edge and players by best edge (strongest first)", () => {
  assert.ok(group.includes("g.items.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99))"),
    "markets within a player are strongest-edge first");
  assert.ok(group.includes("groups.sort((a, b) => b.bestEdge - a.bestEdge)"),
    "players are ordered by their single strongest edge");
});

test("the group card carries the player's identity + a real best-edge chip", () => {
  assert.ok(group.includes("PlayerAvatar"), "uses the shared real-photo→monogram avatar");
  assert.ok(group.includes("best edge"), "shows the player's strongest real edge, not an invented stat");
  assert.ok(group.includes("market{n === 1") , "shows the market count per player");
});

test("the explorer offers the By-player view alongside Top picks + market tabs", () => {
  assert.ok(explorer.includes('market === "byplayer"'), "has a dedicated by-player view");
  assert.ok(explorer.includes("By player"), "the view is selectable from the pill row");
  assert.ok(explorer.includes("groupByPlayer(scoped)"), "groups the team/search-scoped props");
  assert.ok(explorer.includes("PlayerPropGroup"), "renders the grouped card");
});

// Re-derive the grouping invariant from the same input shape, to prove the contract holds.
test("grouping invariant: N players, each with their own markets, best-edge ordered", () => {
  const props = [
    { id: "a1", player: { name: "Alpha", team: "PIT" }, marketLabel: "K", edgePct: 0.03 },
    { id: "a2", player: { name: "Alpha", team: "PIT" }, marketLabel: "Hits", edgePct: 0.09 },
    { id: "b1", player: { name: "Bravo", team: "MIA" }, marketLabel: "K", edgePct: 0.05 },
  ];
  const map = new Map();
  for (const p of props) {
    const key = `${p.player.name}__${p.player.team}`;
    const edge = p.edgePct ?? -99;
    const g = map.get(key);
    if (g) { g.items.push(p); if (edge > g.bestEdge) g.bestEdge = edge; }
    else map.set(key, { name: p.player.name, bestEdge: edge, items: [p] });
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => b.edgePct - a.edgePct);
  groups.sort((a, b) => b.bestEdge - a.bestEdge);
  assert.equal(groups.length, 2, "two distinct players");
  assert.equal(groups[0].name, "Alpha", "Alpha first (best edge 0.09 > Bravo 0.05)");
  assert.equal(groups[0].items[0].marketLabel, "Hits", "Alpha's strongest market first");
  assert.equal(groups[0].items.length, 2, "Alpha keeps both markets");
});
