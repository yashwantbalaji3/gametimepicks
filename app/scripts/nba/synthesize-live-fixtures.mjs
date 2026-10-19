#!/usr/bin/env node
/**
 * Derive the SYNTHETIC NBA live fixtures from the two RECORDED ones, deterministically.
 *
 * No in-progress NBA game existed when the adapter was built (2026-10-19, between preseason and opening
 * night), so in-progress / halftime / end-of-period / overtime / regression payloads are produced by
 * MINIMALLY editing the recorded completed game 401898719 (DEN @ LAL). Every edit is listed in the
 * provenance sidecar `nba-fixtures.provenance.json`, which marks each output `synthetic: true`.
 *
 * Usage (from app/):  node scripts/nba/synthesize-live-fixtures.mjs
 * Re-running rewrites the same bytes — the outputs are a pure function of the recorded fixtures.
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DIR = path.join(APP, "src/lib/live/fixtures");
const read = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8"));
const write = (n, o) => fs.writeFileSync(path.join(DIR, n), JSON.stringify(o, null, 1) + "\n");
const clone = (o) => JSON.parse(JSON.stringify(o));

const SB = "nba-scoreboard-final.json";
const SUM = "nba-summary-final.json";
const sbFinal = read(SB);
const sumFinal = read(SUM);

const ORD = ["", "1st", "2nd", "3rd", "4th"];
function status({ name, state, period, clock, detail }) {
  const completed = state === "post";
  return {
    clock: 0,
    displayClock: clock,
    period,
    type: { id: name === "STATUS_FINAL" ? "3" : name === "STATUS_SCHEDULED" ? "1" : "2", name, state, completed, description: detail, detail, shortDetail: detail },
  };
}
/** Replace status + scores + linescores on every place the payload states them. */
function editScoreboard({ st, home, away, note }) {
  const p = clone(sbFinal);
  p._note = note;
  const e = p.events[0];
  e.status = st;
  const c = e.competitions[0];
  c.status = st;
  for (const comp of c.competitors) {
    const side = comp.homeAway === "home" ? home : away;
    if (side === null) {
      delete comp.score;
      delete comp.linescores;
      delete comp.winner;
      continue;
    }
    comp.score = String(side.reduce((s, x) => s + x, 0));
    comp.linescores = side.map((v, i) => ({ value: v, displayValue: String(v), period: i + 1 }));
    if (st.type.state !== "post") delete comp.winner;
  }
  return p;
}

// Real per-quarter points (recorded): LAL 22 33 28 23 = 106 · DEN 36 26 26 33 = 121.
const outputs = [];
const add = (file, obj, derivedFrom, edits) => {
  write(file, obj);
  outputs.push({ file, synthetic: true, derivedFrom, edits });
};

add(
  "nba-scoreboard-endq1-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_END_PERIOD", state: "in", period: 1, clock: "0.0", detail: "End of 1st Quarter" }), home: [22], away: [36], note: "SYNTHETIC — recorded 401898719 scoreboard with status → STATUS_END_PERIOD (period 1) and scores/linescores truncated to the real Q1 (22-36)." }),
  SB,
  ["status → STATUS_END_PERIOD / in / period 1 / displayClock 0.0", "scores + linescores truncated to real Q1 values", "winner flag removed"],
);
add(
  "nba-scoreboard-halftime-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_HALFTIME", state: "in", period: 2, clock: "0.0", detail: "Halftime" }), home: [22, 33], away: [36, 26], note: "SYNTHETIC — recorded 401898719 scoreboard with status → STATUS_HALFTIME and scores/linescores truncated to the real first half (55-62)." }),
  SB,
  ["status → STATUS_HALFTIME / in / period 2", "scores + linescores truncated to real Q1–Q2 values", "winner flag removed"],
);
add(
  "nba-scoreboard-live-q3-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_IN_PROGRESS", state: "in", period: 3, clock: "5:42", detail: `5:42 - ${ORD[3]} Quarter` }), home: [22, 33, 15], away: [36, 26, 14], note: "SYNTHETIC — recorded 401898719 scoreboard with status → STATUS_IN_PROGRESS Q3 5:42; Q3 partial points 15/14 invented (70-76)." }),
  SB,
  ["status → STATUS_IN_PROGRESS / in / period 3 / displayClock 5:42", "linescores: real Q1–Q2 + INVENTED partial Q3 (15, 14)", "winner flag removed"],
);
add(
  "nba-scoreboard-regress-score-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_IN_PROGRESS", state: "in", period: 3, clock: "4:58", detail: `4:58 - ${ORD[3]} Quarter` }), home: [22, 33, 13], away: [36, 26, 14], note: "SYNTHETIC — the live-q3 fixture 44 s later with the HOME score LOWER (70 → 68): a provider score regression." }),
  "nba-scoreboard-live-q3-synthetic.json",
  ["as live-q3 but displayClock 4:58", "home Q3 partial 15 → 13 so the home score DECREASES 70 → 68"],
);
add(
  "nba-scoreboard-regress-pregame-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_SCHEDULED", state: "pre", period: 0, clock: "0.0", detail: "Fri, October 16th at 10:30 PM EDT" }), home: null, away: null, note: "SYNTHETIC — a later poll of an in-progress game answering STATUS_SCHEDULED with no scores: a provider lifecycle regression (LIVE → PREGAME)." }),
  SB,
  ["status → STATUS_SCHEDULED / pre / period 0", "scores, linescores and winner flags removed"],
);
add(
  "nba-scoreboard-live-ot-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_IN_PROGRESS", state: "in", period: 5, clock: "2:31", detail: "2:31 - OT" }), home: [22, 33, 28, 23, 4], away: [36, 26, 26, 18, 6], note: "SYNTHETIC — overtime: DEN Q4 33 → 18 so regulation ends tied 106-106, then an INVENTED partial OT (4-6), period 5, 2:31." }),
  SB,
  ["status → STATUS_IN_PROGRESS / in / period 5 / displayClock 2:31 / detail '2:31 - OT'", "away Q4 33 → 18 (regulation tie 106-106)", "INVENTED OT linescore 4 / 6", "winner flag removed"],
);
add(
  "nba-scoreboard-final-ot-synthetic.json",
  editScoreboard({ st: status({ name: "STATUS_FINAL", state: "post", period: 5, clock: "0.0", detail: "Final/OT" }), home: [22, 33, 28, 23, 9], away: [36, 26, 26, 18, 11], note: "SYNTHETIC — the live-ot fixture finished: STATUS_FINAL 'Final/OT', period 5, 115-117. Not in the finals record (which holds the REAL 106-121), so it can never be canonical." }),
  "nba-scoreboard-live-ot-synthetic.json",
  ["status → STATUS_FINAL / post / period 5 / detail 'Final/OT'", "INVENTED OT linescore 9 / 11 → 115-117"],
);

