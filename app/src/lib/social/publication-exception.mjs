/**
 * ONE-DAY CEO PUBLICATION EXCEPTION, 2026-10-30, NBA ONLY. PURE: no I/O, no network; the clock is passed in. Banner-free
 * re-emission of reviewed packages with founder captions. It changes no forecast, line, price or quote time, keeps every
 * anomaly on the package, and leaves socialPackageViolations, cleanEligibilityProblems and the 6 hour rule as they are for
 * every other date. Nothing here posts anything; the approval record requires final approval per post.
 */
import { etDate, instant, socialPackageViolations } from "./social-package.mjs";
import { gamePostCaptionProblems, gamePostClaims } from "./nba-game-post.mjs";
import { LINE_MAX_AGE_HOURS } from "../sports/nba/line-comparison.mjs";
import crypto from "node:crypto";

export const EXCEPTION_DATE = "2026-10-30";
export const RECAP_DATE = "2026-10-29";
export const EXCEPTION = Object.freeze({
  id: "2026-10-30-ceo-one-day",
  ref: "~/gtp-private/graphics/approvals/publication-exception-2026-10-30.json",
  statement: "unvalidated v0.1, known minutes and role limitations; not corrected, calibrated or validated",
});
const STATUS = Object.freeze({ STARTED: "STARTED", STALE_QUOTE: "STALE_QUOTE", OK: "OK" });
export { STATUS as EXCEPTION_STATUS };

/** The slugs the exception covers: the 15 posts, then the model-only Top 5 and winners. */
export function exceptionSlugs(eventIds) {
  const d = `nba-${EXCEPTION_DATE}`;
  const stats = ["pts", "reb", "ast"];
  return [
    `nba-${RECAP_DATE}-results-recap`, `${d}-nba-tonight-ml`, ...stats.map((k) => `${d}-nba-daily-top5-${k}`), ...eventIds.map((id) => `${d}-nba-game-post-${id}`),
    `${d}-nba-tonight`, ...stats.map((k) => `${d}-nba-daily-top5-${k}-model`), ...eventIds.map((id) => `${d}-nba-game-winner-${id}`),
  ];
}

/** [] while the exception applies to this run: the dated flag, the day itself (Eastern), never any other slate. */
export function exceptionRunProblems({ flag, date = EXCEPTION_DATE, nowMs }) {
  const p = [];
  if (flag !== true) p.push("--oct30-exception is required");
  if (date !== EXCEPTION_DATE) p.push(`the exception covers ${EXCEPTION_DATE} only`);
  if (!Number.isFinite(nowMs) || etDate(nowMs) !== EXCEPTION_DATE) p.push(`EXPIRED: the exception applies on ${EXCEPTION_DATE} ET only`);
  return p;
}

/** Why this package is outside the exception. [] = inside. */
export function packageScopeProblems(pkg) {
  const p = [];
  if (pkg?.sport !== "nba") p.push("NBA only");
  const recap = pkg?.contentType === "RESULTS_RECAP";
  if (pkg?.date !== (recap ? RECAP_DATE : EXCEPTION_DATE)) p.push(`date ${pkg?.date} is outside the exception`);
  p.push(...socialPackageViolations(pkg).map((x) => `review package: ${x}`));
  return p;
}

/** True when the listed game, or the first of the listed games, has tipped. */
export const hasStarted = (pkg, nowMs) => pkg.contentType !== "RESULTS_RECAP" && !(instant(pkg.commandCenter.firstStartUtc) > nowMs);

/** Age of the oldest stored quote at now. The timestamps are read, never changed. Null when the post holds no quote. */
export function quoteStatus(quotedAts, nowMs) {
  const t = quotedAts.map(Date.parse).filter(Number.isFinite);
  if (!t.length) return { quoteAgeHours: null, status: STATUS.OK };
  const quoteAgeHours = Math.round(((nowMs - Math.min(...t)) / 3600000) * 100) / 100;
  return { quoteAgeHours, status: quoteAgeHours > LINE_MAX_AGE_HOURS ? STATUS.STALE_QUOTE : STATUS.OK };
}

/** Internal only. One entry per flagged player-market. */
export const limitationsOf = (anomalies, nameOf) => ({ statement: EXCEPTION.statement, flaggedPlayers: (anomalies ?? []).map((a) => ({ playerId: a.playerId, name: nameOf(a.playerId), market: a.market, verdict: a.verdict })) });

const stat1 = (v) => Number(v).toFixed(1);
const TOP5 = Object.freeze({
  pts: "🏀 Tonight's Top 5 projected NBA scorers! 🔥\nFive players. Ten games. Who's putting up the biggest scoring performance tonight?\nCheck out our projections and the OVER/UNDER comparisons below 👇\n#NBA",
  reb: "🏀 Who's dominating the glass tonight? 💪\nOur Top 5 projected rebound leaders across tonight's NBA slate!\nWho finishes with the most boards? 👇\n#NBA",
  ast: "🏀 Who's dropping dimes tonight? 🎯\nOur Top 5 projected assist leaders across tonight's NBA matchups!\nWho's leading the league's playmakers tonight? 👇\n#NBA",
});

/**
 * The founder's option A, plus the claims behind every digit.
 * @param {any} pkg review package
 * @param {{ game?: {awayName:string, homeName:string, winnerNickname:string}, players?: any[], evidenceRef: string }} ctx
 */
