/**
 * MLB-005 · COHERENT WORLDS: invariants of one simulated game (research only; nothing public reads this).
 *
 * A "world" is one simulated game: its result (final score, every batter line, both starters' lines) and the event
 * log the engine emits when an observer is passed (`simulateGame(game, rng, params, observer)`). Every published game
 * or player number that claims to come from the same simulation must be a read-out of worlds that pass these checks.
 *
 *   checkWorld({ game, result, events, rules }) → [] when coherent, else a list of violations (strings).
 *
 * Checked, in every world:
 *   SCORE      team runs = Σ that team's batter runs = Σ its half-inning runs = Σ runs scored on its events.
 *   RBI        a PA's RBI ≤ the runs scored on it; reach-on-error and free advances drive in nobody; Σ RBI ≤ runs.
 *   SCORERS    every runner who scores was on base before the event (or is the batter, on a home run only).
 *   OUTS       0 ≤ outs added per PA ≤ 2 and matches the outcome; no PA after the third out; every half ends on three
 *              outs except a walk-off.
 *   ORDER      each team's batters come up in strict lineup rotation across the whole game.
 *   LINES      every batter line equals the count of its own events (PA, H, TB, HR, K, BB, R, RBI); every starter line
 *              equals its events (BF, K, H allowed, outs, runs allowed); K ≤ BF; no negative counts.
 *   WALK-OFF   (official) a game-ending non-homer hit credits only the bases the winning runner advanced (9.06(f)).
 *   ENDING     no tie (unless the engine reports the game incomplete); at least 8½ innings; no bottom half once the
 *              home team leads after the top of the 9th or later; under WINNING_RUN_ONLY a non-homer walk-off wins
 *              by exactly one.
 *   EXTRAS     the automatic runner is on second at the start of an extra half exactly when the rules apply it.
 *   WORKLOAD   a starter removed by the batters-faced limit faced exactly that many.
 */

const HIT_BASES = { single: 1, double: 2, triple: 3, homeRun: 4 };
const OUTS_FOR = { strikeout: [1], fieldOut: [1, 2], walk: [0], reachOnError: [0], single: [0], double: [0], triple: [0], homeRun: [0] };

