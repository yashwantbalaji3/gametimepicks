/**
 * P250-GD3 — GAME-DAY EVIDENCE FRESHNESS + ROSTER MOVERS.
 *
 * Two defects found by the founder on game day, both about the product's relationship to its own
 * evidence rather than its models:
 *
 * 1. A DESIGNATION THIS CHAIN CONDITIONS ON MUST BE REFRESHED BY THIS CHAIN. The injuries feed was
 *    captured only by sport-schedules, on its own cadence. On 2026-09-09 our snapshot was 22.6h
 *    old — inside the 24h bound, so every surface said FRESH — while the source had upgraded
 *    TreVeyon Henderson to Out four hours after it. The site published volume projections for an
 *    out player on the day of his game. The event window now captures injuries itself, before
 *    event assembly and before role evidence.
 *
 * 2. A ROSTER MOVER IS NOT A NON-PERSON. A player who changed clubs after his last corpus game is
 *    absent from BOTH share pools — off the old club's list, and started at zero evidence on the
 *    new one by the evaluated stint rule. A.J. Brown (16 games, 64.3 receiving yards per game at
 *    PHI in 2025) appeared NOWHERE on New England's page. The stint rule is RIGHT about what is
 *    unknown; the product was wrong to render that as silence. His prior-club usage now publishes
 *    as stated fact, explicitly outside the simulated numbers.
 */
import { isBlockingStatus } from "../injuries/contract.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveNewArrivals } from "./new-arrivals.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const readApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the event window captures injuries ITSELF, before the steps that condition on them", () => {
  const wf = readApp("../.github/workflows/nfl-event-window.yml");
  assert.match(wf, /capture-injuries\.mjs --now/, "the window refreshes designations");
  const iInj = wf.indexOf("capture-injuries.mjs");
  const iAssembly = wf.indexOf("run-nfl-event-window.mjs");
  const iRole = wf.indexOf("build-nfl-role-evidence.mjs");
  assert.ok(iInj > 0 && iInj < iAssembly, "injuries refresh BEFORE event assembly builds the participation pool");
  assert.ok(iInj < iRole, "…and before role evidence reads the designations");
});

test("LIVE · a player designated Out carries no volume projection anywhere", () => {
  /*
   * SCOPED TO GAMES THAT HAVE NOT KICKED OFF (rebased 2026-09-10).
   *
   * This iterated every board on disk. On 2026-09-10 it failed on NE @ SEA — a game that had
   * already been PLAYED, 13-10 final — because Tory Horton was designated Out at 23:04Z, our board
   * was built at 22:57Z, and the game kicked off at 00:20Z. The finding was real at kickoff and the
   * demand it makes now is not: satisfying this assertion today would mean editing the board we
   * published BEFORE that game, which is the one thing a frozen pre-event artifact must never allow.
   * P252 settled that argument in the other direction — the pre-kickoff numbers are exactly what a
   * reader auditing the record needs to see, unchanged.
   *
   * So the invariant is unchanged for every board that can still mislead somebody, and history is
   * left alone. The timing gap the failure exposed — a last refresh 83 minutes before kickoff, with
   * nothing re-reading designations after it — is a scheduling problem, not something to fix by
   * rewriting yesterday's artifact.
   */
  const injuries = read("data/internal/research/injuries/nfl/latest.json");
  const out = new Set(
    (injuries.entries ?? [])
      .filter((e) => isBlockingStatus(e.status))
      .map((e) => `nfl-athlete-${e.athleteId}`),
  );
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  let judged = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const kickoff = Date.parse(b.kickoffUtc ?? "");
    // An unreadable kickoff is judged: refusing to check is the flattering direction.
    if (Number.isFinite(kickoff) && kickoff <= now) continue; // already played — a record, not a claim
    judged += 1;
    for (const p of b.players ?? []) {
      if (!out.has(p.playerId)) continue;
      const volume = Object.keys(p.markets).filter((m) => m !== "anytime_td");
      assert.deepEqual(volume, [], `${p.name} is designated out and still carries ${volume.join(", ")} in ${b.matchup}`);
    }
  }
  // A pass because every board was in the past is not a pass. Say so rather than reporting health.
  if (judged === 0) console.log("      (no upcoming board to judge — every board on disk is for a game already played)");
});

