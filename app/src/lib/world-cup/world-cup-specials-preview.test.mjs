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

// ── Lineup-aware regrader (official starting XI supplied) ────────────────────────────────────────
test("regrader: an attacker IN the confirmed starting XI is promoted to confirmed_starter", () => {
  // Normalized last-name match (mirrors inStartingXI): "gakpo" is in the posted XI.
  const xi = new Set(["gakpo", "gyokeres", "havertz"]);
  const roles = classifyPlayerRoles(PP.matches, false, xi);
  const byName = new Map([...roles.values()].map((r) => [r.playerName, r]));
  const gakpo = byName.get("Cody Gakpo");
  assert.ok(gakpo, "Gakpo present");
  assert.equal(gakpo.roleTier, "confirmed_starter", "in-XI attacker is confirmed");
  assert.ok(gakpo.eligibleForSpecials, "confirmed starter is eligible");
  assert.equal(gakpo.lineupsPosted, true, "lineupsKnown reflects the supplied XI");
  assert.match(gakpo.reason, /official starting XI/, "reason cites the official XI");
});

test("regrader: an attacker with posted props but NOT in the XI is benched (excluded)", () => {
  // A tiny XI that deliberately excludes Gakpo → he must drop to bench_risk.
  const xi = new Set(["someoneelse", "anotherplayer"]);
  const roles = classifyPlayerRoles(PP.matches, false, xi);
  const gakpo = [...roles.values()].find((r) => r.playerName === "Cody Gakpo");
  assert.ok(gakpo, "Gakpo present");
  assert.equal(gakpo.roleTier, "bench_risk", "out-of-XI attacker is benched");
  assert.equal(gakpo.eligibleForSpecials, false, "benched player excluded from Specials");
  assert.match(gakpo.reason, /NOT in the confirmed starting XI/, "reason explains the bench exclusion");
});

test("regrader: unknown-role (unmatched) player stays excluded even with an XI supplied", () => {
  const xi = new Set(["gakpo", "gyokeres"]);
  const roles = classifyPlayerRoles(PP.matches, false, xi);
  for (const r of roles.values()) if (!r.position) {
    assert.equal(r.eligibleForSpecials, false, `${r.playerName} unknown stays excluded`);
    assert.equal(r.roleTier, "unknown");
  }
});

test("regrader: empty XI set falls back to projected behavior (no fabricated confirmations)", () => {
  const roles = classifyPlayerRoles(PP.matches, false, new Set());
  let confirmed = 0;
  for (const r of roles.values()) if (r.roleTier === "confirmed_starter") confirmed++;
  assert.equal(confirmed, 0, "empty XI ⇒ no confirmed starters (treated as lineups-not-posted)");
});

test("regrader: PARTIAL slate — only posted teams confirm/bench; un-posted teams stay projected", () => {
  // NED/SWE lineups posted; Germany/Ivory Coast NOT posted. The XI set carries only NED/SWE names.
  const xi = new Set(["gakpo", "gyokeres", "isak", "malen", "brobbey", "vandijk"]);
  const postedTeams = new Set(["netherlands", "sweden"]);
  const roles = classifyPlayerRoles(PP.matches, false, xi, postedTeams);
  const byName = new Map([...roles.values()].map((r) => [r.playerName, r]));
  // Netherlands player IN the posted XI → confirmed_starter (accent-robust last-name match).
  assert.equal(byName.get("Cody Gakpo")?.roleTier, "confirmed_starter", "Gakpo in posted XI → confirmed");
  // A team whose lineups are NOT posted must keep eligible attackers projected/key — never XI-benched.
  const gerEligible = [...roles.values()].some((r) => r.teamName === "Germany" && (r.roleTier === "projected_starter" || r.roleTier === "key_attacker"));
  assert.ok(gerEligible, "Germany (lineups not posted) still has projected/key attackers");
  for (const r of roles.values()) {
    if ((r.teamName === "Germany" || r.teamName === "Ivory Coast") && r.roleTier === "bench_risk") {
      assert.match(r.reason, /goalkeeper/, `${r.playerName}: un-posted team can only be bench_risk as a GK, never XI-benched`);
    }
  }
});

