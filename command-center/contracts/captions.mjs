/**
 * EDITORIAL CAPTIONS (V2.2, founder 2026-10-28) — one GameTimePicks voice across sports: a natural matchup line, the
 * one thing the post is about, a light prompt; short paragraphs with real line breaks; emojis sparingly; no hashtags.
 *
 * Every caption is built only from the package's verified view-model, so each number is one of its claims and
 * checkCaption still enforces traceable numbers, no betting words, misses stated and X's weighted 280 limit. Each
 * format has two voices; which one is caption A rotates deterministically per game (stable on rebuild, varied across a
 * slate), and the founder can pick either. Nothing here reads the clock.
 */
const SHARED_CITY = new Set(["Los Angeles", "LA", "New York"]);
/** "Green Bay" / "Boston" — or "the Rams" / "the Clippers" where a city has two teams in the league. */
export const placeOf = (t) => (!t.city || SHARED_CITY.has(t.city) ? `the ${t.nickname}` : t.city);
const rotate = (seed, list) => {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = h % list.length;
  return [...list.slice(i), ...list.slice(0, i)].map((c, k) => ({ ...c, id: "AB"[k] ?? `V${k}` }));
};
const ET = (iso, opts) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts }).format(new Date(iso));
/** "Thursday Night Football" / "Sunday Night Football" / "Monday Night Football" / "Sunday" — from the kickoff itself. */
export function nflSlot(kickoffUtc, week = null) {
  const day = ET(kickoffUtc, { weekday: "long" });
  const hour = Number(ET(kickoffUtc, { hour: "numeric", hourCycle: "h23" }));
  // Branded windows only where they are unambiguous: not Thanksgiving night (4th Thursday of November) and not the
  // Week 1 kickoff game; otherwise the plain weekday ("Thursday night").
  const dom = Number(ET(kickoffUtc, { day: "numeric" }));
  const thanksgiving = day === "Thursday" && ET(kickoffUtc, { month: "numeric" }) === "11" && dom >= 22 && dom <= 28;
  if (hour >= 19 && ["Thursday", "Sunday", "Monday"].includes(day) && !thanksgiving && week !== 1) return { title: `${day} Night Football`, phrase: `on ${day} Night Football` };
  if (hour >= 19) return { title: `${day} night`, phrase: `on ${day} night` };
  return { title: day, phrase: `on ${day}` };
}
/** "tonight" for an evening tip-off, else the weekday. */
const when = (iso) => (Number(ET(iso, { hour: "numeric", hourCycle: "h23" })) >= 17 ? "tonight" : `on ${ET(iso, { weekday: "long" })}`);
const p3 = (p) => `${p.pts} PTS | ${p.reb} REB | ${p.ast} AST`;