test("LIVE · every board's evidence is no older than the artifact that built it", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  const role = read("data/internal/nfl/role-evidence/latest.json");
  const injuries = read("data/internal/research/injuries/nfl/latest.json");
  // The role evidence must not predate the injuries capture it is supposed to reflect.
  assert.ok(
    Date.parse(role.generatedAt) >= Date.parse(injuries.generatedAt),
    `role evidence (${role.generatedAt}) is older than the injuries capture (${injuries.generatedAt}) — it cannot carry designations it never saw`,
  );
});

test("LIVE · no published row belongs to a player who is off that team's roster", () => {
  /*
   * P250-GD4: the Aug-13 share snapshot still listed movers under the club they LEFT, so the pool
   * did not merely omit them — it attributed their volume to the wrong team. Quinn Ewers was
   * projected as Miami's passing leader while rostered in Jacksonville; Brady Cook as the Jets' QB
   * while rostered in Miami; 27 rows in all. A missing player is a gap; a projection for a player
   * who cannot take that field is a false statement, and this is the invariant that forbids it.
   */
  const rosters = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/rosters/latest.json"), "utf8"));
  const byTeam = new Map();
  for (const t of rosters.teams ?? []) {
    const ids = new Set((t.players ?? []).map((p) => `nfl-athlete-${p.id}`));
    if (ids.size) byTeam.set(t.teamAbbr, ids);
  }
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of b.players ?? []) {
      const roster = byTeam.get(p.team);
      if (!roster) continue; // capture gap for that team — the builder fails closed rather than wiping a board
      assert.ok(roster.has(p.playerId), `${p.name} is projected for ${p.team} in ${b.matchup} and is not on its roster`);
    }
    assert.equal(typeof b.departedFiltered, "number", "the board records how many rows the roster filter removed");
  }
});

