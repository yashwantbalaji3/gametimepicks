import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyPlayerRoles,
  ROLE_ELIGIBLE_TIERS,
  roleKeyForRow,
} from "./player-role-quality.ts";
import {
  buildJune20SpecialsPreview,
  loadJune20SpecialsPreview,
  JUNE20_SPECIALS_CONFIG,
} from "./world-cup-specials-preview.ts";
import { legOddsInRange, combinedOddsInRange } from "./world-cup-specials.ts";
import { combinedAmerican } from "../parlays/odds-math.ts";

// After the June 20 pull, before any June 20 kickoff (NED/SWE 17:00Z is the earliest).
const NOW = "2026-06-20T05:00:00Z";
const PP = JSON.parse(fs.readFileSync("public/data/previews/june20/player-projections.json", "utf8"));
const result = buildJune20SpecialsPreview({ nowIso: NOW });
const cfg = JUNE20_SPECIALS_CONFIG;

// ── Player role quality ────────────────────────────────────────────────────────────────────────
test("role gate: goalkeepers and unknown-role (unmatched) players are NOT eligible", () => {
  const roles = classifyPlayerRoles(PP.matches, PP.lineupsPosted === true);
  let gk = 0, unk = 0;
  for (const r of roles.values()) {
    if (r.position === "Goalkeeper") { gk++; assert.equal(r.eligibleForSpecials, false, `${r.playerName} GK excluded`); assert.equal(r.roleTier, "bench_risk"); }
    if (!r.position) { unk++; assert.equal(r.eligibleForSpecials, false, `${r.playerName} unknown excluded`); assert.equal(r.roleTier, "unknown"); }
    if (r.position === "Defender") assert.equal(r.eligibleForSpecials, false, `${r.playerName} defender excluded from attacking specials`);
  }
  assert.ok(unk > 0, "there are unmatched/unknown-role players, and they were excluded");
});

test("role gate: known key attackers pass (Gakpo / Gyökeres / Havertz / Valencia)", () => {
  const roles = classifyPlayerRoles(PP.matches, PP.lineupsPosted === true);
  const byName = new Map([...roles.values()].map((r) => [r.playerName, r]));
  for (const name of ["Cody Gakpo", "Viktor Gyokeres", "Kai Havertz", "Enner Valencia"]) {
    const r = byName.get(name);
    assert.ok(r, `${name} present in the pool`);
    assert.ok(r.eligibleForSpecials, `${name} passes the role gate`);
    assert.ok(["key_attacker", "projected_starter", "confirmed_starter"].includes(r.roleTier), `${name} is a starter/key-attacker tier`);
  }
});

test("role gate: every eligible player carries role evidence", () => {
  const roles = classifyPlayerRoles(PP.matches, PP.lineupsPosted === true);
  for (const r of roles.values())
    if (r.eligibleForSpecials) {
      assert.ok(Array.isArray(r.evidence) && r.evidence.length >= 2, `${r.playerName} has role evidence`);
      assert.ok(r.reason && r.reason.length, `${r.playerName} has a reason`);
    }
});

test("role gate: lineup-pending is labelled (no fake confirmed starters pre-event)", () => {
  const roles = classifyPlayerRoles(PP.matches, false);
  let confirmed = 0;
  for (const r of roles.values()) if (r.roleTier === "confirmed_starter") confirmed++;
  assert.equal(confirmed, 0, "no confirmed_starter when lineups are not posted");
  for (const r of roles.values()) assert.equal(r.lineupsPosted, false);
});

// ── Preview generator ──────────────────────────────────────────────────────────────────────────
test("generator: produces role-screened June 20 cards (date + scope)", () => {
  assert.ok(result.cards.length > 0 && result.cards.length <= cfg.count, `1..${cfg.count} cards`);
  assert.equal(result.date, "2026-06-20");
  for (const c of result.cards) for (const l of c.legs) assert.equal(l.sport, "WORLD_CUP");
});

