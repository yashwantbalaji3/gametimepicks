/**
 * NBA BOX-SCORE OVER/UNDER CARDS (founder design 2026-10-30): the two-team player box-score layout of the Oct 28 / Oct 29
 * Command Center posts (gtp-social@2.3.x "Projected stat lines"), 1080 × 1350, one card per game (a second card when a
 * team has more than PER_TEAM players). Default template of render-nba-line-graphics.mjs; the row-per-market table
 * (nba-line-cards.mjs) stays behind --template table for comparison. Script-only: never imported by a page or route.
 *
 * EACH CELL is one export entry of a `gtp-graphics-export@2` NBA_LINE_COMPARISON document, copied as strings:
 *   compared row, side OVER   → green number with ▲, then "O <line>" and the OVER price beneath it;
 *   compared row, side UNDER  → red number with ▼, then "U <line>" and the UNDER price beneath it;
 *   compared row, NEUTRAL     → grey number, nothing beneath (the median equals the line: no direction);
 *   model-only entry          → grey number, nothing beneath (no qualified line: no line, stale, suspended...);
 *   no entry at all           → a grey "–".
 * The arrow shape travels with the colour (colour is never the only signal). A price prints only when the export row
 * SHOWS that side's price. Nothing here rounds, compares or ranks by difference; players are ordered by their projected
 * points (the export's own pts display value), and only players with at least one compared cell are listed.
 *
 * NOT ON THE IMAGE (founder): the difference column, book names (the provider's terms do not require attribution:
 * docs/odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md, so no book is named anywhere on the card), internal model terms
 * (median, lane, snapshot, receipt). ON THE IMAGE: the logo, the matchup and tip time, the colour legend (top right), the
 * quote time, "Lines from licensed US sportsbooks.", Not betting advice, the responsible-gambling line (FOOTER.responsible)
 * and the non-affiliation line.
 *
 * BRAND: the approved logo, the Command Center stage (team-colour halves, seam, beams, grain) and its bundled OFL fonts
 * (scripts/social/fonts, inlined; nothing is fetched), team colours from the verified NBA colour data
 * (lib/simulation-theater/nba/nba-team-colors.json). Monogram team marks only: no league or club logo is licensed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nbaTeamColor } from "../../src/lib/simulation-theater/nba/nba-team-colors.mjs";
import { relLuminance, contrastRatio } from "../../src/lib/simulation-theater/nfl-team-colors.mjs";
import { REFERENCE_BOOK_ORDER } from "../../src/lib/sports/nba/line-comparison.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../src/lib/sports/nba/prop-line-adapter.mjs";
import { PURPOSE } from "../../src/lib/social/nba-line-graphics-export.mjs";
import { FOOTER, TEST_WATERMARK, REVIEW_BANNER, BANNED_WORDS, EM_DASH, EN_DASH, logoDataUri, tipEt, quoteRangeText, visibleText } from "./nba-line-cards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");

export const BOX_TEMPLATE = "gtp-nba-boxscore@1";
export const BOX_FAMILIES = Object.freeze(["pts", "reb", "ast"]);
export const BOX_HEAD = Object.freeze({ pts: "PTS", reb: "REB", ast: "AST" });
export const BOX_SIZE = Object.freeze({ key: "1080x1350", width: 1080, height: 1350 });
/** Players per team per card. Two-line cells (number + odds) at mobile-legible sizes fit six rows per panel. */
export const PER_TEAM = 6;
/** Minimum rendered sizes (px at 1080 wide), asserted by the renderer's layout pass. */
export const MIN_PX = Object.freeze({ number: 26, price: 18 });
export const CELL_STATE = Object.freeze({ OVER: "over", UNDER: "under", NEUTRAL: "neutral", NONE: "none", ABSENT: "absent" });
export const BOX_COLOR = Object.freeze({ over: "#4ADE80", under: "#F87171", grey: "#8E9A92" });
export const LEGEND = Object.freeze([
  Object.freeze({ cls: "over", glyph: "▲", text: "Projection above line" }),
  Object.freeze({ cls: "under", glyph: "▼", text: "Projection below line" }),
  Object.freeze({ cls: "none", glyph: "●", text: "No qualified comparison" }),
]);
export const BOX_FOOTER = Object.freeze({
  lines: "Lines from licensed US sportsbooks.",
  affiliation: "Not affiliated with the NBA or its teams.",
});
export const SOCIAL_HANDLE = "@GameTimePicksHQ";
export const ABSENT_TEXT = "–";
/** Internal or technical words that never appear on the public image. */
export const JARGON = Object.freeze(["median", "medians", "lane", "snapshot", "receipt", "difference", "diff", "edition", "export", "official forecast", "model version", "simulated"]);
/** Every sportsbook label the reference order knows: none may appear on the image. */
export const BOOK_LABELS = Object.freeze(REFERENCE_BOOK_ORDER.map((k) => NBA_PROP_LINE_ADAPTER.bookLabel(k)));

