/**
 * NBA GAME POST. PURE: no I/O, no clock, no network. One post per game: the priced winner card, then the real-line stat
 * card(s). The caption names the projected winner and two players; every number is a claim, none is a percentage.
 */
import { ccCaptionProblems } from "./social-package.mjs";

export const GAME_POST_MAX_IMAGES = 4;
export const CAPTION_PLAYER_MARKETS = Object.freeze(["pts", "reb", "ast"]);
export const CAPTION_PLAYER_RULE = "highest official projected points among players with no anomaly verdict on pts, reb or ast; if fewer than two, the rest by highest official projected points";
const stat = (v) => Number(v).toFixed(1);

/**
 * @param {Array<{providerAthleteId:string|number, name:string, medians:Record<string, number|null>}>} players both teams
 * @param {Array<{playerId:string, market:string}>} anomalies the stat package's list
 */
export function selectCaptionPlayers(players, anomalies) {
  const flagged = new Set(anomalies.filter((a) => CAPTION_PLAYER_MARKETS.includes(a.market)).map((a) => String(a.playerId)));
  const ranked = players.filter((p) => CAPTION_PLAYER_MARKETS.every((k) => Number.isFinite(p.medians?.[k]))).sort((a, b) => b.medians.pts - a.medians.pts || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId)));
  const clean = ranked.filter((p) => !flagged.has(String(p.providerAthleteId))).slice(0, 2);
  const fill = ranked.filter((p) => !clean.includes(p)).slice(0, 2 - clean.length);
  const chosen = [...clean, ...fill].sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
  return { players: chosen, rule: CAPTION_PLAYER_RULE, fallback: fill.length > 0, fallbackPlayers: fill.map((p) => String(p.providerAthleteId)) };
}

export const gamePostCaption = ({ awayName, homeName, winnerNickname, players }) => [
  `🏀 ${awayName} vs ${homeName} tonight!`,
  "",
  `Our model projects the ${winnerNickname} to win.`,
  "",
  "Two players to watch:",
  ...players.map((p) => `🔥 ${p.name}: ${stat(p.medians.pts)} PTS | ${stat(p.medians.reb)} REB | ${stat(p.medians.ast)} AST`),
  "",
  "Full predictions below 👇",
].join("\n");

export const gamePostClaims = (players, evidenceRef) => players.flatMap((p) => CAPTION_PLAYER_MARKETS.map((k) => ({ key: `caption.${p.providerAthleteId}.${k}`, display: stat(p.medians[k]), evidenceRef })));

/** [] when the caption meets the game-post rules. */
export function gamePostCaptionProblems(text, claims) {
  const p = ccCaptionProblems(text, claims);
  if (/%/.test(text)) p.push("percentage in caption");
  if (/[—–]/.test(text)) p.push("dash in caption");
  return p;
}