export function exceptionCaption(pkg, { game, players, evidenceRef }) {
  const claim = (key, display) => ({ key: `caption.${key}`, display: String(display), evidenceRef });
  switch (pkg.contentType) {
    case "NBA_TONIGHT": {
      const n = pkg.content.games?.length ?? pkg.commandCenter.claims.find((c) => c.key === "games")?.display;
      if (Number(n) !== 10) throw new Error(`slate is ${n} games, the approved caption says 10`);
      return { caption: `🏀 ${n} NBA games on tonight's slate!\nWho's taking the W? 👀\nOur model has a predicted winner for every matchup, with the full slate and win probabilities below.\nWho are you backing tonight? 👇\n#NBA`, claims: [claim("games", n)] };
    }
    case "NBA_DAILY_TOP5": {
      const model = String(pkg.variant).endsWith("-model");
      const text = TOP5[String(pkg.variant).replace(/-model$/, "")];
      // The model-only card shows no line, so it cannot promise OVER/UNDER comparisons.
      return { caption: model ? text.replace("our projections and the OVER/UNDER comparisons below", "our projections below") : text, claims: [claim("topN", 5)] };
    }
    case "NBA_GAME_POST":
      return {
        caption: [`🏀 ${game.awayName} vs ${game.homeName} tonight!`, `🎯 Our model projects the ${game.winnerNickname} to win.`, "Two players to watch:", ...players.map((p) => `🔥 ${p.name}: ${stat1(p.medians.pts)} PTS | ${stat1(p.medians.reb)} REB | ${stat1(p.medians.ast)} AST`), "Full predictions below 👇", "#NBA"].join("\n"),
        claims: gamePostClaims(players, evidenceRef),
      };
    case "NBA_GAME_WINNER":
      return { caption: `🏀 ${game.awayName} vs ${game.homeName} tonight!\n🎯 Our model projects the ${game.winnerNickname} to win.\nFull prediction below 👇\n#NBA`, claims: [] };
    case "RESULTS_RECAP": {
      const { correct, missed, gamesScheduled } = pkg.content;
      if (correct !== 2 || missed !== 1 || gamesScheduled !== 3) throw new Error("the recap record differs from the approved caption");
      return { caption: `🏀 NBA Results, October 29 📊\n✅ ${correct} predicted winners correct\n❌ ${missed} prediction missed\nWe track every prediction, every win and every miss.\nOn to the next slate! 🔥\n#NBA`, claims: [claim("correct", correct), claim("missed", missed), claim("day", 29)] };
    }
    default: throw new Error(`no approved caption for ${pkg.contentType}`);
  }
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** The re-emitted package. `images` are the banner-free scale-1 images. */
export function buildExceptionPackage(pkg, { caption, claims, images, quoteAgeHours, limitations }) {
  const mediaSet = images.map((i) => ({ file: i.path, sha256: i.sha256, width: i.width, height: i.height, format: pkg.commandCenter.format, altText: pkg.commandCenter.title }));
  const anomalies = pkg.anomalies ?? [];
  const out = {
    ...pkg, images, reviewedImages: pkg.images, clean: true, bannerOff: true, caption, sourceContentSha256: pkg.contentSha256, reviewAnomalyCheck: pkg.anomalyCheck ?? null,
    anomalyCheck: "EXCEPTION", anomalies, limitations, quoteAgeHours, publicationException: { ...EXCEPTION },
    approval: { status: "FOUNDER_EXCEPTION_FINAL_APPROVAL_REQUIRED_PER_POST", socialAuthorized: true, exceptionId: EXCEPTION.id },
    mediaSha256: images[0].sha256, mediaSetSha256: sha(images.map((i) => i.sha256).join("|")),
    commandCenter: { ...pkg.commandCenter, claims: [...pkg.commandCenter.claims, ...claims], media: { ...mediaSet[0], mime: "image/png", kind: "graphic" }, mediaSet, captions: [{ id: "A", tone: "founder", source: "publication-exception", text: caption }] },
  };
  out.contentSha256 = sha(JSON.stringify({ exception: EXCEPTION.id, snapshotRefs: out.snapshotRefs, caption, content: out.content, media: images.map((i) => i.sha256), anomalyCheck: out.anomalyCheck, anomalies }));
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** [] when the exception package is the review package with only the allowed fields changed and every rule still met. */
export function exceptionPackageProblems(out, source) {
  const p = [];
  for (const k of ["content", "snapshotRefs", "freshness", "window", "dedupeId", "date", "sport", "contentType", "variant"]) if (!same(out[k], source[k])) p.push(`${k} differs from the review package`);
  if (!same(out.anomalies, source.anomalies ?? [])) p.push("anomalies differ from the review package");
  if (out.anomalyCheck !== "EXCEPTION") p.push("anomalyCheck must be EXCEPTION");
  if (out.contentSha256 === source.contentSha256) p.push("contentSha256 did not change");
  if (!out.publicationException || !out.limitations) p.push("publicationException and limitations are required");
  if (!source.commandCenter.claims.every((c, i) => same(c, out.commandCenter.claims[i]))) p.push("review claims changed");
  if (out.commandCenter.captions.length !== 1 || out.commandCenter.captions[0].id !== "A") p.push("caption A only");
  if (!/\n#NBA$/.test(out.caption)) p.push("caption must end #NBA");
  if (/betting advice|1-800/i.test(out.caption)) p.push("caption carries a disclaimer");
  p.push(...gamePostCaptionProblems(out.caption, out.commandCenter.claims));
  const { anomalyCheck: _a, anomalies: _b, ...rest } = out;
  const shadow = { ...rest, approval: source.approval, ...(source.anomalyCheck ? { anomalyCheck: source.anomalyCheck, anomalies: source.anomalies } : {}) };
  p.push(...socialPackageViolations(shadow));
  return [...new Set(p)];
}