test("generator: every leg odds > -250 and < +200; every card combined +700..+3000", () => {
  for (const c of result.cards) {
    const recomputed = combinedAmerican(c.legs.map((l) => l.odds));
    assert.equal(recomputed, c.combinedOdds, `${c.id} combined matches legs`);
    assert.ok(combinedOddsInRange(c.combinedOdds), `${c.id} ${c.combinedOdds} in band`);
    for (const l of c.legs) assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in leg band`);
  }
});

test("generator: no started games — every leg is pre-event vs NOW", () => {
  for (const c of result.cards) for (const l of c.legs) assert.ok(l.startTime && l.startTime > NOW, `${l.participant} pre-event`);
});

test("generator: each card has >=2 team props, >=2 player props, >=2 games", () => {
  for (const c of result.cards) {
    const team = c.legs.filter((l) => l.kind === "team").length;
    const player = c.legs.filter((l) => l.kind === "player").length;
    const games = new Set(c.legs.map((l) => l.eventId)).size;
    assert.ok(team >= 2, `${c.id} ${team} team`);
    assert.ok(player >= 2, `${c.id} ${player} player`);
    assert.ok(games >= 2, `${c.id} ${games} games`);
  }
});

test("generator: NO bench/unknown player legs — every player leg is a role-eligible tier", () => {
  const eligible = new Set(["confirmed_starter", "projected_starter", "key_attacker"]);
  for (const c of result.cards)
    for (const l of c.legs.filter((x) => x.kind === "player")) {
      assert.ok(l.roleTier, `${l.participant} carries a role tier`);
      assert.ok(eligible.has(l.roleTier), `${l.participant} role ${l.roleTier} is eligible`);
      assert.ok(ROLE_ELIGIBLE_TIERS.has(l.roleTier), `${l.participant} in ROLE_ELIGIBLE_TIERS`);
      assert.ok(Array.isArray(l.roleEvidence) && l.roleEvidence.length, `${l.participant} carries role evidence`);
    }
});

test("generator: every card has a role-quality summary; no duplicate cards", () => {
  const sigs = new Set();
  for (const c of result.cards) {
    assert.ok(c.roleQualitySummary && /role-screened|projected starter|key attacker/.test(c.roleQualitySummary), `${c.id} role summary`);
    const sig = c.legs.map((l) => l.legId).sort().join("|");
    assert.ok(!sigs.has(sig), `${c.id} is distinct`);
    sigs.add(sig);
  }
});

test("generator: diagnostics report accepted vs excluded role counts", () => {
  const d = result.diagnostics;
  assert.ok(d.eligiblePlayerLegs > 0, "in-range player legs counted");
  assert.ok(d.acceptedPlayerLegs > 0 && d.acceptedPlayerLegs < d.eligiblePlayerLegs, "role gate rejected some in-range legs");
  assert.ok(d.excludedRotationRisk + d.excludedBenchRisk + d.excludedUnknownRole > 0, "role exclusions recorded");
  assert.ok(Array.isArray(d.roleQualityNotes) && d.roleQualityNotes.length, "role notes present");
});

test("generator: no fabricated markets — only the real posted labels appear", () => {
  const allowed = new Set([
    "Moneyline (90′)", "Double Chance", "Total Goals", "Both Teams To Score", "Draw No Bet",
    "Anytime Goalscorer", "Shots on Target", "Assists", "Shots",
  ]);
  for (const c of result.cards) for (const l of c.legs) assert.ok(allowed.has(l.marketLabel), `${l.marketLabel} real`);
  const blob = JSON.stringify(result);
  assert.ok(!/score or assist/i.test(blob), "no fabricated 'score or assist'");
  assert.ok(!/first to score/i.test(blob), "no fabricated 'first to score'");
});

// ── Committed snapshot ─────────────────────────────────────────────────────────────────────────
test("snapshot: previews/june20/world-cup-specials.json exists, is June 20, role-screened", () => {
  const snap = loadJune20SpecialsPreview();
  assert.ok(snap, "snapshot loads");
  assert.equal(snap.date, "2026-06-20");
  assert.equal(snap.preview, true);
  assert.ok(snap.cards.length > 0);
  for (const c of snap.cards)
    for (const l of c.legs.filter((x) => x.kind === "player"))
      assert.ok(["key_attacker", "projected_starter", "confirmed_starter"].includes(l.roleTier), `${l.participant} role-eligible in snapshot`);
});

// ── Preview UI ─────────────────────────────────────────────────────────────────────────────────
test("UI: preview route shows the internal banner + June-19-settlement note + slate", () => {
  const page = fs.readFileSync("src/app/preview/june20/page.tsx", "utf8");
  assert.match(page, /Internal June 20 Preview/, "internal preview banner");
  assert.match(page, /Not production/, "not-production badge");
  assert.match(page, /June 19 settlement is not finalized/, "June 19 settlement note");
  assert.match(page, /WorldCupSpecialsPreviewBox/, "renders the specials box");
  assert.match(page, /index: false/, "route is noindex");
  assert.match(page, /loadJune20SpecialsPreview/, "loads the preview snapshot");
});

test("UI: preview box shows $10 → return, role badge, role-evidence drawer", () => {
  const box = fs.readFileSync("src/components/world-cup/world-cup-specials-preview-box.tsx", "utf8");
  assert.match(box, /usd\(card\.stakePreview\)\} → \{usd\(card\.projectedReturn\)/, "$10 → return");
  assert.match(box, /RoleBadge/, "role badge component");
  assert.match(box, /role evidence/, "role-evidence drawer");
  assert.match(box, /roleQualitySummary/, "per-card role summary");
  assert.match(box, /Role-screened/, "role-screened badge");
});

test("UI: production homepage was NOT changed (no preview import in today/page)", () => {
  const today = fs.readFileSync("src/app/today/page.tsx", "utf8");
  assert.ok(!/preview\/june20|specials-preview|June20|june20/.test(today), "today page has no June 20 preview wiring");
  // The production specials box + June 19 snapshot are untouched.
  const prod = JSON.parse(fs.readFileSync("public/data/world-cup/world-cup-specials.json", "utf8"));
  assert.equal(prod.date, "2026-06-19", "production specials snapshot still June 19");
});

// ── Protection ─────────────────────────────────────────────────────────────────────────────────
test("PROTECTION: active Bank Builder / Moonshot / Mr. Dub / June 19 WC artifacts unchanged", () => {
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "Lane A/B unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 808, "Moonshot active card unchanged");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 297.88, "core exposure unchanged");
  assert.equal(p.totalOpenExposure, 322.88, "total exposure unchanged");
  // June 19 production WC projections still dated June 19 (pull did not clobber latest.json).
  const wc = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(wc.date, "2026-06-19", "production WC projections still June 19");
});