/* The live summary: header → in-progress Q3, and a box where some players have not yet appeared. */
{
  const p = clone(sumFinal);
  p._note = "SYNTHETIC — recorded 401898719 summary edited to an in-progress Q3: header status/scores as nba-scoreboard-live-q3-synthetic.json; four bench players who really played are reset to 'not yet appeared' (stats []), one row has MIN '--' with zero-filled cells (ESPN's absent-row quirk), and Nikola Jokic's 3PT cell is '--'. All other box values are the REAL final values, unedited.";
  const c = p.header.competitions[0];
  c.status = { type: { id: "2", name: "STATUS_IN_PROGRESS", state: "in", completed: false, description: "5:42 - 3rd Quarter", detail: "5:42 - 3rd Quarter", shortDetail: "5:42 - 3rd Quarter" }, period: 3, displayClock: "5:42" };
  for (const comp of c.competitors) {
    const ls = comp.homeAway === "home" ? [22, 33, 15] : [36, 26, 14];
    comp.score = String(ls.reduce((s, x) => s + x, 0));
    comp.linescores = ls.map((v) => ({ displayValue: String(v) }));
    delete comp.winner;
  }
  const notYet = new Set(["Cam Whitmore", "Bryce Hopkins", "Chris Manon", "Rafael Castro"]);
  for (const block of p.boxscore.players) {
    for (const a of block.statistics[0].athletes) {
      const n = a.athlete.displayName;
      if (notYet.has(n)) a.stats = [];
      if (n === "Jaden Hardy") a.stats = ["--", "0", "0-0", "0-0", "0-0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
      if (n === "Nikola Jokic") a.stats[3] = "--";
    }
  }
  add("nba-summary-live-q3-synthetic.json", p, SUM, [
    "header status → STATUS_IN_PROGRESS Q3 5:42; scores/linescores as live-q3 scoreboard",
    "Cam Whitmore, Bryce Hopkins (DEN), Chris Manon, Rafael Castro (LAL): stats → [] with didNotPlay false (not yet appeared)",
    "Jaden Hardy: MIN '--' with every other cell zero-filled (ESPN absent-row quirk)",
    "Nikola Jokic: 3PT cell → '--' (a blank cell on a player who has appeared)",
    "every other athlete row: REAL final values, unedited",
  ]);
}
/* A summary whose box columns moved — the parser must fail closed. */
{
  const p = clone(sumFinal);
  p._note = "SYNTHETIC — recorded 401898719 summary with the PTS and REB labels swapped on the first team block: a moved column must fail closed.";
  const g = p.boxscore.players[0].statistics[0];
  [g.labels[1], g.labels[5]] = [g.labels[5], g.labels[1]];
  add("nba-summary-labels-moved-synthetic.json", p, SUM, ["first team block: labels[1] (PTS) ⇄ labels[5] (REB)"]);
}

const provenance = {
  _note: "Provenance for every NBA live fixture. REAL = sanitized recorded ESPN payload (only fields the adapter reads kept). SYNTHETIC = derived from a real one by scripts/nba/synthesize-live-fixtures.mjs; edits listed.",
  recordedAt: "2026-10-19T05:10:46Z",
  real: [
    { file: "nba-scoreboard-opening-pre.json", synthetic: false, source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261020", events: ["401909088", "401909089", "401909090"], state: "STATUS_SCHEDULED ×3" },
    { file: "nba-summary-opening-pre.json", synthetic: false, source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909088", state: "STATUS_SCHEDULED, no boxscore.players" },
    { file: "nba-scoreboard-final.json", synthetic: false, source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261016", events: ["401898719"], state: "STATUS_FINAL 106-121 (2026 preseason)" },
    { file: "nba-summary-final.json", synthetic: false, source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401898719", state: "STATUS_FINAL, 44 athlete rows incl. 19 DNP" },
    { file: "nba-frozen-projection-401898719.json", synthetic: false, source: "data/internal/research/nba/experimental-v0.1/forecasts/2026-10-16.json", state: "EXCERPT: 6 of 28 players, frozen before tip" },
  ],
  synthetic: outputs,
};
write("nba-fixtures.provenance.json", provenance);
console.log(`wrote ${outputs.length} synthetic fixtures + provenance`);
