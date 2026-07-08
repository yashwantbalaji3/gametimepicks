/**
 * PHASE 2 — WC Specials fixture/player join repair. `_settlement-collect.parseSpecialLeg` previously did
 * `matchId: Number(l.eventId)`, and eventId is a HASH string for World Cup fixtures → NaN → every official
 * join failed and all 3 July-7 cards stranded pending. Now it binds by the finite numeric id else the hash /
 * fixture name (the official bundle keys each match under BOTH). Player names match accent-insensitively via
 * the settlement `norm`. DISPLAY-ONLY — canonical money is never touched; unmatched players stay pending.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { collectForDate, parseSpecialLeg } from "../../../scripts/_settlement-collect.mjs";
import { settleCard, findPlayerLine } from "./soccer-markets.ts";

const DATA = path.join(process.cwd(), "public", "data");
const MONEY_MD5 = "affe6b21071f2b3be96bb2774eb347c3";
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const official = JSON.parse(fs.readFileSync(path.join(DATA, "world-cup", "settlement", "2026-07-07.official-input.json"), "utf8"));
const specialsCards = () => collectForDate(DATA, "2026-07-07").filter((c) => c.product === "wc-specials");

test("no leg resolves to matchId NaN — hash eventIds bind to the official fixture", () => {
  for (const c of specialsCards()) for (const leg of c.legs) {
    assert.ok(!(typeof leg.matchId === "number" && Number.isNaN(leg.matchId)), `matchId must not be NaN: ${leg.id}`);
    assert.ok(leg.matchId != null && String(leg.matchId).trim() !== "", `matchId present: ${leg.id}`);
  }
});

test("parseSpecialLeg binds a HASH eventId as the hash string (not NaN), a numeric eventId as a number", () => {
  const hash = parseSpecialLeg({ legId: "x", kind: "team", market: "btts", participant: "BTTS No", fixture: "Argentina vs Egypt", eventId: "190922affd0be754bfefd71548dbf90d", odds: -200 });
  assert.equal(hash.matchId, "190922affd0be754bfefd71548dbf90d", "hash eventId → hash string");
  const numeric = parseSpecialLeg({ legId: "y", kind: "team", market: "btts", participant: "BTTS No", fixture: "A vs B", eventId: "1576804", odds: -200 });
  assert.equal(numeric.matchId, 1576804, "numeric eventId → number");
  const none = parseSpecialLeg({ legId: "z", kind: "team", market: "btts", participant: "BTTS No", fixture: "A vs B", eventId: null, odds: -200 });
  assert.equal(none.matchId, "A vs B", "no eventId → fixture name fallback");
});

test("fixture join resolves Argentina–Egypt AND Switzerland–Colombia (team legs grade, not pending-on-missing-match)", () => {
  const cards = specialsCards();
  const graded = cards.flatMap((c) => settleCard(c.legs, c.stake, official).legs);
  const teamLegs = graded.filter((g) => ["btts", "match_total_goals", "double_chance"].includes(g.leg.market));
  assert.ok(teamLegs.length > 0, "there are team legs");
  for (const g of teamLegs) assert.ok(!/no official match/i.test(g.reason ?? ""), `team leg joined its fixture: ${g.reason}`);
});

test("player names match accent-insensitively (Lautaro Martinez ↔ Martínez) within the correct match", () => {
  // Argentina–Egypt hash. The card writes un-accented names; the official box score is accented.
  const AE = "190922affd0be754bfefd71548dbf90d";
  assert.ok(findPlayerLine(official, "Lautaro Martinez", AE), "Lautaro Martinez matches Martínez");
  assert.ok(findPlayerLine(official, "Lionel Messi", AE), "Messi matches");
  assert.ok(findPlayerLine(official, "Enzo Fernandez", AE), "Enzo Fernandez matches Fernández");
});

test("an UNMATCHED player leg stays PENDING (never forced to a loss) → its card stays pending", () => {
  const cards = specialsCards();
  // Johan Manzambi is not in the official box score → pending; Chaos Builder therefore stays pending.
  const chaos = cards.find((c) => /Chaos/i.test(c.label));
  assert.ok(chaos, "Chaos Builder present");
  const g = settleCard(chaos.legs, chaos.stake, official);
  const manzambi = g.legs.find((x) => /Manzambi/i.test(x.leg.player ?? ""));
  assert.ok(manzambi && manzambi.result === "pending", "unmatched player is pending, not lost");
  assert.equal(g.result, "pending", "a card with any pending leg stays pending (pending is not a loss)");
});

test("a FULLY-gradable card settles honestly (Defensive Games → lost via real official legs, no pending)", () => {
  const def = specialsCards().find((c) => /Defensive/i.test(c.label));
  assert.ok(def, "Defensive Games present");
  const g = settleCard(def.legs, def.stake, official);
  assert.ok(g.legs.every((x) => x.result !== "pending"), "no pending legs — fully gradable");
  assert.equal(g.result, "lost", "definitively lost (BTTS No lost as Argentina 3-2, Lautaro 0 SOT lost)");
});

test("the join repair touches NO canonical money and does NOT regrade Bank Builder differently", () => {
  assert.equal(md5(path.join(DATA, "mr-dub", "portfolio.json")), MONEY_MD5, "portfolio.json md5 unchanged");
  // Bank Builder Lane A grades WON from the same bundle — the join fix is specials-only, no BB regression.
  const bb = collectForDate(DATA, "2026-07-07").filter((c) => c.product === "bank-builder");
  for (const c of bb) {
    const g = settleCard(c.legs, c.stake, official);
    assert.equal(g.result, "won", "Bank Builder Lane A still grades WON");
  }
});