/** @param {{ game: any, result: any, events: any[], rules?: { walkOffScoring?: string }, automaticRunner?: boolean }} w */
export function checkWorld({ game, result, events, rules, automaticRunner = false }) {
  const v = [];
  const say = (m) => { if (v.length < 50) v.push(m); };
  const sides = {
    TOP: { lineup: game.awayLineup, lines: result.awayBatters, starterLine: result.homeStarter, hasStarter: !!game.homeStarter, runs: result.awayRuns, name: "away" },
    BOTTOM: { lineup: game.homeLineup, lines: result.homeBatters, starterLine: result.awayStarter, hasStarter: !!game.awayStarter, runs: result.homeRuns, name: "home" },
  };

  // Per-side tallies rebuilt from events.
  const tally = {};
  for (const h of ["TOP", "BOTTOM"]) {
    const n = sides[h].lineup.length;
    tally[h] = {
      bat: Array.from({ length: n }, () => ({ pa: 0, hits: 0, totalBases: 0, homeRuns: 0, strikeouts: 0, walks: 0, runs: 0, rbi: 0 })),
      starter: { battersFaced: 0, strikeouts: 0, hitsAllowed: 0, outsRecorded: 0, runsAllowed: 0 },
      halfRuns: 0, eventRuns: 0, lastSlot: null, removed: null,
      // substitution: the starter-only line and who occupies each slot (false = the starter)
      starterBat: Array.from({ length: n }, () => ({ pa: 0, hits: 0, totalBases: 0, homeRuns: 0, strikeouts: 0, walks: 0, runs: 0, rbi: 0 })),
      occupantSub: Array.from({ length: n }, () => false),
    };
  }

  // Rule 9.06(f) (WINNING_RUN_ONLY): a game-ending non-homer hit credits only the bases the winning runner advanced.
  const credited = new Map(); // PA event -> credited bases
  if (rules?.walkOffScoring === "WINNING_RUN_ONLY") {
    const lastEnd = [...events].reverse().find((e) => e.kind === "HALF_END");
    const lastPa = [...events].reverse().find((e) => e.kind === "PA");
    if (lastEnd?.endedOn === "OTHER" && lastPa && HIT_BASES[lastPa.outcome] && lastPa.outcome !== "homeRun" && lastPa.scored.length) {
      const winner = lastPa.scored[lastPa.scored.length - 1];
      const from = lastPa.basesBefore.indexOf(winner) + 1; // 1st = 1, 2nd = 2, 3rd = 3
      if (from >= 1) credited.set(lastPa, Math.min(HIT_BASES[lastPa.outcome], 4 - from));
    }
  }
  let half = null; // the half-inning in progress
  const halves = [];
  for (const e of events) {
    if (!half || half.inning !== e.inning || half.half !== e.half) {
      half = { inning: e.inning, half: e.half, outs: 0, runs: 0, first: true, started: false, ended: false };
      halves.push(half);
    }
    const t = tally[e.half];
    const side = sides[e.half];
    if (half.ended) say(`event after HALF_END in ${e.half} ${e.inning}`);
    if (e.kind === "HALF_START") {
      if (!half.first) say(`${e.half} ${e.inning}: HALF_START after its events`);
      const runnerOn2nd = e.bases[1] >= 0;
      if (e.bases[0] >= 0 || e.bases[2] >= 0) say(`${e.half} ${e.inning}: starts with a runner on first or third`);
      if (runnerOn2nd !== (e.inning > 9 && automaticRunner)) say(`${e.half} ${e.inning}: automatic runner ${runnerOn2nd ? "present" : "absent"}, rules say ${e.inning > 9 && automaticRunner ? "present" : "absent"}`);
      half.started = true;
      continue;
    }
    if (e.kind === "FREE_ADVANCE") {
      for (const s of e.scored) { t.bat[s].runs += 1; t.eventRuns += 1; half.runs += 1; if (!t.occupantSub[s]) t.starterBat[s].runs += 1; }
      if (side.hasStarter && !t.removed) t.starter.runsAllowed += e.scored.length; // charged to whoever is on the mound
      continue;
    }
    if (e.kind === "STARTER_REMOVED") {
      if (t.removed) say(`${side.name}: opposing starter removed twice`);
      t.removed = e;
      if (e.battersFaced > e.limit) say(`${side.name}: opposing starter faced ${e.battersFaced} > limit ${e.limit}`);
      continue;
    }
    if (e.kind === "HALF_END") {
      half.ended = true;
      if (e.runs !== half.runs) say(`${e.half} ${e.inning}: HALF_END runs ${e.runs} ≠ events ${half.runs}`);
      if (e.outs !== half.outs) say(`${e.half} ${e.inning}: HALF_END outs ${e.outs} ≠ events ${half.outs}`);
      if (e.outs !== 3 && !(e.half === "BOTTOM" && e.endedOn)) say(`${e.half} ${e.inning}: ended on ${e.outs} outs without a walk-off`);
      if (e.outs > 3) say(`${e.half} ${e.inning}: ${e.outs} outs`);
      t.halfRuns += e.runs;
      continue;
    }
    // PA
    if (e.outsBefore !== half.outs) say(`${e.half} ${e.inning}: outsBefore ${e.outsBefore} ≠ running ${half.outs}`);
    if (e.outsBefore >= 3) say(`${e.half} ${e.inning}: PA after the third out`);
    const added = e.outsAfter - e.outsBefore;
    if (!(OUTS_FOR[e.outcome] ?? []).includes(added)) say(`${e.half} ${e.inning}: ${e.outcome} added ${added} outs`);
    half.outs = e.outsAfter;
    if (!half.started) say(`${e.half} ${e.inning}: PA before HALF_START`);
    half.first = false;
    // ORDER
    const n = side.lineup.length;
    if (t.lastSlot != null && e.batterSlot !== (t.lastSlot + 1) % n) say(`${side.name}: slot ${e.batterSlot} batted after ${t.lastSlot}`);
    if (t.lastSlot == null && e.batterSlot !== 0) say(`${side.name}: leadoff is slot ${e.batterSlot}`);
    t.lastSlot = e.batterSlot;
    // SCORERS
    const onBase = new Set(e.basesBefore.filter((x) => x >= 0));
    for (const s of e.scored) {
      if (!(onBase.has(s) || (s === e.batterSlot && e.outcome === "homeRun"))) say(`${side.name}: slot ${s} scored on ${e.outcome} without being on base`);
      if (s < 0 || s >= n) say(`${side.name}: scorer ${s} outside the lineup`);
    }
    if (e.outcome === "homeRun" && !e.scored.includes(e.batterSlot)) say(`${side.name}: home run without the batter scoring`);
    // RBI
    if (e.rbi > e.scored.length) say(`${side.name}: ${e.rbi} RBI on ${e.scored.length} runs`);
    if (e.outcome === "reachOnError" && e.rbi !== 0) say(`${side.name}: RBI on an error`);
    // SUBSTITUTION: once replaced, a slot never returns to its starter; the starter line counts only his own events.
    if (e.sub != null) {
      if (t.occupantSub[e.batterSlot] && !e.sub) say(`${side.name}: slot ${e.batterSlot} starter batted after being replaced`);
      t.occupantSub[e.batterSlot] = e.sub;
      if (!e.sub) {
        const sb = t.starterBat[e.batterSlot];
        sb.pa += 1; sb.rbi += e.rbi;
        if (HIT_BASES[e.outcome]) { sb.hits += 1; sb.totalBases += credited.get(e) ?? HIT_BASES[e.outcome]; if (e.outcome === "homeRun") sb.homeRuns += 1; }
        if (e.outcome === "strikeout") sb.strikeouts += 1;
        if (e.outcome === "walk") sb.walks += 1;
      }
      for (const s of e.scored) if (!t.occupantSub[s]) t.starterBat[s].runs += 1;
    }
    // line tallies
    const b = t.bat[e.batterSlot];
    b.pa += 1; b.rbi += e.rbi;
    if (HIT_BASES[e.outcome]) { b.hits += 1; b.totalBases += credited.get(e) ?? HIT_BASES[e.outcome]; if (e.outcome === "homeRun") b.homeRuns += 1; }
    if (e.outcome === "strikeout") b.strikeouts += 1;
    if (e.outcome === "walk") b.walks += 1;
    for (const s of e.scored) { t.bat[s].runs += 1; t.eventRuns += 1; half.runs += 1; }
    if (e.pitcher === "STARTER") {
      const p = t.starter;
      p.battersFaced += 1; p.outsRecorded += added; p.runsAllowed += e.scored.length;
      if (e.outcome === "strikeout") p.strikeouts += 1;
      if (HIT_BASES[e.outcome]) p.hitsAllowed += 1;
      if (t.removed) say(`${side.name}: starter pitched after removal`);
    }
  }

  for (const h of ["TOP", "BOTTOM"]) {
    const side = sides[h]; const t = tally[h];
    // SCORE
    const sumBatterRuns = side.lines.reduce((s, l) => s + l.runs, 0);
    if (!result.incomplete) {
      if (side.runs !== sumBatterRuns) say(`${side.name}: score ${side.runs} ≠ Σ batter runs ${sumBatterRuns}`);
      if (side.runs !== t.halfRuns) say(`${side.name}: score ${side.runs} ≠ Σ half-inning runs ${t.halfRuns}`);
    }
    if (t.eventRuns !== sumBatterRuns) say(`${side.name}: runs on events ${t.eventRuns} ≠ Σ batter runs ${sumBatterRuns}`);
    const sumRbi = side.lines.reduce((s, l) => s + l.rbi, 0);
    if (sumRbi > sumBatterRuns) say(`${side.name}: Σ RBI ${sumRbi} > runs ${sumBatterRuns}`);
    // LINES
    side.lines.forEach((l, i) => {
      for (const k of ["pa", "hits", "totalBases", "homeRuns", "strikeouts", "walks", "runs", "rbi"]) {
        if (l[k] < 0) say(`${side.name} slot ${i}: negative ${k}`);
        if (l[k] !== t.bat[i][k]) say(`${side.name} slot ${i}: line ${k} ${l[k]} ≠ events ${t.bat[i][k]}`);
      }
      if (l.homeRuns > l.runs) say(`${side.name} slot ${i}: ${l.homeRuns} HR but ${l.runs} runs`);
    });
    const starterOnly = h === "TOP" ? result.awayStarterBatters : result.homeStarterBatters;
    if (starterOnly) starterOnly.forEach((l, i) => {
      for (const k of ["pa", "hits", "totalBases", "homeRuns", "strikeouts", "walks", "runs", "rbi"]) {
        if (l[k] !== t.starterBat[i][k]) say(`${side.name} slot ${i}: starter-only ${k} ${l[k]} ≠ events ${t.starterBat[i][k]}`);
        if (l[k] > side.lines[i][k]) say(`${side.name} slot ${i}: starter-only ${k} exceeds the slot line`);
      }
    });
    const p = side.starterLine; const q = t.starter;
    for (const k of ["battersFaced", "strikeouts", "hitsAllowed", "outsRecorded", "runsAllowed"]) {
      if (p[k] < 0) say(`${side.name} opposing starter: negative ${k}`);
      if (p[k] !== q[k]) say(`${side.name} opposing starter: ${k} ${p[k]} ≠ events ${q[k]}`);
    }
    if (p.strikeouts > p.battersFaced) say(`${side.name} opposing starter: K ${p.strikeouts} > BF ${p.battersFaced}`);
    if (t.removed && t.removed.battersFaced < t.removed.limit && p.runsAllowed < 1) say(`${side.name} opposing starter removed at ${t.removed.battersFaced} BF below limit ${t.removed.limit} with no runs`);
  }

  // ENDING
  if (!result.incomplete) {
    if (result.awayRuns === result.homeRuns) say(`tie ${result.awayRuns}-${result.homeRuns}`);
    const last = halves[halves.length - 1];
    if (!last || last.inning < 9) say(`ended in inning ${last?.inning}`);
    // no bottom half after the home team leads following a top of the 9th+
    let away = 0; let home = 0;
    for (const hh of halves) {
      if (hh.half === "TOP") away += hh.runs;
      else {
        if (hh.inning >= 9 && home > away) say(`bottom ${hh.inning} played with the home team leading`);
        home += hh.runs;
      }
    }
    const end = events.filter((e) => e.kind === "HALF_END").pop();
    if (end?.endedOn === "OTHER" && rules?.walkOffScoring === "WINNING_RUN_ONLY" && result.homeRuns - result.awayRuns !== 1) say(`non-homer walk-off won by ${result.homeRuns - result.awayRuns}`);
  }
  return v;
}

/** A stable fingerprint of one world (result + event log), for the reproducibility check. FNV-1a over JSON. */
export function worldFingerprint(result, events) {
  const s = JSON.stringify([result, events]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
