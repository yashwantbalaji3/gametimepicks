/**
 * MODEL-ONLY NBA GAME POST. PURE: no I/O, no clock, no network. One X post per game from two already-delivered packages:
 * image 1 the winner card, image 2 the model-projection stat card (no real lines). It changes no image and no number; the
 * caption names the projected winner and up to two players whose three cells are printed on the card and carry no flag.
 */
import { gamePostCaptionProblems, CAPTION_PLAYER_MARKETS } from "./nba-game-post.mjs";
import { buildSocialPackage, socialPackageViolations, etLabel, toIso } from "./social-package.mjs";

export const MODEL_GAME_POST = Object.freeze({ leadMin: 60, staggerMin: 2, minLeadMin: 55, designVersion: "3" });
export const MODEL_CAPTION_RULE = "highest printed points among players whose pts, reb and ast are all printed on the stat card and none is flagged";

/**
 * Posting slots: tip - 60 min; games sharing a tip are staggered 2 min apart, the last at tip - 60 (founder, 2026-11-04).
 * @param {Array<{eventId:string, tipUtc:string}>} games in slate order
 * @returns {Map<string, string>} eventId -> ISO time
 */
export function modelGamePostSchedule(games) {
  const byTip = new Map();
  for (const g of games) byTip.set(Date.parse(g.tipUtc), [...(byTip.get(Date.parse(g.tipUtc)) ?? []), g.eventId]);
  const out = new Map();
  for (const [tip, ids] of byTip) ids.forEach((id, k) => {
    const at = tip - (MODEL_GAME_POST.leadMin + MODEL_GAME_POST.staggerMin * (ids.length - 1 - k)) * 60000;
    if (tip - at < MODEL_GAME_POST.minLeadMin * 60000) throw new Error(`${id}: slot under ${MODEL_GAME_POST.minLeadMin} min before tip`);
    out.set(id, toIso(at));
  });
  return out;
}

/** Caption players from the stat package's own claims (the printed cells), never from the lane. */
export function modelCaptionPlayers(statsPkg) {
  const flagged = new Set((statsPkg.anomalies ?? []).map((a) => String(a.playerId)));
  const by = new Map();
  for (const c of statsPkg.commandCenter.claims) {
    const [id, k] = c.key.split(".");
    if (!by.has(id)) by.set(id, { id });
    by.get(id)[k] = c.display;
  }
  const num = (s) => /^\d+(\.\d+)?$/.test(String(s));
  return [...by.values()]
    .filter((p) => p.name && !flagged.has(p.id) && CAPTION_PLAYER_MARKETS.every((k) => num(p[k])))
    .sort((a, b) => Number(b.pts) - Number(a.pts) || a.id.localeCompare(b.id))
    .slice(0, 2);
}

/**
 * Per-cell states for the stat card, as the Command Center needs them (forecastCells + the render source's displayedCells).
 * Every player row on the card has three cells: a printed number with no flag is PASS; anything drawn as Review, "-" or
 * "Projection under model review" is REVIEW with the reason. A flagged number printed would be BLOCKED (EXCEPTION withholds them).
 * @param {Array<string|{id:string}>} rows the card's rows for both teams, from the unified roster
 */
export function modelForecastCells(rows, statsPkg) {
  const shown = new Map(statsPkg.commandCenter.claims.map((c) => [c.key, String(c.display)]));
  const flagged = new Set((statsPkg.anomalies ?? []).map((a) => `${a.playerId}.${a.market}`));
  return rows.flatMap((e) => CAPTION_PLAYER_MARKETS.map((m) => {
    const id = String(e.id ?? e), cellId = `${id}.${m}`, text = shown.get(cellId);
    if (typeof e === "object") return { cellId, playerId: id, market: m, state: "REVIEW", reason: "row under model review" };
    if (/\d/.test(text ?? "")) return flagged.has(cellId) ? { cellId, playerId: id, market: m, state: "BLOCKED", reason: "flagged cell printed" } : { cellId, playerId: id, market: m, state: "PASS" };
    return { cellId, playerId: id, market: m, state: "REVIEW", reason: flagged.has(cellId) ? "flagged, withheld" : "withheld by readiness" };
  }));
}

export function modelGamePostCaption({ awayName, homeName, winnerNickname, players }) {
  const lead = players.length === 2 ? "Two players to watch:" : players.length === 1 ? "One player to watch:" : null;
  return [
    `🏀 ${awayName} vs ${homeName} tonight!`, "",
    `Our model projects the ${winnerNickname} to win.`, "",
    ...(lead ? [lead, ...players.map((p) => `🔥 ${p.name}: ${p.pts} PTS | ${p.reb} REB | ${p.ast} AST`), ""] : []),
    "Full predictions below 👇",
  ].join("\n");
}

