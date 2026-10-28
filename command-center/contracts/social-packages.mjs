/**
 * V2.1 POST PACKAGES — a verified social view-model (recap/social-v2.mjs) → a D1 post package: evidence claims, captions
 * in the approved public terms (render/social-v2.mjs TERMS), status, and the template + asset-manifest versions that the
 * approval fingerprint binds (contracts/post-queue.mjs publishBundleOf).
 *
 * Post ids are versioned: `<base>@v2`. The base (date · sport · kind · subject) is what de-duplication, supersession and
 * "already decided" work on, so a V2.1 package never re-proposes a post decided as V1, and an undecided V1 package is
 * superseded by its V2.1 successor. Historical V1 packages and approvals stay as they are.
 *
 * Every caption is assembled only from claim display strings and still passes checkCaption (numbers traceable, no
 * forbidden words, no links, ≤ 280, misses stated). Nothing here reads the clock or the network.
 */
import { POST_STATUS } from "./post-queue.mjs";
import { TERMS } from "../render/social-v2.mjs";

export const V2 = "@v2";
export const baseIdOf = (postId) => String(postId).replace(/@v\d+$/, "");
const claim = (key, display, evidenceRef) => ({ key, display: String(display), evidenceRef });
const ref0 = (m) => m.evidence?.[0]?.ref ?? null;
/** Join list items into one caption that fits 280, dropping trailing items (never truncating one). */
function fit(head, items, tail, sep = " · ") {
  for (let n = items.length; n >= 1; n--) {
    const t = `${head}${items.slice(0, n).join(sep)}${tail}`;
    if (t.length <= 280) return t;
  }
  return `${head}${tail}`.slice(0, 280);
}
const base = (m, extra) => ({ template: extra.template, assetManifest: extra.assetManifest, dataCommit: extra.dataCommit, label: extra.label, model: m, evidence: m.evidence ?? [] });

/** NFL Format A — kind "pregame-forecast", so D1's freeze-time verifier re-checks it at approval and publication. */
export function nflPregamePackage({ date, m, verification, extra, slotId = "standing:nfl-pregame", priority = 1 }) {
  const r = ref0(m);
  const claims = [
    claim("kickoff", m.kickoffLine, r), claim("frozenAt", m.frozenLine, r),
    claim("winProbability", m.winProbabilityDisplay, r), claim("predictedWinner", m.favouredTeam.name, r),
  ];
  const fav = m.favouredTeam;
  const captions = [
    { id: "A", tone: "prediction", text: `${TERMS.prediction} · ${m.away.nickname} at ${m.home.nickname}, ${m.kickoffLine}. ${TERMS.predictedWinner}: ${fav.name}, ${m.winProbabilityDisplay} ${TERMS.winProbability}. Latest published prediction (frozen ${m.frozenLine}). Not betting advice.` },
    { id: "B", tone: "short", text: `${fav.nickname} ${m.winProbabilityDisplay} to win ${m.away.abbr} @ ${m.home.abbr}. Our latest published prediction, graded in public after the final.` },
  ];
  return {
    ...base(m, extra), postId: `${date}:NFL:pregame:${m.eventId}${V2}`, slotId, date, sport: "NFL", kind: "pregame-forecast", format: "pregame-winner",
    title: `${m.away.abbr} @ ${m.home.abbr}: ${TERMS.predictedWinner}`, eventId: m.eventId, priority,
    status: verification.status, reasons: verification.reasons, verification, numbers: verification.version?.numbers ?? null, claims, captions,
  };
}

/** NFL Format B — never approvable without the founder's recorded availability confirmation. */
export function nflTouchdownsPackage({ date, m, extra, slotId = "standing:nfl-td", priority = 1 }) {
  const r = ref0(m);
  const claims = [claim("kickoff", m.kickoffLine, r), claim("frozenAt", m.frozenLine, r),
    claim("format", TERMS.topTd, "render/social-v2.mjs TERMS"),
    ...m.candidates.map((c) => claim(`cand.${c.rank}`, `${c.rank}. ${c.name} ${c.team} ${c.probabilityDisplay}`, r))];
  const items = m.candidates.map((c) => `${c.rank}. ${c.name} ${c.probabilityDisplay}`);
  const captions = [
    { id: "A", tone: "list", text: fit(`${TERMS.topTd} · ${m.away.abbr} @ ${m.home.abbr}: `, items, `. Chance to score if he plays, not a guarantee.`) },
    { id: "B", tone: "lead", text: `${m.candidates[0].name} leads our ${TERMS.topTd} for ${m.away.abbr} @ ${m.home.abbr} at ${m.candidates[0].probabilityDisplay}, if he plays. Not a guarantee.` },
  ];
  const reasons = ["confirm each player's availability before approving: no source positively confirms a game-day role (board: role uncertain)", ...(m.reasons ?? [])];
  return {
    ...base(m, extra), postId: `${date}:NFL:td-top3:${m.eventId}${V2}`, slotId, date, sport: "NFL", kind: "td-top3", format: "touchdowns",
    title: `${m.away.abbr} @ ${m.home.abbr}: ${TERMS.topTd}`, eventId: m.eventId, priority, kickoffUtc: m.kickoff,
    candidatesKey: m.candidates.map((c) => `${c.id}:${c.probabilityDisplay}`).join("|"),
    status: POST_STATUS.VERIFY, reasons, claims, captions,
  };
}