test("regrader: accent-insensitive XI matching (Gyökeres ⇄ Gyokeres)", () => {
  // XI carries the un-accented form; the prop feed may carry either — both must match.
  const roles = classifyPlayerRoles(PP.matches, false, new Set(["gyokeres"]), new Set(["sweden"]));
  const gy = [...roles.values()].find((r) => /Gy.?k.?res/i.test(r.playerName));
  if (gy) assert.equal(gy.roleTier, "confirmed_starter", "Gyökeres matched accent-insensitively → confirmed");
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

test("UI: production homepage renders the role-screened specials (live snapshot, no preview-route wiring)", () => {
  const today = fs.readFileSync("src/app/today/page.tsx", "utf8");
  assert.ok(!/preview\/june20/.test(today), "today page does not wire the internal /preview/june20 route");
  // DATE-AGNOSTIC: the production specials snapshot is the latest live build — pin it to the live World
  // Cup projections slate date so it tracks the daily roll instead of a hardcoded June 24.
  const prod = JSON.parse(fs.readFileSync("public/data/world-cup/world-cup-specials.json", "utf8"));
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(prod.date, proj.date, "production specials snapshot is the live slate");
});

test("snapshot: production specials are valid + honestly labeled (confirmed starters when cards exist; team-model fallback when no player props; valid empty when slate over)", () => {
  const prod = JSON.parse(fs.readFileSync("public/data/world-cup/world-cup-specials.json", "utf8"));
  // DATE-AGNOSTIC: pin the specials slate to the live WC projections date (rolls daily).
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(prod.date, proj.date, "production specials are the live current slate");
  const confirmed = prod.cards.flatMap((c) => c.legs).filter((l) => l.roleTier === "confirmed_starter");
  // When confirmed-starter legs are present they must be honestly labeled + belong to a posted-lineup team.
  for (const l of confirmed) {
    assert.match(l.lineupNote, /confirmed starter/i, "confirmed leg note matches its role (never 'lineups not posted')");
    assert.ok(["Netherlands", "Sweden"].includes(l.team), `${l.participant} confirmed only for a posted-lineup team`);
  }
  // Team-model fallback: when The Odds API exposes no soccer player props the build falls back to
  // TEAM-MODEL cards. That state must be labeled honestly in diagnostics (the box shows a fallback
  // badge), and the cards must be team-only (0 player props) — never fabricated player legs.
  if (prod.diagnostics?.fallbackMode === "team_models") {
    assert.equal(prod.diagnostics.playerPropsUnavailable, true, "fallback honestly flags player props unavailable");
    assert.ok(
      prod.diagnostics.notes.some((n) => /player_props_unavailable/.test(n)),
      "fallback carries an honest diagnostic note",
    );
    for (const c of prod.cards) {
      assert.equal(c.legs.filter((l) => l.kind === "player").length, 0, `${c.id} is team-only in the team-model fallback`);
      assert.ok(c.legs.filter((l) => l.kind === "team").length >= 4, `${c.id} has 4+ team props in fallback`);
    }
  }
  // End-of-slate (every game started → 0 eligible cards) is a valid honest state, not a failure: the box
  // shows a "between slates" message. Specials need >=2 pre-event games.
  if (prod.cards.length === 0) assert.ok(prod.diagnostics, "empty slate still carries diagnostics for the box");
});

// ── Protection ─────────────────────────────────────────────────────────────────────────────────
test("PROTECTION: active Bank Builder / Moonshot / Mr. Dub / June 19 WC artifacts unchanged", () => {
  // Banked dual run archived after banking Ladder #2; live artifact is fresh cycle-2. The WC Specials feature must not touch the banked history.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "banked Lane A/B unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 278, "Moonshot Step 1 card is +278");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 0, "core open exposure $0 (Lane A + Lane B settled WON — both seeds released)");
  assert.equal(p.totalOpenExposure, 0, "total open exposure $0 (core $0; moonshot settled → 0)");
  // Production WC projections are the live current slate (rolls daily once real data is generated — was
  // June 24, now June 25). This is the ONLY artifact the daily generation legitimately advances here; pin
  // it date-agnostically to the live specials slate. The market projections stay odds-backed via The Odds API.
  const specials = JSON.parse(fs.readFileSync("public/data/world-cup/world-cup-specials.json", "utf8"));
  const wc = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(wc.date, specials.date, "production WC projections track the live current slate");
  assert.equal(wc.oddsProvider, "odds_api", "prices remain odds-backed");
});
