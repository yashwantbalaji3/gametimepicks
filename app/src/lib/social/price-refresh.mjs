/**
 * PRICE-ONLY REFRESH RULES. PURE: no I/O, no clock. A refresh may replace quote fields (line, prices, book, quote time)
 * of an approved post and nothing else. Any change to the winner, the players, a forecast value, a comparison direction,
 * the caption or the layout refuses the refresh. BUILT, NOT ACTIVATED: nothing runs this on its own.
 */
export const REFRESHABLE_TYPES = Object.freeze(["NFL_GAME_POST", "NBA_GAME_POST", "NBA_TONIGHT", "NBA_TOP5_CAROUSEL"]);
/** NBA cells that show a quote. A prop-line cell also shows O or U, which may not flip. */
export const NBA_QUOTE_CELL = /(^|\.)(line|price)$|^market\.(price|quoted)$/;
/** Content keys a refresh may change, at any depth; `line` keeps its direction. Every other NBA field is identity. */
export const NBA_QUOTE_KEYS = Object.freeze(["book", "bookLabel", "bookLabels", "price", "quotedAt", "fetchedAt", "sourceFile", "sourceSha256", "providerEventId", "startDeltaMinutes"]);
const nbaIdentity = (v) => {
  if (Array.isArray(v)) return v.map(nbaIdentity);
  if (v === null || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !NBA_QUOTE_KEYS.includes(k)).map(([k, x]) => [k, k === "line" && x && typeof x === "object" ? { cls: x.cls, glyph: x.glyph } : nbaIdentity(x)]));
};
const isTopLevelSide = (c) => [c.winner?.winner ?? c.winner, c.winner?.side, ...(c.games ?? []).map((g) => [g.eventId, g.winner, g.side])];
const estimates = (c) => [c.winner?.awayEstimate, c.winner?.homeEstimate, ...(c.games ?? []).map((g) => [g.awayEstimate, g.homeEstimate]), ...(c.parts ?? []).map((p) => (p.rows ?? []).map((r) => r.value))];
const players = (c) => [c.captionPlayers, c.availabilityCaveats, ...(c.parts ?? []).map((p) => (p.rows ?? []).map((r) => r.name))];
const direction = (t) => String(t).trim().split(/\s+/)[0];

