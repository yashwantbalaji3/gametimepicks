/**
 * A TEAM MARKET CAPTURED AFTER FIRST PITCH IS NOT A PREGAME MARKET.
 *
 * The team-markets ingest took whatever the odds feed returned, and the feed keeps returning a game
 * after it starts — with LIVE lines. On 2026-09-10 the 17:43Z capture carried Rays @ Braves, which
 * threw its first pitch at 16:15Z, with a game total of 2.5: the in-game number for the runs still to
 * come, published beside fourteen genuine pregame totals of 7 to 9.5. The feed even said so — its
 * commenceTime for that event was 16:16:28Z, before the capture.
 *
 * One predicate, used at both ends: the ingest refuses such an event, and every reader drops one that
 * is already on disk, so a committed file from before the fix cannot publish its live line either.
 */

/** True when the market was captured strictly before the game's scheduled/actual start. A game's own
 *  `capturedAt` wins over the artifact's: a carried-forward entry keeps the moment it was really taken. */
export function capturedPregame(game, capturedAtIso) {
  const start = Date.parse(game?.commenceTime ?? "");
  const captured = Date.parse(game?.capturedAt ?? capturedAtIso ?? "");
  // No start or no capture moment → no evidence it was pregame. Refusing is the safe side: a missing
  // market renders as "not priced", a live one renders as a wrong price.
  if (!Number.isFinite(start) || !Number.isFinite(captured)) return false;
  return captured < start;
}

/** The artifact's games with every post-first-pitch capture removed, plus what was removed. */
export function pregameGamesOnly(artifact) {
  const games = artifact?.games ?? {};
  const kept = {};
  const dropped = [];
  for (const [id, g] of Object.entries(games)) {
    if (capturedPregame(g, artifact?.generatedAt)) kept[id] = g;
    else dropped.push({ gameId: id, matchup: `${g?.awayTeam ?? "?"} @ ${g?.homeTeam ?? "?"}`, commenceTime: g?.commenceTime ?? null });
  }
  return { games: kept, dropped };
}

/**
 * THE REWRITE PROBLEM. The ingest rewrites the whole day's file on every run (morning, then the
 * afternoon top-up). Refusing a started game would therefore DELETE its genuine morning line the
 * moment the afternoon run came round. So a started game is carried from the earlier file when — and
 * only when — that earlier file captured it before its start, and it keeps its own capture moment.
 *
 * @param {object|null} previous   the file this run is about to replace
 * @param {string[]}    startedIds odds event ids this run refused as already under way
 * @returns {Record<string, object>} gameId → the earlier pregame entry, stamped with its capturedAt
 */
export function carryPregameCaptures(previous, startedIds) {
  const out = {};
  for (const id of startedIds ?? []) {
    const g = previous?.games?.[id];
    if (!g || !capturedPregame(g, previous?.generatedAt)) continue;
    out[id] = { ...g, capturedAt: g.capturedAt ?? previous.generatedAt, carriedFromEarlierCapture: true };
  }
  return out;
}
