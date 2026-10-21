/**
 * nba-possession-sim-v0 · INVARIANT CHECKER — run over EVERY draw; any violation throws in simulatePossessionGame.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * The checker re-derives everything from the event log on its own (it does not trust draw.box), then compares:
 *   P1  linescore: 4 + OT periods per team; Σ periods = final = team PTS = Σ player PTS = score on the last event
 *   P2  minutes: per team Σ player seconds = 5 × (2880 + 300·OT) s (240 + 25·OT minutes); 0 ≤ player ≤ game length
 *   P3  five on court: every period_start names 5 distinct roster players per team; each sub takes a player who is on
 *       court off and puts one who is not on; every actor (shooter, assister, FT shooter, rebounder, turnover, stealer,
 *       blocker, fouler, fouled player) is on court for the right team at that moment; assister ≠ shooter
 *   P4  shooting: per player and team, non-negative integers with 3PM ≤ 3PA ≤ FGA, 3PM ≤ FGM ≤ FGA, FTM ≤ FTA,
 *       PTS = 2·FGM + 3PM + FTM, REB = OREB + DREB
 *   P5  team: AST ≤ FGM; STL ≤ opponent TOV; BLK ≤ opponent missed FGA; 0 seconds ⇒ every stat 0
 *   P6  result: untied final; overtime played only after a tie at the end of regulation / the previous OT
 *   P7  clock: each period starts at 12:00 (OT 5:00), clock never increases inside a period, ends at 0:00; i is 0..n−1
 *   P8  score: each event's score = the running sum of made shots (2/3) and made free throws; nothing else scores
 *   P9  possession: shots, free throws and turnovers belong to the team in possession; fouls to the defence; the
 *       possession changes only after a made basket / made last free throw (and-one included), a defensive rebound,
 *       a turnover or a period start, and always changes after a defensive rebound or a turnover
 *   P10 personal fouls: ≤ 6 per player unless the no-eligible-substitute rule was logged; a disqualified player
 *       never re-enters
 *   P11 reconciliation: draw.box deep-equals fold(events) AND fold(events) equals the engine's running ledger
 */
import { foldEvents, periodLengthDs, BOX_KEYS } from "./events.mjs";

const isNN = (x) => Number.isInteger(x) && x >= 0;