/**
 * @param {{ winner:any, stats:any, game:{awayName:string, homeName:string, awayAbbr:string, homeAbbr:string, winnerNickname:string, tipUtc:string}, images:Array<any>, recommendedAt:string, founderChoice?:object|null }} o
 *   `images`: the two delivered images (winner first), copied byte-for-byte; same sha256 as the source packages.
 */
export function buildModelGamePost({ winner, stats, game, images, recommendedAt, founderChoice = null, forecastCells, renderSource }) {
  const problems = [];
  if (winner.contentType !== "NBA_GAME_WINNER" || winner.containsMarketData) problems.push("image 1 must be the model-only winner card");
  if (stats.contentType !== "NBA_PLAYER_STATS" || stats.containsMarketData || stats.content?.containsLines !== false) problems.push("image 2 must be the model-only stat card");
  const eventId = String(winner.content.game.eventId);
  if (!String(stats.variant).startsWith(`${eventId}-`)) problems.push("winner and stat cards are different games");
  const src = [...winner.images, ...stats.images].filter((i) => i.scale === 1).map((i) => i.sha256);
  if (JSON.stringify(images.map((i) => i.sha256)) !== JSON.stringify(src)) problems.push("images differ from the delivered cards");
  if (!forecastCells?.length || !renderSource?.path) problems.push("forecastCells and renderSource are required");
  else if (forecastCells.some((c) => c.state === "BLOCKED")) problems.push("a flagged cell is printed");
  if (problems.length) throw new Error(`${eventId}: ${problems.join("; ")}`);
  const players = modelCaptionPlayers(stats);
  const caption = modelGamePostCaption({ ...game, players });
  const evidenceRef = stats.snapshotRefs[0].ref;
  const extraClaims = players.flatMap((p) => CAPTION_PLAYER_MARKETS.map((k) => ({ key: `caption.${p.id}.${k}`, display: p[k], evidenceRef })));
  const bad = gamePostCaptionProblems(caption, extraClaims);
  if (bad.length) throw new Error(`${eventId}: caption ${bad.join("; ")}`);
  const claims = [...winner.commandCenter.claims, ...stats.commandCenter.claims];
  const closes = game.tipUtc.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z");
  const opensAt = [winner.window.opensAt, stats.window.opensAt].sort().at(-1);
  const review = stats.anomalyCheck === "EXCEPTION" ? stats.reviewAnomalyCheck : stats.anomalyCheck;
  let pkg = buildSocialPackage({
    sport: "nba", date: winner.date, contentType: "NBA_GAME_POST", variant: `${eventId}-model`, designVersion: MODEL_GAME_POST.designVersion, containsMarketData: false,
    anomalyCheck: review, anomalies: stats.anomalies, snapshotRefs: [...new Map([...winner.snapshotRefs, ...stats.snapshotRefs].map((r) => [r.ref, r])).values()],
    images, caption, verification: { passed: winner.verification.passed && stats.verification.passed, checks: [...new Set([...winner.verification.checks, ...stats.verification.checks, "images in order: winner card, model-projection stat card", "images byte-identical to the delivered cards", "caption numbers are printed, unflagged cells"])], cellsVerified: winner.verification.cellsVerified + stats.verification.cellsVerified },
    window: { opensAt, closesAt: closes },
    recommended: { recommendedAt, recommendedAtEt: etLabel(Date.parse(recommendedAt)), firstGameUtc: closes, rule: "tip - 60 min, staggered 2 min where tips coincide (founder, 2026-11-04)" },
    freshness: { ...stats.freshness, expiresAt: closes }, eligibilityClass: winner.eligibilityClass, disclosures: [...new Set([...winner.disclosures, ...stats.disclosures])],
    title: `${game.awayAbbr} @ ${game.homeAbbr}: game post`, firstStartUtc: closes, eventId, dataCommit: stats.commandCenter.dataCommit,
    ccCaption: caption, ccCaptionB: `🏀 ${game.awayName} vs ${game.homeName} tonight! Our model projects the ${game.winnerNickname} to win. Full predictions below 👇`,
    extraClaims: [...claims, ...extraClaims],
    content: {
      eventId, model: true, containsLines: false, linesShown: 0, imageOrder: [winner.dedupeId, stats.dedupeId], sourceContentSha256: [winner.contentSha256, stats.contentSha256],
      captionPlayers: { rule: MODEL_CAPTION_RULE, players: players.map((p) => ({ playerId: p.id, name: p.name, pts: p.pts, reb: p.reb, ast: p.ast })) },
      winner: winner.content, stats: stats.content, ...(founderChoice ? { founderChoice } : {}), socialAuthorized: false,
    },
  });
  pkg = { ...pkg, forecastCells, renderSource };
  if (stats.anomalyCheck === "EXCEPTION") {
    pkg = { ...pkg, anomalyCheck: "EXCEPTION", reviewAnomalyCheck: stats.reviewAnomalyCheck, publicationException: stats.publicationException };
    const v = socialPackageViolations(pkg);
    if (v.length) throw new Error(`${eventId}: ${v.join("; ")}`);
  }
  return pkg;
}
