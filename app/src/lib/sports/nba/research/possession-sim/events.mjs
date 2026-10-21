/**
 * nba-possession-sim-v0 · EVENT LOG VOCABULARY + THE FOLD. PURE, no I/O.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * The box score a draw emits is DEFINED as foldEvents(events): nothing else writes it. The engine also keeps its own
 * running ledger while it simulates (a separate code path), and the invariant checker requires fold === ledger.
 *
 * Event (one object per line of the log; integer clock in DECISECONDS remaining in the period):
 *   { i, q, c, type, poss, team?, player?, ..., s: [home, away] }
 *   i      sequence number (0, 1, 2, … no gaps)
 *   q      period (1–4 regulation, 5+ overtime)
 *   c      clock remaining in the period, deciseconds (7200 at a regulation start, 3000 at an OT start)
 *   poss   team index in possession when the event happened (0 = home, 1 = away)
 *   team   acting team index (shooter's / rebounder's / fouler's / turnover's team)
 *   s      score AFTER the event [home, away]
 * Types and their extra fields:
 *   period_start { lineups: [[5 ids], [5 ids]] }          period_end {}            game_end { final: [h, a] }
 *   jump_ball    { team: winner }
 *   sub          { team, in, out }
 *   shot         { team, player, value: 2|3, made, assist: id|null, block: id|null }
 *   free_throw   { team, player, made, n, of }
 *   rebound      { team, player: id|null (null = team rebound), kind: "offensive"|"defensive" }
 *   turnover     { team, player, steal: id|null }
 *   foul         { team (fouling team), player (fouler), on: id|null, kind: "shooting"|"and_one"|"personal"|"late_intentional", fouledOut: boolean }
 * providerAthleteId strings are the only player identifiers in the log.
 */
export const EVENT_TYPES = Object.freeze(["period_start", "period_end", "game_end", "jump_ball", "sub", "shot", "free_throw", "rebound", "turnover", "foul"]);
export const BOX_KEYS = Object.freeze(["pts", "fgm", "fga", "threePm", "threePa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf"]);
export const REG_PERIOD_DS = 7200;
export const OT_PERIOD_DS = 3000;
export const periodLengthDs = (q) => (q <= 4 ? REG_PERIOD_DS : OT_PERIOD_DS);

/** "mm:ss" (or "s.t" under a minute) — display only. */
export function formatClock(ds) {
  if (ds < 600) return `${Math.floor(ds / 10)}.${ds % 10}`;
  const s = Math.floor(ds / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const emptyLine = () => ({ ds: 0, ...Object.fromEntries(BOX_KEYS.map((k) => [k, 0])) });

/**
 * Fold an event log into the box score. `rosters` = [[ids home], [ids away]] (every simulated player gets a line,
 * zeros included). Throws on an event naming a player outside the rosters (the checker reports it as P3).
 * @returns {{ players: [Map<id, line>, Map<id, line>], team: [object, object], periods: [number[], number[]], teamRebounds: [n, n], final: [h, a], overtimePeriods }}
 */
export function foldEvents(events, rosters) {
  const players = rosters.map((ids) => new Map(ids.map((id) => [String(id), emptyLine()])));
  const periods = [[], []];
  const teamRebounds = [0, 0];
  const on = [new Set(), new Set()];
  let clock = 0, q = 0;
  const line = (t, id) => {
    const l = players[t].get(String(id));
    if (!l) throw new Error(`fold: player ${id} not on team ${t} roster`);
    return l;
  };
  const credit = (c) => {
    const dt = clock - c;
    if (dt > 0) for (let t = 0; t < 2; t += 1) for (const id of on[t]) line(t, id).ds += dt;
    clock = c;
  };
  const add = (t, pts) => { periods[t][q - 1] += pts; };
  for (const e of events) {
    switch (e.type) {
      case "period_start":
        q = e.q; clock = e.c; periods[0][q - 1] = 0; periods[1][q - 1] = 0;
        for (let t = 0; t < 2; t += 1) on[t] = new Set(e.lineups[t].map(String));
        break;
      case "sub":
        credit(e.c); on[e.team].delete(String(e.out)); on[e.team].add(String(e.in));
        break;
      case "shot": {
        credit(e.c);
        const l = line(e.team, e.player);
        l.fga += 1; if (e.value === 3) l.threePa += 1;
        if (e.made) { l.fgm += 1; if (e.value === 3) l.threePm += 1; l.pts += e.value; add(e.team, e.value); if (e.assist != null) line(e.team, e.assist).ast += 1; }
        if (e.block != null) line(1 - e.team, e.block).blk += 1;
        break;
      }
      case "free_throw": {
        credit(e.c);
        const l = line(e.team, e.player);
        l.fta += 1; if (e.made) { l.ftm += 1; l.pts += 1; add(e.team, 1); }
        break;
      }
      case "rebound":
        credit(e.c);
        if (e.player == null) teamRebounds[e.team] += 1;
        else { const l = line(e.team, e.player); l.reb += 1; if (e.kind === "offensive") l.oreb += 1; else l.dreb += 1; }
        break;
      case "turnover":
        credit(e.c);
        line(e.team, e.player).tov += 1;
        if (e.steal != null) line(1 - e.team, e.steal).stl += 1;
        break;
      case "foul":
        credit(e.c); line(e.team, e.player).pf += 1;
        break;
      case "period_end":
        credit(e.c);
        break;
      case "jump_ball": case "game_end":
        break;
      default:
        throw new Error(`fold: unknown event type ${e.type}`);
    }
  }
  const team = players.map((m, t) => {
    const s = emptyLine();
    for (const l of m.values()) for (const k of ["ds", ...BOX_KEYS]) s[k] += l[k];
    s.teamRebounds = teamRebounds[t];
    return s;
  });
  const final = [periods[0].reduce((a, b) => a + b, 0), periods[1].reduce((a, b) => a + b, 0)];
  return { players, team, periods, teamRebounds, final, overtimePeriods: Math.max(0, periods[0].length - 4) };
}

/** A fold as plain JSON (minutes to 0.1 s precision shown as decimal minutes, plus the exact deciseconds). */
export function boxToJson(box) {
  const side = (t) => [...box.players[t].entries()].map(([id, l]) => ({ providerAthleteId: id, min: Number((l.ds / 600).toFixed(2)), ds: l.ds, ...Object.fromEntries(BOX_KEYS.map((k) => [k, l[k]])) }));
  const lab = (i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`);
  return {
    final: { home: box.final[0], away: box.final[1] }, overtimePeriods: box.overtimePeriods,
    linescore: box.periods[0].map((h, i) => ({ period: i + 1, label: lab(i), home: h, away: box.periods[1][i] })),
    team: { home: { ...box.team[0] }, away: { ...box.team[1] } },
    players: { home: side(0), away: side(1) },
  };
}