test("new arrivals: a notable mover is published as prior-club FACT, never as a projection", () => {
  const seasons = ["2025", "2024"]
    .map((y) => { try { return read(`data/internal/research/nfl/player-events-v1/${y}.json`); } catch { return null; } })
    .filter(Boolean);
  if (!seasons.length) return;
  const arrivals = deriveNewArrivals({
    corpusSeasons: seasons,
    roleEvidence: read("data/internal/nfl/role-evidence/latest.json"),
    shares: read("data/internal/research/nfl/role-shares-v1/current.json"),
  });
  let total = 0;
  for (const [, teams] of arrivals) {
    for (const [abbr, list] of Object.entries(teams)) {
      for (const a of list) {
        total += 1;
        assert.equal(a.team, abbr, "an arrival is filed under the club he is rostered on");
        assert.notEqual(a.lastSeason.club, abbr, "a same-club player is not an arrival — the stint rule already sees him");
        assert.ok(a.lastSeason.games >= 6, `${a.name}: a mover publishes only with a real prior sample`);
        assert.match(a.note, /NOT in this game's simulated team numbers/, `${a.name}: the frame must travel with the row`);
        // Prior-club history is FACT: no field may look like a forward projection.
        for (const k of Object.keys(a.lastSeason)) {
          assert.ok(!/proj|median|p10|p90|share/i.test(k), `${a.name}: ${k} reads as a projection, not history`);
        }
      }
    }
  }
  assert.ok(total > 0, "the current week has movers — an empty derivation would mean the join broke");
});

test("both UIs render arrivals with the not-in-these-numbers frame", () => {
  const board = readApp("src/components/nfl/player-board.tsx");
  assert.match(board, /New arrivals · not in the simulated numbers above/);
  assert.match(board, /history, not a projection/);
  const page = readApp("src/app/nfl/game/[eventId]/page.tsx");
  assert.match(page, /New arrivals · not in these numbers/);
  assert.match(page, /history, not a projection/);
});

test("LIVE · ONE ANSWER PER PLAYER — no surface calls a designated-out player expected to play", () => {
  /*
   * P250-W2: the Vault decided each candidate's role state from a TEAM AGGREGATE ("somebody on
   * this club is expected to play"), so Zach Charbonnet published at 50.2% with the note "roster
   * and injury evidence support expected participation" while the same injuries capture had him
   * Out since Sep 7 and the player board had already withheld his volume. Two public surfaces,
   * one player, opposite answers — the aggregate can never answer a question about one player.
   *
   * The invariant is cross-surface: whatever the designation says, every public NFL surface says
   * the same thing about that player, or does not carry him at all.
   */
  const role = read("data/internal/nfl/role-evidence/latest.json");
  const outByPlayer = new Map();
  for (const ev of role.events ?? []) {
    for (const [abbr, tv] of Object.entries(ev.teams ?? {})) {
      for (const pl of tv.players ?? []) {
        if (pl.state === "OUT" || pl.state === "INACTIVE") outByPlayer.set(`${abbr}:${pl.playerId}`, pl);
      }
    }
  }
  if (outByPlayer.size === 0) return; // no designations this window — nothing to contradict

  const byPlayer = new Map();
  for (const ev of role.events ?? []) {
    for (const [abbr, tv] of Object.entries(ev.teams ?? {})) {
      for (const pl of tv.players ?? []) byPlayer.set(`${abbr}:${pl.playerId}`, pl);
    }
  }
  const vault = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"), "utf8"));
  for (const c of [...(vault.selections ?? []), ...(vault.watchlist ?? [])]) {
    const designated = outByPlayer.get(`${c.team}:${c.playerId}`);
    assert.ok(!designated, `${c.name} is designated ${designated?.injuryStatus ?? "out"} and is published in the Vault as ${c.roleState}`);
    /*
     * And the state itself agrees with that evidence rather than with a team-level aggregate. The
     * aggregate flipped every candidate on this slate between "expected to play" and "playing time
     * unknown" across two runs forty seconds apart, with no underlying fact changing.
     */
    const ev = byPlayer.get(`${c.team}:${c.playerId}`);
    if (!ev) continue; // a candidate the evidence does not carry keeps the pool fallback
    if (ev.state === "QUESTIONABLE") {
      assert.equal(c.roleState, "QUESTIONABLE", `${c.name} is listed questionable and the Vault says ${c.roleState}`);
    } else if (["ACTIVE_EXPECTED", "ACTIVE_PROJECTED", "ACTIVE_UNCERTAIN"].includes(ev.state)) {
      assert.equal(c.roleState, "ACTIVE_EXPECTED", `${c.name} is rostered with no blocking designation and the Vault says ${c.roleState}`);
    } else {
      assert.equal(c.roleState, "ROLE_UNCERTAIN", `${c.name}'s evidence is ${ev.state} — the Vault may not claim more than that`);
    }
  }

  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of b.players ?? []) {
      if (!outByPlayer.has(`${p.team}:${p.playerId}`)) continue;
      assert.equal(p.participation, "INACTIVE", `${p.name} is designated out and the board calls him ${p.participation}`);
    }
  }
});