export const quoteLine = (rows) => `Model projections vs sportsbook lines quoted ${quoteRangeText(rows)}.`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ───────────────────────────── assets ───────────────────────────── */

const FACES = [["GTP Condensed", "BarlowCondensed-Bold.ttf", 700], ["GTP Condensed", "BarlowCondensed-ExtraBold.ttf", 800], ["GTP Condensed", "BarlowCondensed-Black.ttf", 900],
  ["GTP Body", "Barlow-SemiBold.ttf", 600], ["GTP Body", "Barlow-Bold.ttf", 700]];
let FONT_CSS = null;
const fontFaces = () => (FONT_CSS ??= FACES.map(([family, file, weight]) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${fs.readFileSync(path.join(HERE, "fonts", file)).toString("base64")}) format("truetype");}`).join("\n"));
let COLORS = null;
const colorData = () => (COLORS ??= JSON.parse(fs.readFileSync(path.join(APP, "src", "lib", "simulation-theater", "nba", "nba-team-colors.json"), "utf8")));
/** The X mark (X brand toolkit: the logo may identify an X account), one vector path. */
const X_MARK = `<svg class="xmark" viewBox="0 0 1200 1227" aria-hidden="true"><path fill="currentColor" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>`;

/** Team identity from the verified colour data (refuses an unknown team: no invented colours). */
export function boxTeam(abbr) {
  const c = nbaTeamColor(colorData(), abbr);
  if (!c) throw new Error(`no verified NBA colour record for ${abbr}: no card`);
  const accent = relLuminance(c.primary) < 0.03 ? c.secondary : c.primary;
  const ink = contrastRatio("#F7F7F2", c.primary) >= contrastRatio("#050706", c.primary) ? "#F7F7F2" : "#050706";
  return { abbr, name: c.name, nickname: c.name.split(" ").at(-1), color: c.primary, accent, ink };
}

/* ───────────────────────────── cell model ───────────────────────────── */

const isCompared = (r) => r?.kind === "PLAYER_PROP_LINE" && r.market?.line?.state === "SHOWN" && r.market?.direction?.state === "SHOWN";
const shown = (f) => f?.state === "SHOWN";

/**
 * The exact strings of one cell from its export entry (a compared row, a model-only entry, or nothing).
 * @param {any|null} entry
 * @param {{ showLine?: boolean }} [o]
 */
export function boxCell(entry, { showLine = true } = {}) {
  if (!entry) return { state: CELL_STATE.ABSENT, number: ABSENT_TEXT, glyph: null, sideLetter: null, line: null, price: null };
  if (!isCompared(entry)) {
    if (entry.kind !== "PLAYER_PROP_MODEL_ONLY") throw new Error(`${entry.rowId}: neither a compared row nor a model-only entry`);
    return { state: CELL_STATE.NONE, number: entry.model.display, glyph: null, sideLetter: null, line: null, price: null };
  }
  const side = entry.market.direction.side;
  if (side === "NEUTRAL") return { state: CELL_STATE.NEUTRAL, number: entry.model.display, glyph: null, sideLetter: null, line: null, price: null };
  if (side !== "OVER" && side !== "UNDER") throw new Error(`${entry.rowId}: unknown side ${side}`);
  const priceField = side === "OVER" ? entry.market.overPrice : entry.market.underPrice;
  return {
    state: side === "OVER" ? CELL_STATE.OVER : CELL_STATE.UNDER,
    number: entry.model.display,
    glyph: entry.market.direction.glyph,
    sideLetter: side === "OVER" ? "O" : "U",
    line: showLine ? entry.market.line.text : null,
    price: shown(priceField) ? priceField.text : null,
  };
}

/** Each cell's exact markup fragments (the validator and the tests find them verbatim inside the cell). */
export function boxCellMarkup(c) {
  return [
    `<span class="v">${esc(c.number)}</span>`,
    ...(c.glyph ? [`<span class="gl">${esc(c.glyph)}</span>`] : []),
    ...(c.line ? [`<span class="sl">${esc(`${c.sideLetter} ${c.line}`)}</span>`] : []),
    ...(c.price ? [`<span class="px">${esc(c.price)}</span>`] : []),
  ];
}

const cellHtml = (id, c) => {
  const [v, ...rest] = boxCellMarkup(c);
  const gl = c.glyph ? rest.shift() : "";
  const sub = rest.length ? `<div class="sub">${rest.join("")}</div>` : "";
  return `<div class="cell ${c.state}" data-cell="${esc(id)}" data-state="${c.state}"><div class="num">${gl}${v}</div>${sub}</div>`;
};

/**
 * The game's box-score players: every player of the game with at least one COMPARED pts/reb/ast row, each family's cell
 * from its compared row or else its model-only entry; ordered by projected points (desc), then player id; split by team.
 */
export function boxScorePlayers(doc, eventId) {
  const ev = doc.events.find((e) => e.eventId === eventId);
  if (!ev) throw new Error(`no event ${eventId} in the export`);
  const [away, home] = ev.matchup.split(" @ ");
  const entries = [...doc.rows.filter(isCompared), ...(doc.modelOnly ?? [])].filter((r) => r.identity.eventId === eventId && BOX_FAMILIES.includes(r.identity.market));
  const by = new Map();
  for (const r of entries) {
    const id = String(r.identity.playerId);
    const p = by.get(id) ?? { playerId: id, name: r.identity.playerName, team: r.identity.team, cells: {} };
    if (p.cells[r.identity.market]) throw new Error(`${r.rowId}: two entries for one cell`);
    if (p.name !== r.identity.playerName || p.team !== r.identity.team) throw new Error(`${r.rowId}: player identity disagrees across entries`);
    p.cells[r.identity.market] = r;
    by.set(id, p);
  }
  const pts = (p) => (p.cells.pts ? p.cells.pts.model.value : -Infinity);
  const players = [...by.values()].filter((p) => BOX_FAMILIES.some((f) => isCompared(p.cells[f])))
    .sort((a, b) => pts(b) - pts(a) || a.playerId.localeCompare(b.playerId));
  for (const p of players) if (p.team !== away && p.team !== home) throw new Error(`${p.playerId}: team ${p.team} is neither ${away} nor ${home}`);
  return { event: ev, away, home, awayPlayers: players.filter((p) => p.team === away), homePlayers: players.filter((p) => p.team === home) };
}

/**
 * Pages of at most `perTeam` players per side (a second card when a team has more), each side split evenly across the
 * pages in projected-points order (8 players → 4 + 4, not 6 + 2).
 */
export function boxScorePages(doc, eventId, perTeam = PER_TEAM) {
  const g = boxScorePlayers(doc, eventId);
  if (!g.awayPlayers.length && !g.homePlayers.length) return [];
  const n = Math.max(1, Math.ceil(Math.max(g.awayPlayers.length, g.homePlayers.length) / perTeam));
  const chunk = (list, i) => { const k = Math.ceil(list.length / n); return list.slice(i * k, (i + 1) * k); };
  return Array.from({ length: n }, (_, i) => ({ ...g, page: i + 1, pages: n, awayPlayers: chunk(g.awayPlayers, i), homePlayers: chunk(g.homePlayers, i) }));
}

const cellId = (doc, eventId, playerId, family) => `nba:${doc.edition.date}:${eventId}:${playerId}:${family}`;
/** Every cell of a page in print order: [{ id, entry, cell }]. */
export function pageCells(doc, page, o = {}) {
  return [...page.awayPlayers, ...page.homePlayers].flatMap((p) => BOX_FAMILIES.map((f) => {
    const entry = p.cells[f] ?? null;
    const id = entry?.rowId ?? cellId(doc, page.event.eventId, p.playerId, f);
    return { id, entry, cell: boxCell(entry, o), player: p, family: f };
  }));
}
/** The compared rows printed on a page (for the quote time). */
export const pageComparedRows = (page) => [...page.awayPlayers, ...page.homePlayers].flatMap((p) => BOX_FAMILIES.map((f) => p.cells[f]).filter(isCompared));

/* ───────────────────────────── template ───────────────────────────── */

const CSS = `
:root{--bg:#050706;--ink:#F7F7F2;--mute:#B9BDB4;--faint:#7D847C;--neon:#39FF88;--over:${BOX_COLOR.over};--under:${BOX_COLOR.under};--grey:${BOX_COLOR.grey};--gold:#D4AF37;
--display:"GTP Condensed","Arial Narrow",sans-serif;--body:"GTP Body","Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--body)}
body{position:relative}
.stage{position:absolute;inset:0;overflow:hidden}
.half{position:absolute;top:0;bottom:0;width:62%}
.half.l{left:-6%;background:linear-gradient(180deg,color-mix(in srgb,var(--ca) 74%,#000) 0%,color-mix(in srgb,var(--ca) 38%,#000) 40%,#050706 78%);clip-path:polygon(0 0,100% 0,78% 100%,0 100%)}
.half.r{right:-6%;background:linear-gradient(180deg,color-mix(in srgb,var(--cb) 74%,#000) 0%,color-mix(in srgb,var(--cb) 38%,#000) 40%,#050706 78%);clip-path:polygon(22% 0,100% 0,100% 100%,0 100%)}
.seam{position:absolute;top:-40px;bottom:-40px;left:50%;width:6px;transform:translateX(-50%) skewX(-9deg);background:linear-gradient(180deg,transparent,var(--neon) 14%,rgba(57,255,136,.25) 34%,rgba(57,255,136,.25) 70%,var(--neon) 86%,transparent);box-shadow:0 0 28px 6px rgba(57,255,136,.4);opacity:.8}
.ghost{position:absolute;top:150px;font:900 400px/0.8 var(--display);letter-spacing:-6px;color:transparent;-webkit-text-stroke:3px rgba(255,255,255,.10);white-space:nowrap}
.ghost.l{left:-40px}.ghost.r{right:-40px;text-align:right}
.beams{position:absolute;inset:0;mix-blend-mode:screen}
.beam{position:absolute;top:-120px;width:150px;height:1500px;transform-origin:top center;background:linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.06) 45%,transparent 75%);filter:blur(18px)}
.flare{position:absolute;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.6) 0%,rgba(255,255,240,.18) 18%,transparent 62%)}
.vignette{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(0,0,0,.78) 100%),linear-gradient(180deg,rgba(0,0,0,.25),transparent 22%,transparent 55%,rgba(0,0,0,.85) 100%)}
.grain{position:absolute;inset:0;opacity:.14;mix-blend-mode:overlay}
.review{position:absolute;top:0;left:0;right:0;height:34px;background:var(--gold);color:#050706;font:700 18px/34px var(--body);text-align:center;letter-spacing:2px;z-index:6}
.watermark{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%) rotate(-24deg);white-space:nowrap;font:900 96px/1 var(--display);color:rgba(248,113,113,0.30);border:6px solid rgba(248,113,113,0.30);padding:10px 30px;z-index:5;pointer-events:none}
.content{position:absolute;inset:var(--top) 48px 34px;display:flex;flex-direction:column;z-index:2}
.top{display:flex;flex-direction:column;align-items:center;gap:12px}
.logo{height:84px;width:auto;filter:drop-shadow(0 0 18px rgba(57,255,136,.45))}
.chip{font:700 25px/1 var(--display);letter-spacing:5px;padding:11px 24px 8px;border-radius:999px;text-transform:uppercase;background:rgba(0,0,0,.55);border:2px solid rgba(57,255,136,.55);box-shadow:0 0 22px rgba(57,255,136,.25) inset;white-space:nowrap}
.kicker{margin-top:14px;text-align:center;font:800 29px/1 var(--display);letter-spacing:8px;color:var(--neon);text-transform:uppercase;text-shadow:0 0 18px rgba(57,255,136,.6),0 2px 10px rgba(0,0,0,.9)}
.matchup{margin-top:8px;text-align:center;font:700 28px/1 var(--display);letter-spacing:4px;color:var(--mute);text-transform:uppercase;text-shadow:0 2px 12px rgba(0,0,0,.85)}
.legend{position:absolute;top:calc(var(--top) - 22px);right:40px;z-index:3;display:flex;flex-direction:column;gap:7px;padding:12px 16px;border-radius:14px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.16)}
.legend div{display:flex;align-items:center;gap:9px;font:600 18px/1 var(--body);color:var(--ink);white-space:nowrap}
.legend i{font-style:normal;width:18px;text-align:center;font-size:17px}
.legend .over i{color:var(--over)}.legend .under i{color:var(--under)}.legend .none i{color:var(--grey)}
.lines{margin-top:20px;flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto;gap:18px;align-items:stretch;align-content:center}
.lcol{min-width:0;border-radius:22px;padding:16px 14px 10px;overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 45%,#000),rgba(5,8,6,.95) 52%);border:2px solid color-mix(in srgb,var(--c) 70%,#fff 15%);box-shadow:0 18px 50px rgba(0,0,0,.5);display:flex;flex-direction:column}
.lhead{display:flex;align-items:center;justify-content:center;gap:14px;min-width:0}
.mark{flex:none;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--tc) 70%,#fff 18%),var(--tc) 70%);border:2px solid rgba(255,255,255,.35)}
.mark span{font:900 21px/1 var(--display);letter-spacing:1px;color:var(--tink)}
.lhead h3{font:900 50px/1 var(--display);text-transform:uppercase;white-space:nowrap;overflow:hidden;min-width:0}
.chd{display:grid;grid-template-columns:repeat(3,1fr);margin-top:12px;padding:0 6px 8px;font:700 20px/1 var(--display);letter-spacing:3px;color:var(--mute);text-align:center}
.prows{display:flex;flex-direction:column;flex:1;justify-content:flex-start;padding-bottom:4px}
.prow{border-top:1px solid rgba(255,255,255,.11);border-left:4px solid color-mix(in srgb,var(--c) 80%,#fff 10%);padding:8px 6px 8px 10px}
.pname{display:block;font:800 28px/1.05 var(--display);text-transform:uppercase;white-space:nowrap;overflow:hidden}
.cells{display:grid;grid-template-columns:repeat(3,1fr);margin-top:4px}
.cell{display:flex;flex-direction:column;align-items:center;min-width:0}
.num{display:flex;align-items:baseline;justify-content:center;gap:5px;white-space:nowrap}
.v{font:900 40px/1 var(--display);font-variant-numeric:tabular-nums}
.gl{font:700 20px/1 var(--body)}
.sub{margin-top:3px;display:flex;gap:7px;align-items:baseline;white-space:nowrap}
.sl{font:700 19px/1.1 var(--display);letter-spacing:.5px;color:var(--mute)}
.px{font:700 19px/1.1 var(--display);letter-spacing:.5px}
.cell.over .v,.cell.over .gl,.cell.over .px{color:var(--over)}
.cell.under .v,.cell.under .gl,.cell.under .px{color:var(--under)}
.cell.neutral .v,.cell.none .v,.cell.absent .v{color:var(--grey)}
.foot{margin-top:14px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.social{display:flex;align-items:center;gap:10px;font:700 26px/1 var(--body);color:var(--ink);opacity:.92}
.xmark{width:24px;height:24px}
.foot p{font:600 18px/1.3 var(--body);color:var(--mute)}
.foot p.q{color:var(--ink)}
`;

/** The page's fit pass: player names step down together (never below 80%), then the renderer reads window.__fit. */
const FIT_SCRIPT = `<script>(function(){var els=[].slice.call(document.querySelectorAll(".pname"));var size=els.length?parseFloat(getComputedStyle(els[0]).fontSize):0,min=size*0.8;
var bad=function(){return els.some(function(e){return e.scrollWidth>e.clientWidth+1;});};
while(els.length&&bad()&&size>min){size-=1;els.forEach(function(e){e.style.fontSize=size+"px";});}
window.__fit={nameSize:size,names:els.map(function(e){return {text:e.textContent,fits:e.scrollWidth<=e.clientWidth+1};})};})();</script>`;

const panel = (team, players, o, doc, eventId) => `<div class="lcol" data-team="${esc(team.abbr)}" style="--c:${esc(team.accent)};--tc:${esc(team.color)};--tink:${esc(team.ink)}">
<div class="lhead"><div class="mark"><span>${esc(team.abbr)}</span></div><h3>${esc(team.nickname)}</h3></div>
<div class="chd">${BOX_FAMILIES.map((f) => `<span>${BOX_HEAD[f]}</span>`).join("")}</div>
<div class="prows">${players.map((p) => `<div class="prow" data-player-id="${esc(p.playerId)}"><span class="pname">${esc(p.name)}</span><div class="cells">${BOX_FAMILIES.map((f) => {
    const entry = p.cells[f] ?? null;
    return cellHtml(entry?.rowId ?? cellId(doc, eventId, p.playerId, f), boxCell(entry, o));
  }).join("")}</div></div>`).join("\n")}</div>
</div>`;

/**
 * One box-score card (page `page` of the game's pages).
 * @param {{ doc: any, page: ReturnType<typeof boxScorePages>[number], showLine?: boolean }} o
 */
export function renderBoxScoreCardHtml({ doc, page, showLine = true }) {
  const o = { showLine };
  const review = doc.purpose === PURPOSE.FOUNDER_REVIEW;
  const test = doc.artifact?.testData === true;
  const awayT = boxTeam(page.away), homeT = boxTeam(page.home);
  const eventId = page.event.eventId;
  const compared = pageComparedRows(page);
  if (!compared.length) throw new Error(`${eventId}: no compared cell on this card`);
  const top = review ? 72 : 40;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(`NBA ${page.event.matchup} projections vs lines`)}</title><style>${fontFaces()}
${CSS}</style></head>
<body style="--ca:${esc(awayT.accent)};--cb:${esc(homeT.accent)};--top:${top}px" data-template="${BOX_TEMPLATE}" data-purpose="${esc(doc.purpose)}" data-test-data="${test}" data-event-id="${esc(eventId)}" data-page="${page.page}|${page.pages}">
<div class="stage"><div class="half l"></div><div class="half r"></div><div class="ghost l">${esc(awayT.abbr)}</div><div class="ghost r">${esc(homeT.abbr)}</div>
<div class="beams"><div class="beam" style="left:60px;transform:rotate(-24deg)"></div><div class="beam" style="left:170px;transform:rotate(-15deg);opacity:.7"></div><div class="beam" style="right:60px;transform:rotate(24deg)"></div><div class="beam" style="right:170px;transform:rotate(15deg);opacity:.7"></div></div>
<div class="flare" style="left:-120px;top:-150px"></div><div class="flare" style="right:-120px;top:-150px"></div><div class="seam"></div><div class="vignette"></div>
<svg class="grain" width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg></div>
${review ? `<div class="review">${esc(REVIEW_BANNER)}</div>` : ""}
${test ? `<div class="watermark">${esc(TEST_WATERMARK)}</div>` : ""}
<div class="legend" aria-label="Colour legend">${LEGEND.map((l) => `<div class="${l.cls}"><i>${esc(l.glyph)}</i><span>${esc(l.text)}</span></div>`).join("")}</div>
<main class="content">
<div class="top"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div class="chip">${esc(`NBA · ${tipEt(page.event.tipUtc)}`)}</div></div>
<div class="kicker">Projections vs sportsbook lines</div>
<div class="matchup">${esc(`${page.away} @ ${page.home}${page.pages > 1 ? ` · ${page.page} of ${page.pages}` : ""}`)}</div>
<section class="lines" data-event-id="${esc(eventId)}">
${panel(awayT, page.awayPlayers, o, doc, eventId)}
${panel(homeT, page.homePlayers, o, doc, eventId)}
</section>
<footer class="foot">
<div class="social">${X_MARK}<span>${esc(SOCIAL_HANDLE)}</span></div>
<p class="q">${esc(quoteLine(compared))} ${esc(BOX_FOOTER.lines)}</p>
<p>${esc(FOOTER.advice)} ${esc(FOOTER.responsible)} ${esc(BOX_FOOTER.affiliation)}</p>
</footer>
</main>
${FIT_SCRIPT}
</body></html>
`;
}

/* ───────────────────────────── validation ───────────────────────────── */

/** Visible text of a box-score card (the fit script is not text). */
export const boxVisibleText = (html) => visibleText(html.replace(/<script>[\s\S]*?<\/script>/g, " "));
const wordIn = (text, w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(text);

/**
 * The card says exactly what the export says: the page's cells in order, each with its own number, colour class, arrow,
 * and (only when that side's price is shown) the price of the side its colour shows; legend, footer, no difference, no
 * book name, no internal jargon, no banned words. [] when it holds.
 */
export function verifyBoxScoreCardHtml(html, doc, page, o = {}) {
  const v = [];
  const cells = pageCells(doc, page, o);
  const ids = [...html.matchAll(/data-cell="([^"]+)"/g)].map((m) => m[1]);
  const want = cells.map((c) => esc(c.id));
  if (JSON.stringify(ids) !== JSON.stringify(want)) v.push(`cells on the card ${ids.length} ≠ export cells ${want.length} (or out of order)`);
  for (const { id, entry, cell } of cells) {
    const start = html.indexOf(`data-cell="${esc(id)}"`);
    if (start === -1) { v.push(`${id}: missing`); continue; }
    const next = html.indexOf("data-cell=", start + 10);
    const seg = html.slice(start, next === -1 ? html.indexOf("</section>", start) : next);
    // the colour class follows the export row's direction, independently re-derived here
    const want = !entry ? "absent" : !isCompared(entry) ? "none" : { OVER: "over", UNDER: "under", NEUTRAL: "neutral" }[entry.market.direction.side];
    if (cell.state !== want) v.push(`${id}: cell state ${cell.state} ≠ ${want}`);
    if (!html.slice(Math.max(0, start - 40), start).includes(`class="cell ${want}"`) || !seg.includes(`data-state="${want}"`)) v.push(`${id}: colour class is not ${want}`);
    const num = entry ? entry.model.display : ABSENT_TEXT;
    if (!seg.includes(`<span class="v">${esc(num)}</span>`)) v.push(`${id}: number is not ${num}`);
    const glyphs = [...seg.matchAll(/<span class="gl">([^<]*)<\/span>/g)].map((m) => m[1]);
    const wantGlyph = want === "over" ? ["▲"] : want === "under" ? ["▼"] : [];
    if (JSON.stringify(glyphs) !== JSON.stringify(wantGlyph)) v.push(`${id}: arrow ${JSON.stringify(glyphs)} ≠ ${JSON.stringify(wantGlyph)}`);
    const prices = [...seg.matchAll(/<span class="px">([^<]*)<\/span>/g)].map((m) => m[1]);
    const pf = want === "over" ? entry.market.overPrice : want === "under" ? entry.market.underPrice : null;
    const wantPrice = pf?.state === "SHOWN" ? [esc(pf.text)] : [];
    if (JSON.stringify(prices) !== JSON.stringify(wantPrice)) v.push(`${id}: price ${JSON.stringify(prices)} ≠ ${JSON.stringify(wantPrice)} (the ${want} side)`);
    const lines = [...seg.matchAll(/<span class="sl">([^<]*)<\/span>/g)].map((m) => m[1]);
    const wantLine = (want === "over" || want === "under") && o.showLine !== false ? [`${want === "over" ? "O" : "U"} ${esc(entry.market.line.text)}`] : [];
    if (JSON.stringify(lines) !== JSON.stringify(wantLine)) v.push(`${id}: line ${JSON.stringify(lines)} ≠ ${JSON.stringify(wantLine)}`);
  }
  const text = boxVisibleText(html);
  for (const l of LEGEND) if (!html.includes(`<div class="${l.cls}"><i>${esc(l.glyph)}</i><span>${esc(l.text)}</span></div>`)) v.push(`legend missing: ${l.text}`);
  for (const s of [quoteLine(pageComparedRows(page)), BOX_FOOTER.lines, FOOTER.advice, FOOTER.responsible, BOX_FOOTER.affiliation]) if (!text.includes(s)) v.push(`footer missing: ${s}`);
  for (const b of BOOK_LABELS) if (text.toLowerCase().includes(b.toLowerCase())) v.push(`book name on the card: ${b}`);
  for (const r of pageComparedRows(page)) if (r.market.book?.label && text.includes(r.market.book.label)) v.push(`book name on the card: ${r.market.book.label}`);
  for (const w of JARGON) if (wordIn(text, w)) v.push(`internal term on the card: ${w}`);
  if (/c-diff|class="diff|difference/i.test(html.replace(/<style>[\s\S]*?<\/style>/, ""))) v.push("a difference column is on the card");
  for (const w of BANNED_WORDS) if (wordIn(text, w)) v.push(`banned word on the card: ${w}`);
  if (doc.purpose === PURPOSE.FOUNDER_REVIEW && !text.includes(REVIEW_BANNER)) v.push("founder-review banner missing");
  if (doc.artifact?.testData === true && !text.includes(TEST_WATERMARK)) v.push("test-data watermark missing");
  if (/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(html)) v.push("the card references a remote URL");
  return v;
}

/* ───────────────────────────── caption ───────────────────────────── */

/** One caption per box-score card (strings copied; no promises; no em or en dash). */
export function boxScoreCaption(doc, page) {
  const a = boxTeam(page.away), h = boxTeam(page.home);
  const n = page.awayPlayers.length + page.homePlayers.length;
  const text = [
    `${a.name} at ${h.name}, tip ${tipEt(page.event.tipUtc)}${page.pages > 1 ? ` (card ${page.page} of ${page.pages})` : ""}.`,
    `Our model's projected points, rebounds and assists for ${n} player${n === 1 ? "" : "s"}, set against sportsbook lines quoted ${quoteRangeText(pageComparedRows(page))}.`,
    "Green means the projection is above the line, red means below it, grey means no qualified comparison; the odds shown are for that side of the line.",
    `${FOOTER.advice} ${FOOTER.responsible}`,
  ].join(" ");
  if (text.includes(EM_DASH) || text.includes(EN_DASH)) throw new Error(`caption contains a dash: ${text}`);
  return text;
}