export const captionsFor = {
  nflPregame(m) {
    const fav = m.favouredTeam;
    const slot = nflSlot(m.kickoff, m.week);
    const most = m.winnerLabel === "Most Likely Winner";
    const line = most
      ? `Our model has ${placeOf(fav)} as the most likely winner at ${m.winProbabilityDisplay}. About as close as it gets.`
      : `Our model gives ${placeOf(fav)} a ${m.winProbabilityDisplay} chance to win.`;
    return rotate(m.eventId, [
      { tone: "matchup", text: `🏈 ${m.away.nickname} vs ${m.home.nickname} ${slot.phrase}\n\n${line}\n\nWho are you taking? 👀` },
      { tone: "headline", text: `🏈 ${slot.title}: ${m.away.nickname} at ${m.home.nickname}\n\n${most ? `${fav.nickname} by a whisker: ${m.winProbabilityDisplay}, our model's most likely winner.` : `${fav.nickname} ${m.winProbabilityDisplay} to win, per our latest model prediction.`}\n\nWho's your winner? 👇` },
    ]);
  },
  nflTouchdowns(m) {
    const slot = nflSlot(m.kickoff, m.week);
    const list = m.candidates.map((c) => `${c.rank}. ${c.name} — ${c.probabilityDisplay}`).join("\n");
    const night = /Night Football/.test(slot.title);
    return rotate(m.eventId, [
      { tone: "watch", text: `🏈 ${night ? slot.title : `${m.away.nickname} at ${m.home.nickname}`} TD watch 👀\n\nOur model's top 3 anytime touchdown candidates:\n\n${list}\n\nWho's finding the end zone?` },
      { tone: "list", text: `🏈 Who scores in ${m.away.nickname} at ${m.home.nickname}?\n\nOur top 3 anytime TD candidates, if they play:\n\n${list}\n\nYour call on the end zone? 👇` },
    ]);
  },
  nflTop5(m) {
    const top3 = m.rows.slice(0, 3).map((r) => `${r.rank}. ${r.name} (${r.team}) — ${r.valueDisplay}${m.isTd ? "" : ` ${m.unitShort}`}`).join("\n");
    const what = m.isTd ? "anytime touchdown candidates" : `${m.title.toLowerCase()} projections`;
    return rotate(m.family + m.date, [
      { tone: "board", text: `🏈 ${m.dayName}'s top ${what}\n\n${top3}\n\nFull top 5 below 👇` },
      // "leads" only when #1's published value is strictly ahead of #2's (an order decided by a tie-break isn't a lead)
      m.rows[1] && m.rows[0].valueDisplay === m.rows[1].valueDisplay
        ? { tone: "leaders", text: `🏈 Our ${m.dayName} ${what}: it's tight at the top.\n\n${top3}\n\nThe full top 5 is on the board 👇` }
        : { tone: "leader", text: `🏈 ${m.rows[0].name} leads our ${m.dayName} ${what}${m.isTd ? ` at ${m.rows[0].valueDisplay}` : ""}.\n\n${top3}\n\nThe full top 5 is on the board 👇` },
    ]);
  },
  nflPostgame(m) {
    const win = m.winner === "home" ? m.home : m.away;
    const lose = m.winner === "home" ? m.away : m.home;
    const ws = m.winner === "home" ? m.finalHome : m.finalAway;
    const ls = m.winner === "home" ? m.finalAway : m.finalHome;
    const tie = m.result === "TIE";
    const hit = m.result === "WIN";
    const verdict = tie ? "the game ended in a tie, so there is no winner to grade." : hit ? "✅ Prediction Correct." : "❌ Prediction Missed.";
    const td = m.td?.complete ? m.td : null;
    const tdLine = td ? `\n\nTop 3 TD predictions: ${td.hits} of ${td.shown} scored${td.hits < td.shown ? `, ${td.shown - td.hits} missed` : ""} (${td.candidates.map((c) => `${c.last} ${c.outcome === "hit" ? "✅" : "❌"}`).join(", ")}).` : "";
    const final = tie ? `${m.away.nickname} ${m.finalAway}, ${m.home.nickname} ${m.finalHome}` : `${win.nickname} ${ws}, ${lose.nickname} ${ls}`;
    return rotate(m.eventId, [
      { tone: "final", text: `🏈 Final: ${final}\n\nOur pregame prediction had ${placeOf(m.favouredTeam)} at ${m.winProbabilityDisplay} — ${verdict}${tdLine}` },
      { tone: "graded", text: `🏈 ${final}, final.\n\nWe had the ${m.favouredTeam.nickname} at ${m.winProbabilityDisplay} before kickoff: ${verdict}${tdLine}` },
    ]);
  },
  nbaPregame(m) {
    const fav = m.favouredTeam;
    const w = when(m.tipUtc);
    return rotate(m.eventId, [
      { tone: "matchup", text: `🏀 ${m.away.nickname} vs ${m.home.nickname} ${w}\n\nGameTimePicks has ${placeOf(fav)} coming out on top.\n\nWho's taking this one? 👀` },
      { tone: "short", text: `🏀 ${m.away.nickname} at ${m.home.nickname} ${w}\n\nOur predicted winner: the ${fav.nickname}.\n\nAgree or disagree? 👇` },
    ]);
  },
  nbaPlayers(m) {
    const [a, h] = m.featured.map((f) => f.player);
    const w = when(m.tipUtc);
    if (!a || !h) {
      const p = a ?? h;
      return [{ id: "A", tone: "single", text: p
        ? `🏀 ${m.away.name} vs ${m.home.name} ${w}\n\nHere's how our model projects one key player:\n\n🔥 ${p.name}: ${p3(p)}\n\nFull player projections below 👇`
        : `🏀 ${m.away.name} vs ${m.home.name} ${w}\n\nOur model's projected stat lines for this one are below 👇` }];
    }
    return rotate(m.eventId, [
      { tone: "key players", text: `🏀 ${m.away.name} vs ${m.home.name} ${w}\n\nHere's how our model projects a few key players:\n\n🔥 ${a.name}: ${p3(a)}\n🔥 ${h.name}: ${p3(h)}\n\nFull player projections below 👇` },
      { tone: "two to watch", text: `🏀 ${m.away.nickname} at ${m.home.nickname} ${w}\n\nTwo players to watch, by our model's projections:\n\n🔥 ${a.name}: ${p3(a)}\n🔥 ${h.name}: ${p3(h)}\n\nEvery projected line is on the graphic 👇` },
    ]);
  },
  nbaFinal(m) {
    const win = m.winner === "home" ? m.home : m.away;
    const lose = m.winner === "home" ? m.away : m.home;
    const ws = m.winner === "home" ? m.finalHome : m.finalAway;
    const ls = m.winner === "home" ? m.finalAway : m.finalHome;
    return rotate(m.eventId, [
      { tone: "final", text: `🏀 Final: ${win.name} ${ws}, ${lose.name} ${ls}` },
      { tone: "result", text: `🏀 ${win.nickname} ${ws}, ${lose.nickname} ${ls}. That's a final.` },
    ]);
  },
};