/** NFL Top 5 board — exactly the frozen public Top Board rows. */
export function nflTop5Package({ date, m, extra, priority = 1 }) {
  const r = ref0(m);
  const claims = [claim("slate", m.slateLine, r), claim("frozenAt", m.frozenLine, r),
    claim("format", m.isTd ? TERMS.top5Td : TERMS.top5Proj, "render/social-v2.mjs TERMS"),
    ...m.rows.map((x) => claim(`row.${x.rank}`, `${x.rank}. ${x.name} ${x.team} ${x.valueDisplay}`, r))];
  const term = m.isTd ? TERMS.top5Td : TERMS.top5Proj;
  const items = m.rows.map((x) => `${x.rank}. ${x.name} (${x.team}) ${x.valueDisplay}`);
  const captions = [
    { id: "A", tone: "list", text: fit(`${term}: ${m.title}, ${m.slateLine}. `, items, `. ${m.isTd ? "Chance to score if he plays, not a guarantee." : "Projected medians, not guarantees."}`) },
    { id: "B", tone: "lead", text: `${m.rows[0].name} tops our ${term.toLowerCase()} for ${m.title.toLowerCase()} on ${m.slateLine}: ${m.rows[0].valueDisplay}. Full top 5 on the card.` },
  ];
  return {
    ...base(m, extra), postId: `${date}:NFL:top5:${m.family}${V2}`, slotId: "standing:nfl-top5", date, sport: "NFL", kind: "top5-board", format: "top5",
    title: `${term}: ${m.title}`, priority, boardSha256: m.evidence[0]?.sha256 ?? null, firstKickoffUtc: m.firstKickoffUtc, family: m.family,
    status: m.status, reasons: m.status === "READY" ? [] : ["a listed player is QUESTIONABLE: confirm before approving"], claims, captions,
  };
}

/** NFL Format C — kind "nfl-recap" (misses must be stated). The TD section is in the graphic only when fully graded. */
export function nflPostgamePackage({ date, m, extra, slotId = "standing:nfl-postgame", priority = 2 }) {
  const r = ref0(m);
  const win = m.winner === "home" ? m.home : m.away;
  const lose = m.winner === "home" ? m.away : m.home;
  const ws = m.winner === "home" ? m.finalHome : m.finalAway;
  const ls = m.winner === "home" ? m.finalAway : m.finalHome;
  const hit = m.result === "WIN";
  const td = m.td?.complete ? m.td : null;
  const claims = [claim("final.away", `${m.away.abbr} ${m.finalAway}`, r), claim("final.home", `${m.home.abbr} ${m.finalHome}`, r),
    claim("winProbability", m.winProbabilityDisplay, r), claim("frozenAt", m.frozenLine, r),
    ...(td ? [claim("td.hits", `${td.hits} of ${td.shown}`, td.evidence?.[0]?.ref), claim("td.misses", `${td.shown - td.hits} missed`, td.evidence?.[0]?.ref), ...td.candidates.map((c) => claim(`td.${c.rank}`, `${c.name} ${c.probabilityDisplay} ${c.outcome}`, td.evidence?.[0]?.ref))] : [])];
  const verdict = m.result === "TIE" ? "Game tied." : hit ? `${TERMS.correct}.` : `${TERMS.missed}.`;
  const tdLine = td ? ` ${TERMS.topTd}: ${td.hits} of ${td.shown} scored${td.hits < td.shown ? `, ${td.shown - td.hits} missed` : ""}.` : "";
  const captions = [
    { id: "A", tone: "result", text: `Final: ${win.name} ${ws}, ${lose.name} ${ls}. Our prediction had the ${m.favouredTeam.nickname} at ${m.winProbabilityDisplay}: ${verdict}${tdLine}` },
    { id: "B", tone: "short", text: `${TERMS.vsFinal}: ${m.away.abbr} ${m.finalAway}, ${m.home.abbr} ${m.finalHome}. ${TERMS.predictedWinner} ${m.favouredTeam.abbr} (${m.winProbabilityDisplay}) — ${verdict}${td ? ` TD: ${td.hits} of ${td.shown} scored${td.hits < td.shown ? `, ${td.shown - td.hits} missed` : ""}.` : ""} Graded in public.` },
  ];
  return {
    ...base(m, extra), postId: `${date}:NFL:recap:${m.eventId}${V2}`, slotId, date, sport: "NFL", kind: "nfl-recap", format: "postgame",
    title: `${m.away.abbr} ${m.finalAway} @ ${m.home.abbr} ${m.finalHome}: ${m.result === "TIE" ? "tie" : hit ? TERMS.correct : TERMS.missed}`, eventId: m.eventId, priority,
    status: POST_STATUS.READY, reasons: [...(m.td && !m.td.complete ? ["TD section left off: the published top three are not all graded yet"] : []), ...(m.tdUnavailable ? [`no TD section: ${m.tdUnavailable}`] : [])],
    // a tie is not a miss (nothing to grade); a loss or any TD miss is
    hasMiss: m.result === "LOSS" || Boolean(td && td.hits < td.shown), claims, captions,
  };
}