test("P251 · A STALE FEED CANNOT UN-DESIGNATE A PLAYER", () => {
  /*
   * "Silence from a stale feed proves nothing" was enforced in one direction only. Any non-FRESH
   * injuries read collapsed EVERY player to SOURCE_STALE — including the ones the feed had already
   * designated Out — and SOURCE_STALE maps downstream to AVAILABLE_ROLE_UNCERTAIN, while the
   * board's withholding pass strips volume only from INACTIVE. So a degraded read handed a
   * designated-out player his projection back.
   *
   * It happened live: the 2026-09-09T22:57Z run recorded injuries CLOCK_DEFECT and published 33
   * rushing yards for Zach Charbonnet, three days after ESPN listed him Out and hours after this
   * same chain had correctly withheld them.
   *
   * The asymmetry is the claim: staleness widens what we do not know, and cannot create knowledge
   * we never had. A recent blocking designation survives a degraded read; everything softer still
   * degrades; and a designation older than the carry window is NOT carried forward, because that
   * would be the opposite error.
   */
  const src = readApp("scripts/nfl/build-nfl-role-evidence.mjs");
  assert.match(src, /a stale feed cannot un-designate a player/, "the rule is stated where it is enforced");
  assert.match(src, /DESIGNATION_CARRY_H/, "and it is bounded — an ancient designation is not carried forward");
  /* The blocking branch must be evaluated BEFORE the two staleness branches, or it is unreachable. */
  const iCarry = src.indexOf("carried through a");
  const iRosterStale = src.indexOf('because = `roster capture is');
  const iInjuryStale = src.indexOf("silence from a stale feed proves nothing");
  assert.ok(iCarry > 0 && iCarry < iRosterStale && iCarry < iInjuryStale,
    "the designation-carry branch must run before the staleness branches, or a stale read still wins");

  /* And the live artifact must agree with the live designations, whatever the freshness says. */
  const role = read("data/internal/nfl/role-evidence/latest.json");
  const injuries = read("data/internal/research/injuries/nfl/latest.json");
  const blocking = new Map(
    (injuries.entries ?? [])
      .filter((e) => isBlockingStatus(e.status))
      .map((e) => [`nfl-athlete-${e.athleteId}`, e]),
  );
  for (const ev of role.events ?? []) {
    const kickoff = Date.parse(ev.kickoffUtc);
    for (const [, tv] of Object.entries(ev.teams ?? {})) {
      for (const p of tv.players ?? []) {
        const inj = blocking.get(p.playerId);
        if (!inj) continue;
        const stated = Date.parse(inj.statedAt ?? "");
        const recent = Number.isFinite(stated) && Number.isFinite(kickoff) && kickoff - stated <= 336 * 3.6e6 && stated <= kickoff;
        if (!recent) continue;
        assert.equal(p.state, "OUT",
          `${p.name} is designated ${inj.status} (stated ${inj.statedAt}) and the role evidence says ${p.state} — freshness is ${JSON.stringify(role.freshness)}`);
      }
    }
  }
});

/**
 * P265 · A REFUSED PAID CAPTURE MUST NOT TAKE THE FREE WORK WITH IT.
 *
 * Role evidence and the public forecasts are built from rosters and injuries, both captured before the
 * odds step and both succeeding. GitHub skips every later step once one fails, so on 2026-09-12 a
 * single book's future-stamped price refused the capture and left the published boards carrying last
 * night's role evidence against this morning's injuries — the day before Sunday. The odds step still
 * fails the job and still alerts; the boards refresh regardless.
 */
test("the NFL window rebuilds boards even when the paid odds capture refuses", () => {
  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/nfl-event-window.yml"), "utf8");
  for (const step of ["Event assembly + shadow simulations + current artifacts", "Build NFL role evidence", "Generate public-beta NFL forecasts"]) {
    const at = wf.indexOf(`- name: ${step}`);
    assert.ok(at > 0, `${step} exists`);
    const body = wf.slice(at, at + 400);
    assert.match(body, /if: \$\{\{ !cancelled\(\) &&/, `${step} must survive an earlier failure`);
  }
  // The paid step keeps failing the job — that alert was the one thing that worked.
  const odds = wf.slice(wf.indexOf("- name: Authorized odds capture"), wf.indexOf("- name: Event assembly"));
  assert.ok(!/continue-on-error:\s*true/.test(odds), "a refused paid capture stays loud");
});