function nbaRefreshProblems(pkg, post) {
  const p = [];
  if (pkg.contentType === "NBA_TONIGHT" && pkg.variant !== "ml") return [`UNSUPPORTED_TYPE: NBA_TONIGHT:${pkg.variant ?? "plain"}`];
  const a = nbaIdentity(pkg.content); const b = nbaIdentity(post.content);
  if (!eq(isTopLevelSide(a), isTopLevelSide(b))) p.push("WINNER_CHANGED");
  if (!eq(players(a), players(b))) p.push("PLAYERS_CHANGED");
  if (!eq(estimates(a), estimates(b))) p.push("FORECAST_VALUES_CHANGED");
  if (!eq(a, b) && !p.length) p.push("CONTENT_CHANGED");
  if ((pkg.anomalyCheck ?? null) !== (post.anomalyCheck ?? null) || !eq(pkg.anomalies ?? null, post.anomalies ?? null)) p.push("ANOMALIES_CHANGED");
  if (pkg.caption !== post.caption || pkg.commandCenter?.captions?.[0]?.text !== (post.ccCaption ?? post.caption)) p.push("CAPTION_CHANGED");
  const before = storedCells(pkg, post); const after = cellsOf(post);
  if (pkg.designVersion !== post.designVersion || !eq(before.map(([k]) => k), after.map(([k]) => k)) || pkg.images.filter((i) => i.scale === 1).length !== post.cards.length) p.push("LAYOUT_CHANGED");
  else for (let i = 0; i < before.length; i += 1) {
    if (before[i][1] === after[i][1]) continue;
    if (!NBA_QUOTE_CELL.test(before[i][0])) p.push(`LAYOUT_CHANGED: cell ${before[i][0]}`);
    else if (/(^|\.)line$/.test(before[i][0]) && direction(before[i][1]) !== direction(after[i][1])) p.push("COMPARISON_DIRECTION_CHANGED");
  }
  const unquoted = (refs) => refs.filter((r) => !r.ref.startsWith("gtp-private/odds/") && r.ref !== "gtp-graphics-export@2");
  if (!eq(unquoted(pkg.snapshotRefs), unquoted(post.snapshotRefs))) p.push("SOURCES_CHANGED");
  return [...new Set(p)];
}
/** What a refresh may and may not touch, by content type. Read by the sample report. */
export const REFRESH_SCHEMA = Object.freeze({
  NBA_GAME_POST: { identity: ["content.eventId", "content.imageOrder", "content.captionPlayers", "content.availabilityCaveats", "content.winner.{eventId,winner,side,awayEstimate,homeEstimate,marketKey,bookRule,bookOrder}", "content.lines.{comparedRows,testData}", "anomalyCheck", "anomalies", "caption", "designVersion", "every non-quote cell (projection and its arrow)", "the O or U of each .line cell", "non-odds snapshotRefs"], quote: NBA_QUOTE_KEYS.map((k) => `content.winner.${k}`).concat(["content.lines.quotedAt", "cells market.price, market.quoted, *.line"]) },
  NBA_TONIGHT: { variant: "ml only", identity: ["content.games[].{eventId,winner,side,away,home,tipUtc,awayEstimate,homeEstimate}", "content.{bookRule,bookOrder}", "caption", "designVersion", "every non-quote cell", "non-odds snapshotRefs"], quote: NBA_QUOTE_KEYS.flatMap((k) => [`content.${k}`, `content.games[].${k}`]).concat(["cells *.price"]) },
  NBA_TOP5_CAROUSEL: { identity: ["content.boards", "content.anomalyChecks", "content.parts[].{board,source,linesShown}", "content.parts[].rows[].{rank,name,team,opponent,kickoffUtc,value,text}", "content.parts[].rows[].line.{cls,glyph}", "anomalies", "caption", "designVersion", "every non-quote cell", "non-odds snapshotRefs"], quote: ["content.parts[].quotedAt", "content.parts[].rows[].line.text", "cells *.line"] },
});
/** Cells that show a quote. Every other cell must print the same text. */
export const QUOTE_CELL = /\.(line|vs|over|under|note)$|^market\.(price|quoted)$/;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const stableComparison = (c) => (c ? { state: c.state, colour: c.colour, side: c.side, reason: c.reason } : null);
const quoteFree = (c) => ({
  ...c, market: c.market ? { side: c.market.side } : null, quoteAge: undefined, gaps: (c.gaps ?? []).filter((g) => !/^STALE_QUOTES/.test(g)),
  tdCandidates: (c.tdCandidates ?? []).map(({ yesPrice: _y, book: _b, quotedAt: _q, ...r }) => r),
  propRows: (c.propRows ?? []).map(({ line: _l, overPrice: _o, underPrice: _u, book: _b, quotedAt: _q, comparison, ...r }) => ({ ...r, comparison: stableComparison(comparison) })),
});
const who = (c) => [...(c.tdCandidates ?? []).map((r) => r.playerId), ...(c.propRows ?? []).map((r) => `${r.playerId}.${r.market}`)];
const cellsOf = (post) => post.cards.flatMap((c) => Object.entries(c.cells));
/** The package's printed cells, without the claims that came from outside the cards. */
const storedCells = (pkg, post) => (pkg.commandCenter?.claims ?? []).filter((c) => !(post.extraClaims ?? []).some((e) => e.key === c.key)).map((c) => [c.key, c.display]);