export function checkPossessionDraw(draw, rosters) {
  const v = [];
  const ev = draw.events ?? [];
  const rosterSets = rosters.map((ids) => new Set(ids.map(String)));
  // P7 sequence + P3/P8/P9/P10 replay
  const on = [new Set(), new Set()];
  const score = [0, 0];
  const pf = [new Map(), new Map()];
  const dq = [new Set(), new Set()];
  let q = 0, clock = null, prevRelevant = null, lastPoss = null;
  const actorOn = (t, pid, what, e) => { if (pid == null) return; if (!on[t]?.has(String(pid))) v.push(`P3: event ${e.i} ${what} ${pid} not on court for team ${t}`); };
  ev.forEach((e, k) => {
    if (e.i !== k) v.push(`P7: event index ${e.i} at position ${k}`);
    if (e.type === "period_start") {
      if (e.q !== q + 1) v.push(`P7: period ${e.q} follows ${q}`);
      q = e.q;
      if (e.c !== periodLengthDs(q)) v.push(`P7: period ${q} starts at ${e.c}`);
      clock = e.c;
      for (let t = 0; t < 2; t += 1) {
        const ids = (e.lineups?.[t] ?? []).map(String);
        if (ids.length !== 5 || new Set(ids).size !== 5) v.push(`P3: period ${q} team ${t} lineup has ${new Set(ids).size} distinct players`);
        for (const id of ids) { if (!rosterSets[t].has(id)) v.push(`P3: period ${q} lineup player ${id} not on team ${t} roster`); if (dq[t].has(id) && !draw.notes?.disqualifiedStayed) v.push(`P10: disqualified ${id} re-entered at period ${q}`); }
        on[t] = new Set(ids);
      }
      prevRelevant = "period_start";
    } else {
      if (e.q !== q) v.push(`P7: event ${e.i} period ${e.q} inside period ${q}`);
      if (!(Number.isInteger(e.c) && e.c >= 0 && clock != null && e.c <= clock)) v.push(`P7: event ${e.i} clock ${e.c} after ${clock}`);
      clock = e.c;
    }
    // P9 possession continuity
    if (e.type !== "period_start" && e.type !== "jump_ball") {
      if (lastPoss != null && e.poss !== lastPoss) {
        if (!["made_last", "dreb", "tov", "period_start"].includes(prevRelevant)) v.push(`P9: possession changed at event ${e.i} after ${prevRelevant}`);
        prevRelevant = "changed";
      } else if (lastPoss != null && (prevRelevant === "dreb" || prevRelevant === "tov") && e.type !== "period_end" && e.type !== "game_end") {
        v.push(`P9: possession did not change at event ${e.i} after ${prevRelevant}`);
      }
    }
    switch (e.type) {
      case "sub":
        if (!on[e.team].has(String(e.out))) v.push(`P3: event ${e.i} subs out ${e.out} who is not on court`);
        if (on[e.team].has(String(e.in))) v.push(`P3: event ${e.i} subs in ${e.in} who is already on court`);
        if (!rosterSets[e.team].has(String(e.in))) v.push(`P3: event ${e.i} subs in ${e.in} from outside the roster`);
        if (dq[e.team].has(String(e.in)) && !draw.notes?.disqualifiedStayed) v.push(`P10: disqualified ${e.in} re-entered at event ${e.i}`);
        on[e.team].delete(String(e.out)); on[e.team].add(String(e.in));
        if (on[e.team].size !== 5) v.push(`P3: event ${e.i} leaves team ${e.team} with ${on[e.team].size} on court`);
        break;
      case "shot":
        if (e.team !== e.poss) v.push(`P9: event ${e.i} shot by the defence`);
        actorOn(e.team, e.player, "shooter", e); actorOn(e.team, e.assist, "assister", e); actorOn(1 - e.team, e.block, "blocker", e);
        if (e.assist != null && String(e.assist) === String(e.player)) v.push(`P3: event ${e.i} self-assist`);
        if (e.made && e.block != null) v.push(`P5: event ${e.i} blocked shot counted as made`);
        if (!e.made && e.assist != null) v.push(`P5: event ${e.i} assist on a miss`);
        if (e.value !== 2 && e.value !== 3) v.push(`P4: event ${e.i} shot value ${e.value}`);
        if (e.made) score[e.team] += e.value;
        prevRelevant = e.made ? "made_last" : "miss";
        break;
      case "free_throw":
        if (e.team !== e.poss) v.push(`P9: event ${e.i} free throw by the defence`);
        actorOn(e.team, e.player, "FT shooter", e);
        if (e.made) score[e.team] += 1;
        prevRelevant = e.n === e.of ? (e.made ? "made_last" : "miss") : "ft_mid";
        break;
      case "rebound":
        actorOn(e.team, e.player, "rebounder", e);
        if ((e.kind === "offensive") !== (e.team === e.poss)) v.push(`P9: event ${e.i} ${e.kind} rebound credited to the wrong side`);
        prevRelevant = e.kind === "defensive" ? "dreb" : "oreb";
        break;
      case "turnover":
        if (e.team !== e.poss) v.push(`P9: event ${e.i} turnover by the defence`);
        actorOn(e.team, e.player, "turnover", e); actorOn(1 - e.team, e.steal, "stealer", e);
        prevRelevant = "tov";
        break;
      case "foul": {
        if (e.team === e.poss) v.push(`P9: event ${e.i} foul by the offence (v0 books every foul on the defence)`);
        actorOn(e.team, e.player, "fouler", e); actorOn(1 - e.team, e.on, "fouled player", e);
        const n = (pf[e.team].get(String(e.player)) ?? 0) + 1;
        pf[e.team].set(String(e.player), n);
        if (n >= 6) dq[e.team].add(String(e.player));
        if (n > 6 && !draw.notes?.disqualifiedStayed) v.push(`P10: ${e.player} has ${n} personal fouls`);
        if (e.kind === "and_one") prevRelevant = "and_one";
        else if (e.kind === "personal") prevRelevant = "personal";
        else prevRelevant = "trip";
        break;
      }
      case "period_end":
        if (e.c !== 0) v.push(`P7: period ${q} ends at ${e.c}`);
        break;
      case "period_start": case "jump_ball": case "game_end": break;
      default: v.push(`P7: unknown event type ${e.type}`);
    }
    if (e.type !== "period_start" && e.type !== "jump_ball") lastPoss = e.poss;
    if (e.type === "jump_ball" || e.type === "period_start") lastPoss = e.type === "jump_ball" ? e.team : e.poss;
    if (!Array.isArray(e.s) || e.s[0] !== score[0] || e.s[1] !== score[1]) v.push(`P8: event ${e.i} score ${JSON.stringify(e.s)} ≠ running ${JSON.stringify(score)}`);
  });
  if (ev[ev.length - 1]?.type !== "game_end") v.push("P7: log does not end with game_end");

  // fold independently
  let box;
  try { box = foldEvents(ev, rosters); } catch (err) { v.push(`P3: fold failed — ${err.message}`); return v; }
  const ot = box.overtimePeriods;
  // P1
  for (let t = 0; t < 2; t += 1) {
    if (box.periods[t].length !== 4 + ot) v.push(`P1: team ${t} has ${box.periods[t].length} periods for ${ot} OT`);
    if (!box.periods[t].every(isNN)) v.push(`P1: team ${t} period score not a non-negative integer`);
    const sumP = box.periods[t].reduce((a, b) => a + b, 0);
    let sumPl = 0; for (const l of box.players[t].values()) sumPl += l.pts;
    if (sumP !== draw.final?.[t] || box.team[t].pts !== draw.final?.[t] || sumPl !== draw.final?.[t] || score[t] !== draw.final?.[t]) v.push(`P1: team ${t} periods ${sumP} / team ${box.team[t].pts} / players ${sumPl} / log ${score[t]} / final ${draw.final?.[t]} disagree`);
    if (JSON.stringify(draw.periods?.[t]) !== JSON.stringify(box.periods[t])) v.push(`P1: team ${t} reported linescore ≠ fold`);
  }
  if (draw.overtimePeriods !== ot) v.push(`P1: reported OT ${draw.overtimePeriods} ≠ fold ${ot}`);
  // P2
  const gameDs = 4 * 7200 + 3000 * ot;
  for (let t = 0; t < 2; t += 1) {
    let tot = 0;
    for (const [pid, l] of box.players[t]) { tot += l.ds; if (!(isNN(l.ds) && l.ds <= gameDs)) v.push(`P2: ${pid} on court ${l.ds} ds of ${gameDs}`); }
    if (tot !== 5 * gameDs) v.push(`P2: team ${t} minutes ${tot / 600} ≠ ${240 + 25 * ot}`);
  }
  // P4 / P5 — on the independent fold AND on the box the draw reports (so a corrupted reported box fails here too)
  const boxes = [["fold", box]];
  if (draw.box?.players && draw.box?.team) boxes.push(["reported", draw.box]);
  for (const [label, b] of boxes) for (let t = 0; t < 2; t += 1) {
    for (const [pid, l] of [...b.players[t].entries(), ["TEAM", b.team[t]]]) {
      for (const k of BOX_KEYS) if (!isNN(l[k])) v.push(`P4: ${label} ${pid} ${k} not a non-negative integer`);
      if (!(l.threePm <= l.threePa && l.threePa <= l.fga)) v.push(`P4: ${label} ${pid} 3PM ${l.threePm} ≤ 3PA ${l.threePa} ≤ FGA ${l.fga} fails`);
      if (!(l.threePm <= l.fgm && l.fgm <= l.fga)) v.push(`P4: ${label} ${pid} 3PM ≤ FGM ≤ FGA fails`);
      if (!(l.ftm <= l.fta)) v.push(`P4: ${label} ${pid} FTM > FTA`);
      if (l.pts !== 2 * l.fgm + l.threePm + l.ftm) v.push(`P4: ${label} ${pid} PTS ≠ 2·FGM + 3PM + FTM`);
      if (l.reb !== l.oreb + l.dreb) v.push(`P4: ${label} ${pid} REB ≠ OREB + DREB`);
      if (pid !== "TEAM" && l.ds === 0 && BOX_KEYS.some((k) => l[k] !== 0)) v.push(`P5: ${label} ${pid} has 0 seconds but a stat`);
    }
    const T = b.team[t], O = b.team[1 - t];
    if (T.ast > T.fgm) v.push(`P5: ${label} team ${t} AST > FGM`);
    if (T.stl > O.tov) v.push(`P5: ${label} team ${t} STL > opponent TOV`);
    if (T.blk > O.fga - O.fgm) v.push(`P5: ${label} team ${t} BLK > opponent missed FGA`);
  }
  // P6
  if (draw.final?.[0] === draw.final?.[1]) v.push("P6: final tied");
  let ch = 0, cA = 0;
  for (let p = 0; p < box.periods[0].length; p += 1) {
    if (p >= 4 && ch !== cA) v.push(`P6: period ${p + 1} played after a decided period ${p}`);
    ch += box.periods[0][p]; cA += box.periods[1][p];
  }
  // P11
  if (draw.box) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const ser = (b) => ({ team: b.team, periods: b.periods, final: b.final, players: b.players.map((m) => [...m.entries()]) });
    if (!same(ser(draw.box), ser(box))) v.push("P11: draw.box is not the fold of the event log");
  } else v.push("P11: draw has no box");
  if (draw.ledger) {
    for (let t = 0; t < 2; t += 1) rosters[t].forEach((pid, j) => {
      const a = box.players[t].get(String(pid)), b = draw.ledger[t][j];
      for (const k of ["ds", ...BOX_KEYS]) if (a?.[k] !== b?.[k]) v.push(`P11: ${pid} ${k} fold ${a?.[k]} ≠ engine ledger ${b?.[k]}`);
    });
  } else v.push("P11: draw has no ledger");
  return v;
}