/** NBA pregame — predicted winner only; no probability is published for NBA. */
export function nbaPregamePackage({ date, m, extra, laneDate, priority = 1 }) {
  const r = ref0(m);
  const claims = [claim("tip", m.tipLine, r), claim("predictedWinner", m.favouredTeam.name, r), claim("frozenAt", m.frozenShort, r)];
  const captions = [
    { id: "A", tone: "prediction", text: `${TERMS.prediction} · ${m.away.name} at ${m.home.name}, ${m.tipLine}. ${TERMS.predictedWinner}: ${m.favouredTeam.name}. Not betting advice.` },
    { id: "B", tone: "short", text: `${m.away.abbr} @ ${m.home.abbr} tonight: our ${TERMS.predictedWinner.toLowerCase()} is the ${m.favouredTeam.nickname}.` },
  ];
  const fresh = laneDate === date;
  return {
    ...base(m, extra), postId: `${date}:NBA:pregame:${m.eventId}${V2}`, slotId: "standing:nba-pregame", date, sport: "NBA", kind: "nba-pregame", format: "nba-pregame",
    title: `${m.away.abbr} @ ${m.home.abbr}: ${TERMS.predictedWinner}`, eventId: m.eventId, priority, tipUtc: m.tipUtc, favoured: m.favouredTeam.abbr, laneDate,
    status: fresh ? POST_STATUS.READY : POST_STATUS.BLOCKED, reasons: fresh ? [] : [`the NBA public lane at the data commit is for ${laneDate}, not ${date}`], claims, captions, noForecastClaims: true,
  };
}

/** NBA per-game projected stat lines — medians as published, never ranked. */
export function nbaPlayersPackage({ date, m, extra, laneDate, priority = 1 }) {
  const r = ref0(m);
  const line = (p) => `${p.name} ${p.pts}/${p.reb}/${p.ast}`;
  const claims = [claim("tip", m.tipLine, r), ...[...m.awayPlayers, ...m.homePlayers].map((p) => claim(`p.${p.id}`, line(p), r))];
  const captions = [
    { id: "A", tone: "lines", text: fit(`Projected stat lines (PTS/REB/AST medians) · ${m.away.abbr} @ ${m.home.abbr}: `, [...m.awayPlayers.slice(0, 2), ...m.homePlayers.slice(0, 2)].map(line), `. Players as published, not a ranking.`) },
  ];
  const fresh = laneDate === date;
  return {
    ...base(m, extra), postId: `${date}:NBA:players:${m.eventId}${V2}`, slotId: "standing:nba-players", date, sport: "NBA", kind: "nba-players", format: "nba-players",
    title: `${m.away.abbr} @ ${m.home.abbr}: projected stat lines`, eventId: m.eventId, priority, tipUtc: m.tipUtc, laneDate,
    playersKey: [...m.awayPlayers, ...m.homePlayers].map((p) => `${p.id}:${p.pts}/${p.reb}/${p.ast}`).join("|"),
    status: fresh ? POST_STATUS.READY : POST_STATUS.BLOCKED, reasons: fresh ? [] : [`the NBA public lane at the data commit is for ${laneDate}, not ${date}`], claims, captions, noForecastClaims: true,
  };
}

/** NBA final score — the write-once finals record. */
export function nbaFinalPackage({ date, m, extra, priority = 2 }) {
  const r = ref0(m);
  const claims = [claim("final.away", `${m.away.name} ${m.finalAway}`, r), claim("final.home", `${m.home.name} ${m.finalHome}`, r), claim("date", m.dateLine, r)];
  const w = m.winner === "home" ? m.home : m.away;
  const captions = [
    { id: "A", tone: "result", text: `Final: ${m.away.name} ${m.finalAway}, ${m.home.name} ${m.finalHome}. The ${w.nickname} win it.` },
  ];
  return {
    ...base(m, extra), postId: `${date}:NBA:final:${m.eventId}${V2}`, slotId: "standing:nba-final", date, sport: "NBA", kind: "nba-final", format: "nba-final",
    title: `${m.away.abbr} ${m.finalAway} @ ${m.home.abbr} ${m.finalHome}: final`, eventId: m.eventId, priority,
    status: POST_STATUS.READY, reasons: [], claims, captions, noForecastClaims: true,
  };
}