/** [] when `post` differs from `pkg` in quotes only. */
export function priceRefreshProblems(pkg, post) {
  const p = [];
  if (!REFRESHABLE_TYPES.includes(pkg.contentType)) return [`UNSUPPORTED_TYPE: ${pkg.contentType}`];
  if (pkg.contentType !== "NFL_GAME_POST") return nbaRefreshProblems(pkg, post);
  const a = quoteFree(pkg.content); const b = quoteFree(post.content);
  if (a.winner?.winner !== b.winner?.winner || a.market?.side !== b.market?.side) p.push("WINNER_CHANGED");
  if (!eq(who(a), who(b))) p.push("PLAYERS_CHANGED");
  const comparisons = (c) => (c.propRows ?? []).map((r) => r.comparison);
  if (!eq(comparisons(a), comparisons(b)) && eq(who(a), who(b))) p.push("COMPARISON_DIRECTION_CHANGED");
  const values = (c) => ({ game: c.game, td: (c.tdCandidates ?? []).map((r) => [r.playerId, r.pct, r.value]), props: (c.propRows ?? []).map((r) => [r.playerId, r.market, r.projection]), estimate: c.estimate });
  if (eq(who(a), who(b)) && !eq(values(a), values(b))) p.push("FORECAST_VALUES_CHANGED");
  const rest = (c) => { const { winner: _w, market: _m, tdCandidates: _t, propRows: _r, game: _g, estimate: _e, comparisonCounts: _c, ...o } = c; return o; };
  if (!eq(rest(a), rest(b))) p.push("CONTENT_CHANGED");
  if (pkg.caption !== post.caption) p.push("CAPTION_CHANGED");
  if (pkg.commandCenter?.captions?.[0]?.text !== (post.ccCaption ?? post.caption)) p.push("CAPTION_CHANGED");
  const before = storedCells(pkg, post); const after = cellsOf(post);
  if (pkg.designVersion !== post.designVersion || !eq(before.map(([k]) => k), after.map(([k]) => k)) || pkg.images.filter((i) => i.scale === 1).length !== post.cards.length) p.push("LAYOUT_CHANGED");
  else for (let i = 0; i < before.length; i += 1) if (before[i][1] !== after[i][1] && !QUOTE_CELL.test(before[i][0])) p.push(`LAYOUT_CHANGED: cell ${before[i][0]}`);
  const unquoted = (refs) => refs.filter((r) => !r.ref.startsWith("gtp-private/odds/"));
  if (!eq(unquoted(pkg.snapshotRefs), unquoted(post.snapshotRefs))) p.push("SOURCES_CHANGED");
  return [...new Set(p)];
}

/** Cell by cell, what moved. */
export function quoteChanges(pkg, post) {
  const after = new Map(cellsOf(post));
  return storedCells(pkg, post).filter(([k, v]) => after.has(k) && after.get(k) !== v).map(([field, from]) => ({ field, from, to: after.get(field) }));
}

/** The founder's approval must name this exact content. */
export const isApproved = (pkg, ledger) => (ledger?.approved ?? []).some((a) => a?.dedupeId === pkg.dedupeId && a?.contentSha256 === pkg.contentSha256);

const quoteTimes = (c) => [c.market?.quotedAt, c.quotedAt, c.winner?.quotedAt, ...(c.games ?? []).map((g) => g.quotedAt), ...(c.tdCandidates ?? []).map((r) => r.quotedAt), ...(c.propRows ?? []).map((r) => r.quotedAt)].filter(Boolean).map(Date.parse).filter(Number.isFinite);
/** The capture must be newer than every quote on the post, and not after the refresh instant. */
export function captureProblems(pkg, { capturedAt, asOf }) {
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return ["CAPTURE_HAS_NO_TIME"];
  const p = [];
  const times = quoteTimes(pkg.content);
  if (times.length && !(t > Math.max(...times))) p.push("CAPTURE_NOT_NEWER");
  if (t > Date.parse(asOf)) p.push("CAPTURE_AFTER_AS_OF");
  return p;
}
