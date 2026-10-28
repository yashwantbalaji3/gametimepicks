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
import { captionsFor } from "./captions.mjs";

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
  const captions = captionsFor.nflPregame(m);
  return {
    ...base(m, extra), postId: `${date}:NFL:pregame:${m.eventId}${V2}`, slotId, date, sport: "NFL", kind: "pregame-forecast", format: "pregame-winner",
    title: `${m.away.abbr} @ ${m.home.abbr}: ${m.winnerLabel}`, eventId: m.eventId, priority, winnerLabel: m.winnerLabel,
    startUtc: verification.kickoffUtc ?? null,
    status: verification.status, reasons: verification.reasons, verification, numbers: verification.version?.numbers ?? null, claims, captions,
  };
}

/** NFL Format B — never approvable without the founder's recorded availability confirmation. */
export function nflTouchdownsPackage({ date, m, extra, slotId = "standing:nfl-td", priority = 1 }) {
  const r = ref0(m);
  const claims = [claim("kickoff", m.kickoffLine, r), claim("frozenAt", m.frozenLine, r),
    claim("format", TERMS.topTd, "render/social-v2.mjs TERMS"),
    ...m.candidates.map((c) => claim(`cand.${c.rank}`, `${c.rank}. ${c.name} ${c.team} ${c.probabilityDisplay}`, r))];
  const captions = captionsFor.nflTouchdowns(m);
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
  const captions = captionsFor.nflTop5(m);
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
  const captions = captionsFor.nflPostgame(m);
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
  const captions = captionsFor.nbaPregame(m);
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
  const captions = captionsFor.nbaPlayers(m);
  const fresh = laneDate === date;
  return {
    ...base(m, extra), postId: `${date}:NBA:players:${m.eventId}${V2}`, slotId: "standing:nba-players", date, sport: "NBA", kind: "nba-players", format: "nba-players",
    title: `${m.away.abbr} @ ${m.home.abbr}: projected stat lines`, eventId: m.eventId, priority, tipUtc: m.tipUtc, laneDate,
    // who the caption features, and why (internal: a caption highlight is not a model ranking)
    featured: m.featured.map((f) => ({ team: f.team, name: f.player?.name ?? null, id: f.player?.id ?? null, basis: f.basis })),
    playersKey: [...m.awayPlayers, ...m.homePlayers].map((p) => `${p.id}:${p.pts}/${p.reb}/${p.ast}`).join("|"),
    status: fresh ? POST_STATUS.READY : POST_STATUS.BLOCKED, reasons: fresh ? [] : [`the NBA public lane at the data commit is for ${laneDate}, not ${date}`], claims, captions, noForecastClaims: true,
  };
}

/** How long before tip-off an NBA game post is scheduled (founder 2026-10-28). */
export const NBA_GAME_LEAD_MIN = 45;

/**
 * NBA game post — ONE X post per game carrying both verified graphics (Predicted Winner first, projected stat lines
 * second) and one caption. Built only from the two packages already built for that game, so every number and the
 * winner are theirs; it is READY only when both are. The approval fingerprint binds both images (mediaSetSha256).
 */
export function nbaGamePackage({ date, pre, players, extra, laneDate, priority = 0 }) {
  const both = [pre, players];
  const blocked = both.filter((p) => p.status !== POST_STATUS.READY);
  const mediaSet = both.every((p) => p.media) ? both.map((p) => ({ file: p.media.file, sha256: p.media.sha256, width: p.media.width, height: p.media.height, format: p.format, altText: p.media.altText })) : null;
  const reasons = [...blocked.flatMap((p) => p.reasons.map((r) => `${p.format}: ${r}`)), ...(mediaSet ? [] : ["both graphics are needed for a game post"])];
  const tip = Date.parse(players.tipUtc);
  return {
    ...base(players.model, extra), preModel: pre.model,
    postId: `${date}:NBA:game:${players.eventId}${V2}`, slotId: "standing:nba-game", date, sport: "NBA", kind: "nba-game", format: "nba-game",
    title: `${players.model.away.abbr} @ ${players.model.home.abbr}: game post (Predicted Winner + projected stat lines)`, eventId: players.eventId, priority,
    tipUtc: players.tipUtc, laneDate, favoured: pre.favoured, playersKey: players.playersKey, featured: players.featured,
    featuredKey: players.featured.map((f) => `${f.team}:${f.id ?? "-"}`).join("|"),
    suggestedPublishAt: Number.isFinite(tip) ? new Date(tip - NBA_GAME_LEAD_MIN * 60_000).toISOString() : null,
    media: mediaSet ? pre.media : null, mediaSet,
    evidence: [...(pre.evidence ?? []), ...(players.evidence ?? [])].filter((e, i, a) => a.findIndex((x) => x.ref === e.ref) === i),
    status: reasons.length ? POST_STATUS.BLOCKED : POST_STATUS.READY, reasons,
    claims: [...pre.claims, ...players.claims], captions: captionsFor.nbaGame({ pre: pre.model, players: players.model }), noForecastClaims: true,
  };
}

/** NBA final score — the write-once finals record. */
export function nbaFinalPackage({ date, m, extra, priority = 2 }) {
  const r = ref0(m);
  const claims = [claim("final.away", `${m.away.name} ${m.finalAway}`, r), claim("final.home", `${m.home.name} ${m.finalHome}`, r), claim("date", m.dateLine, r)];
  const w = m.winner === "home" ? m.home : m.away;
  const captions = captionsFor.nbaFinal(m);
  return {
    ...base(m, extra), postId: `${date}:NBA:final:${m.eventId}${V2}`, slotId: "standing:nba-final", date, sport: "NBA", kind: "nba-final", format: "nba-final",
    title: `${m.away.abbr} ${m.finalAway} @ ${m.home.abbr} ${m.finalHome}: final`, eventId: m.eventId, priority,
    status: POST_STATUS.READY, reasons: [], claims, captions, noForecastClaims: true,
  };
}
