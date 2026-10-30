/**
 * NBA OVER/UNDER COMPARISON CARDS — HTML templates, captions and the hard pre-render validation for the Friday graphics
 * (render-nba-line-graphics.mjs). Script-only: never imported by a page, component or route (guard:
 * src/lib/social/nba-line-graphics.test.mjs). Pure apart from reading the approved logo once (logoDataUri).
 *
 * Every printed number is a STRING COPIED from a `gtp-graphics-export@2` row (lib/social/nba-line-graphics-export.mjs):
 * model.display, market.line.text, market.difference.text, prices' text, quotedAt.et. Nothing here rounds, compares or
 * ranks. Row order is the export's (family, then expected minutes), never by difference.
 *
 * Direction is not confidence: the cards print OVER / UNDER / NEUTRAL with the glyph and the word always (colour is never
 * the only signal) and carry a fixed footer: model projection vs observed line, the quote time, Not betting advice and the
 * responsible-gambling line. No promotional or certainty language (BANNED_WORDS is asserted on every card and caption).
 *
 * BRAND: the approved logo (public/brand/gametime-picks-logo.webp) and the site palette (globals.css tokens, copied as
 * literals because a standalone image has no stylesheet): --lava-bg #070B09, --lava-card #121A16, --lava-border
 * rgba(52,211,153,0.34), --vault-accent #34D399, --lava-text #F5F7F6, --lava-text-muted #B4BEB8, --lava-text-faint
 * #8B978F, --vault-success #4ADE80 (OVER), --vault-danger #F87171 (UNDER), --vault-text-mute #B4BEB8 (NEUTRAL),
 * --vault-gold #D4AF37. Fonts: the site stack (Geist / Space Grotesk / JetBrains Mono) when installed, else the local
 * system sans; nothing is fetched (deterministic, offline).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fmt1, lineText, signedDifference, quoteTimeEt, americanPrice, SIDE_GLYPH } from "../../src/lib/odds/prop-line-view.mjs";
import { directionAuthorization } from "../../src/lib/odds/display-authorization.mjs";
import { LINE_MAX_AGE_HOURS } from "../../src/lib/sports/nba/line-comparison.mjs";
import { instantMs } from "../../src/lib/social/graphics-export.mjs";
import { PURPOSE, lineGraphicsExportViolations } from "../../src/lib/social/nba-line-graphics-export.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PALETTE = Object.freeze({
  bg: "#070B09", card: "#121A16", panel: "#0F1512", border: "rgba(52, 211, 153, 0.34)", accent: "#34D399",
  text: "#F5F7F6", muted: "#B4BEB8", faint: "#8B978F", over: "#4ADE80", under: "#F87171", neutral: "#B4BEB8", gold: "#D4AF37",
});
export const SIDE_COLOR = Object.freeze({ OVER: PALETTE.over, UNDER: PALETTE.under, NEUTRAL: PALETTE.neutral });
export const SIZES = Object.freeze({
  landscape: Object.freeze({ key: "1600x900", width: 1600, height: 900, maxRows: 6 }),
  portrait: Object.freeze({ key: "1080x1350", width: 1080, height: 1350, maxRows: 8 }),
});

export const FOOTER = Object.freeze({
  method: "Model projection vs observed sportsbook line. OVER, UNDER and NEUTRAL show where the model's median sits against that one line. They are not a probability or a pick.",
  advice: "Not betting advice.",
  responsible: "21+ where required; the legal age varies by state. Gambling problem? Call 1-800-GAMBLER.",
});
export const TEST_WATERMARK = "TEST DATA — NOT LIVE ODDS";
export const REVIEW_BANNER = "FOUNDER REVIEW ONLY · NOT AUTHORIZED FOR SOCIAL POSTING";
/** Words that make direction sound like confidence or promise an outcome. Checked on visible card text and captions. */
export const BANNED_WORDS = Object.freeze(["edge", "edges", "lock", "locks", "value", "best bet", "guarantee", "guaranteed", "profit", "sure thing", "can't lose", "cannot lose", "free money", "hammer", "smash", "winner", "winning pick", "will hit", "will win"]);
export const EM_DASH = "—";
export const EN_DASH = "–";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let LOGO = null;
/** The approved logo as a data URI (read once; never fetched). */
export function logoDataUri() {
  if (LOGO == null) LOGO = `data:image/webp;base64,${fs.readFileSync(path.join(APP, "public", "brand", "gametime-picks-logo.webp")).toString("base64")}`;
  return LOGO;
}

export const tipEt = (tipUtc) => {
  const t = instantMs(tipUtc);
  if (!Number.isFinite(t)) return "—";
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }).format(new Date(t))} · ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(t))} ET`;
};
const slateDateText = (date) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));

/** Rows of one game for a card: the export's order, the first `max`. */
export function selectCardRows(doc, eventId, max) {
  const all = doc.rows.filter((r) => r.identity.eventId === eventId && r.market.line.state === "SHOWN");
  return { rows: all.slice(0, max), overflow: Math.max(0, all.length - max), total: all.length };
}

const pricesShown = (r) => r.market.book.state === "SHOWN" && r.market.overPrice.state === "SHOWN" && r.market.underPrice.state === "SHOWN";

/** The exact strings a card prints for one row (the image-data contract the tests and the validator assert). */
export function rowCells(r) {
  const prices = pricesShown(r);
  return {
    player: r.identity.playerName,
    team: r.identity.team,
    market: r.identity.marketLabel,
    model: r.model.display,
    line: r.market.line.text,
    glyph: r.market.direction.glyph,
    word: r.market.direction.word,
    difference: r.market.difference.text,
    book: prices ? r.market.book.label : null,
    odds: prices ? `O ${r.market.overPrice.text} · U ${r.market.underPrice.text}` : null,
  };
}

/** Each cell's exact markup (so a test or the validator can find it verbatim in the HTML). */
export function rowCellMarkup(r) {
  const c = rowCells(r);
  return [
    `<span class="pname">${esc(c.player)}</span>`,
    `<span class="pteam">${esc(c.team)}</span>`,
    `<div class="c-market">${esc(c.market)}</div>`,
    `<div class="c-num c-model">${esc(c.model)}</div>`,
    `<div class="c-num c-line">${esc(c.line)}</div>`,
    `<span class="glyph">${esc(c.glyph)}</span><span class="word">${esc(c.word)}</span>`,
    `<div class="c-num c-diff">${esc(c.difference)}</div>`,
    ...(c.book ? [`<span class="bname">${esc(c.book)}</span>`, `<span class="odds">${esc(c.odds)}</span>`] : []),
  ];
}

function rowHtml(r) {
  const m = rowCellMarkup(r);
  const c = rowCells(r);
  const side = r.market.direction.side;
  return `<div class="row" data-row-id="${esc(r.rowId)}" data-side="${esc(side)}">
<div class="c-player">${m[0]}${m[1]}</div>
${m[2]}
${m[3]}
${m[4]}
<div class="c-dir" style="color:${SIDE_COLOR[side]};border-color:${SIDE_COLOR[side]}">${m[5]}</div>
${m[6]}
<div class="c-book">${c.book ? `${m[7]}${m[8]}` : ""}</div>
</div>`;
}

/** "Oct 29, 4:00 PM ET" or "Oct 29, 3:30 PM ET to Oct 29, 4:00 PM ET" from the rows' own quote texts. */
export function quoteRangeText(rows) {
  const isos = [...new Set(rows.map((r) => r.market.quotedAt.iso))].sort((a, b) => Date.parse(a) - Date.parse(b));
  if (!isos.length) return "—";
  const first = rows.find((r) => r.market.quotedAt.iso === isos[0]).market.quotedAt.et;
  const last = rows.find((r) => r.market.quotedAt.iso === isos[isos.length - 1]).market.quotedAt.et;
  return first === last ? first : `${first} to ${last}`;
}

const BASE_CSS = (w, h, l, top) => `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;background:${PALETTE.bg};color:${PALETTE.text};font-family:"Geist","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:radial-gradient(60% 60% at 50% 0%,rgba(52,211,153,0.14) 0%,transparent 70%),${PALETTE.bg};display:flex;flex-direction:column;padding:${l.SPAD}px}
.review{position:absolute;top:0;left:0;right:0;height:34px;background:${PALETTE.gold};color:${PALETTE.bg};font:700 18px/34px "JetBrains Mono",Menlo,monospace;text-align:center;letter-spacing:2px;z-index:5}
.watermark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-24deg);white-space:nowrap;font:900 ${l.WM}px/1 "Space Grotesk","Helvetica Neue",Arial,sans-serif;color:rgba(248,113,113,0.30);border:6px solid rgba(248,113,113,0.30);padding:10px 30px;z-index:4;pointer-events:none}
.head{display:flex;align-items:center;gap:24px;margin-top:${top}px}
.logo{width:${l.LOGOW}px;height:auto}
.eyebrow{font:700 20px/1.2 "JetBrains Mono",Menlo,monospace;letter-spacing:3px;color:${PALETTE.accent};text-transform:uppercase}
.title{font:800 ${l.TITLE}px/1.05 "Space Grotesk","Helvetica Neue",Arial,sans-serif;letter-spacing:-1px}
.sub{font:500 24px/1.3 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.table{margin-top:22px;flex:1;display:flex;flex-direction:column;gap:${l.ROWGAP}px}
.hdr,.row{display:grid;grid-template-columns:${l.GRID};align-items:center;column-gap:16px}
.hdr{font:700 16px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:2px;color:${PALETTE.faint};text-transform:uppercase;padding:0 22px 4px}
.row{background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:14px;padding:0 22px;height:${l.ROWH}px}
.c-player{display:flex;flex-direction:column;gap:4px;min-width:0}
.pname{font:700 ${l.PNAME}px/1.1 "Geist","Helvetica Neue",Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pteam{font:600 16px/1 "JetBrains Mono",Menlo,monospace;color:${PALETTE.faint};letter-spacing:1px}
.c-market{font:600 20px/1.15 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.c-num{font:700 30px/1 "JetBrains Mono",Menlo,monospace;text-align:right;font-variant-numeric:tabular-nums}
.c-model{color:${PALETTE.text}}
.c-line{color:${PALETTE.muted}}
.c-dir{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:2px solid;border-radius:999px;padding:8px 12px;font:800 22px/1 "Space Grotesk","Helvetica Neue",Arial,sans-serif;letter-spacing:1px}
.c-diff{color:${PALETTE.text}}
.c-book{display:flex;flex-direction:column;gap:4px;text-align:right}
.bname{font:600 17px/1 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.odds{font:600 16px/1 "JetBrains Mono",Menlo,monospace;color:${PALETTE.faint}}
.more{font:500 18px/1.2 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.faint};padding:2px 22px}
.foot{margin-top:16px;border-top:1px solid ${PALETTE.border};padding-top:14px;display:flex;flex-direction:column;gap:6px}
.foot p{font:500 ${l.FOOT}px/1.35 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.foot .q{color:${PALETTE.text};font-weight:600}
.games{margin-top:26px;flex:1;display:flex;flex-direction:column;gap:12px}
.game{display:grid;grid-template-columns:${l.GGRID};align-items:center;column-gap:16px;background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:14px;padding:0 24px;height:${l.GROWH}px}
.gm{font:800 30px/1 "Space Grotesk","Helvetica Neue",Arial,sans-serif}
.gt{font:600 20px/1.2 "JetBrains Mono",Menlo,monospace;color:${PALETTE.muted}}
.gc{font:600 20px/1.3 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted};text-align:right}
.gc b{font-weight:800}
.compact .game{grid-template-columns:1fr auto;row-gap:3px;padding:6px 22px;height:auto}
.compact .gc{grid-column:1 / -1;text-align:left;font-size:18px}
.compact .gm{font-size:25px}
.compact .gt{font-size:17px;text-align:right}
.p .row{height:auto;min-height:${l.ROWH}px;padding:9px 22px;row-gap:6px}
.p .pname{white-space:normal}
.p .c-book{grid-column:1 / -1;flex-direction:row;justify-content:flex-start;align-items:baseline;gap:14px;text-align:left}
`;

function layout(size) {
  const land = size.key === SIZES.landscape.key;
  return {
    SPAD: land ? 44 : 48, LOGOW: land ? 130 : 150, TITLE: land ? 64 : 72, ROWGAP: land ? 9 : 10, ROWH: land ? 70 : 80,
    PNAME: land ? 26 : 26, FOOT: land ? 17 : 19, WM: land ? 120 : 92, GROWH: land ? 92 : 104,
    GRID: land ? "minmax(0,3.2fr) 2.2fr 1.1fr 1.1fr 1.6fr 1.1fr 2fr" : "minmax(0,3fr) 1.9fr 1.1fr 1.1fr 1.7fr 1.1fr",
    GGRID: land ? "1.3fr 1.5fr 2.6fr" : "1fr 1fr",
  };
}
const css = (size, extraTop) => BASE_CSS(size.width, size.height, layout(size), extraTop);

function shell({ size, doc, body, title }) {
  const review = doc.purpose === PURPOSE.FOUNDER_REVIEW;
  const test = doc.artifact?.testData === true;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css(size, review ? 30 : 0)}</style></head>
<body><main class="card${size.key === SIZES.portrait.key ? " p" : ""}" data-purpose="${esc(doc.purpose)}" data-test-data="${test}">
${review ? `<div class="review">${esc(REVIEW_BANNER)}</div>` : ""}
${test ? `<div class="watermark">${esc(TEST_WATERMARK)}</div>` : ""}
${body}
</main></body></html>
`;
}

function footer(rows) {
  return `<footer class="foot">
<p class="q">Lines quoted ${esc(quoteRangeText(rows))}. Model projections are official medians frozen before tip.</p>
<p>${esc(FOOTER.method)}</p>
<p>${esc(FOOTER.advice)} ${esc(FOOTER.responsible)}</p>
</footer>`;
}

/**
 * One game card.
 * @param {{ doc: any, eventId: string, size: typeof SIZES.landscape }} o
 */
export function renderGameCardHtml({ doc, eventId, size }) {
  const ev = doc.events.find((e) => e.eventId === eventId);
  if (!ev) throw new Error(`no event ${eventId} in the export`);
  const { rows, overflow } = selectCardRows(doc, eventId, size.maxRows);
  if (!rows.length) throw new Error(`${eventId}: no comparisons to render`);
  const land = size.key === SIZES.landscape.key;
  const anyBook = rows.some((r) => pricesShown(r));
  const hdr = `<div class="hdr"><div>Player</div><div>Market</div><div style="text-align:right">Model</div><div style="text-align:right">Line</div><div style="text-align:center">Direction</div><div style="text-align:right">Diff</div>${land ? `<div style="text-align:right">${anyBook ? "Book · odds" : ""}</div>` : ""}</div>`;
  const rowsHtml = rows.map(rowHtml).join("\n");
  const body = `<header class="head"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div>
<div class="eyebrow">NBA · Model projection vs sportsbook line</div>
<div class="title">${esc(ev.matchup)}</div>
<div class="sub">Tip ${esc(tipEt(ev.tipUtc))}</div>
</div></header>
<section class="table" data-event-id="${esc(eventId)}">
${hdr}
${rowsHtml}
${overflow ? `<div class="more">${overflow} more comparison${overflow === 1 ? "" : "s"} for this game are in the export.</div>` : ""}
</section>
${footer(rows)}`;
  return shell({ size, doc, body, title: `NBA ${ev.matchup} model vs line` });
}

/** The slate summary card: per game counts only (no numbers that are not in the export's events block). */
export function renderSummaryCardHtml({ doc, size }) {
  const evs = doc.events.filter((e) => e.rows > 0);
  if (!evs.length) throw new Error("no game has a comparison to summarise");
  const rows = doc.rows.filter((r) => r.market.line.state === "SHOWN");
  const total = evs.reduce((a, e) => a + e.rows, 0);
  const sum = (k) => evs.reduce((a, e) => a + e[k], 0);
  // Large slates (Friday: 10 games) use a compact two-line row; landscape splits into two columns beyond 5 games.
  const land = size.key === SIZES.landscape.key;
  const compact = land ? evs.length > 4 : evs.length > 6;
  const cols = land && evs.length > 5 ? 2 : 1;
  const gap = compact ? 7 : 12;
  const games = evs.map((e) => `<div class="game" data-event-id="${esc(e.eventId)}"><div class="gm">${esc(e.matchup)}</div><div class="gt">${esc(tipEt(e.tipUtc))}</div><div class="gc" data-counts="${e.rows}|${e.over}|${e.under}|${e.neutral}">${summaryCountsText(e)}</div></div>`).join("\n");
  const body = `<header class="head"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div>
<div class="eyebrow">NBA · Model projection vs sportsbook line</div>
<div class="title">${esc(slateDateText(doc.edition.date))}</div>
<div class="sub" data-total="${total}|${sum("over")}|${sum("under")}|${sum("neutral")}">${evs.length} game${evs.length === 1 ? "" : "s"} · ${total} comparison${total === 1 ? "" : "s"} · ${sum("over")} OVER · ${sum("under")} UNDER · ${sum("neutral")} NEUTRAL</div>
</div></header>
<section class="games${compact ? " compact" : ""}" style="${compact ? `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${gap}px;align-content:start` : ""}">
${games}
<div class="more" style="grid-column:1 / -1">Points, rebounds, assists and their combinations. 3-pointers made is not compared.</div>
</section>
${footer(rows)}`;
  return shell({ size, doc, body, title: `NBA ${doc.edition.date} model vs line` });
}
export const summaryCountsText = (e) => `${e.rows} comparison${e.rows === 1 ? "" : "s"}: <b style="color:${PALETTE.over}">▲ ${e.over} OVER</b> · <b style="color:${PALETTE.under}">▼ ${e.under} UNDER</b> · <b style="color:${PALETTE.neutral}">= ${e.neutral} NEUTRAL</b>`;

/** Visible text of a card (tags, styles and the data-URI logo removed). */
export function visibleText(html) {
  return html.replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<title>[\s\S]*?<\/title>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

const bannedIn = (text) => BANNED_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/'/g, "'")}([^a-z]|$)`, "i").test(text));

/**
 * The card HTML says exactly what the export rows say: every row's cells verbatim, in its own row block, no other rows,
 * the footer, and no banned words. [] when it holds.
 */
export function verifyCardHtml(html, rows, { kind = "game" } = {}) {
  const v = [];
  if (kind === "game") {
    const ids = [...html.matchAll(/data-row-id="([^"]+)"/g)].map((m) => m[1]);
    const want = rows.map((r) => esc(r.rowId));
    if (JSON.stringify(ids) !== JSON.stringify(want)) v.push(`rows on the card ${JSON.stringify(ids)} ≠ export rows ${JSON.stringify(want)}`);
    for (const r of rows) {
      const start = html.indexOf(`data-row-id="${esc(r.rowId)}"`);
      const next = html.indexOf("data-row-id=", start + 12);
      const seg = html.slice(start, next === -1 ? html.indexOf("</section>", start) : next);
      for (const cell of rowCellMarkup(r)) if (!seg.includes(cell)) v.push(`${r.rowId}: card is missing ${cell}`);
      if (!seg.includes(`data-side="${r.market.direction.side}"`)) v.push(`${r.rowId}: side attribute`);
      if (r.market.book.state !== "SHOWN" && /class="(bname|odds)"/.test(seg)) v.push(`${r.rowId}: book or odds printed while withheld`);
    }
  }
  const text = visibleText(html);
  for (const s of [FOOTER.method, FOOTER.advice, FOOTER.responsible, "Lines quoted"]) if (!text.includes(s)) v.push(`footer missing: ${s}`);
  const b = bannedIn(text);
  if (b.length) v.push(`banned words on the card: ${b.join(", ")}`);
  return v;
}

/* ─────────────────────────────── hard validation against the sources ─────────────────────────────── */

const laneMedian = (lane, eventId, playerId, family) => {
  const g = (lane?.games ?? []).find((x) => String(x.providerEventId) === String(eventId));
  const p = ["away", "home"].flatMap((s) => g?.players?.[s] ?? []).find((x) => String(x.providerAthleteId) === String(playerId));
  if (!p) return undefined;
  return ["pra", "ptsReb", "ptsAst"].includes(family) ? p.comboMedians?.[family] : p.medians?.[family];
};

/**
 * Before any PNG: every displayed number equals the export row, which equals the canonical lane value (read here from the
 * lane document itself, not through the export) and the artifact's own compared row; stale lines, started games and
 * unqualified families are absent. [] when it holds.
 * @param {{ doc: any, lane: any, artifact: any }} o
 */
export function verifyAgainstSources({ doc, lane, artifact }) {
  const v = [...lineGraphicsExportViolations(doc)];
  const asOf = Date.parse(doc.asOf);
  const art = new Map((artifact?.events ?? []).flatMap((e) => (e.rows ?? []).map((r) => [`${r.eventId}|${r.athleteId}|${r.family}`, r])));
  for (const r of doc.rows) {
    const id = r.rowId;
    const { eventId, playerId, market: family, tipUtc } = r.identity;
    const lm = laneMedian(lane, eventId, playerId, family);
    if (lm !== r.model.value) v.push(`${id}: lane value ${lm} ≠ export ${r.model.value}`);
    if (fmt1(lm) !== r.model.display) v.push(`${id}: lane display ${fmt1(lm)} ≠ export ${r.model.display}`);
    if (!directionAuthorization("nba", family, "site").ok) v.push(`${id}: unqualified family ${family}`);
    const tip = instantMs(tipUtc);
    if (!(tip > asOf)) v.push(`${id}: game started`);
    if (r.market.line.state !== "SHOWN") continue;
    const a = art.get(`${eventId}|${playerId}|${family}`);
    if (!a) { v.push(`${id}: not in the artifact`); continue; }
    if (a.projection !== r.model.value) v.push(`${id}: artifact projection ${a.projection} ≠ ${r.model.value}`);
    if (a.line !== r.market.line.value || lineText(a.line) !== r.market.line.text) v.push(`${id}: artifact line ${a.line} ≠ ${r.market.line.value}`);
    if (a.side !== r.market.direction.side || SIDE_GLYPH[a.side] !== r.market.direction.glyph) v.push(`${id}: artifact side ${a.side} ≠ ${r.market.direction.side}`);
    if (signedDifference(a.projection - a.line).text !== r.market.difference.text) v.push(`${id}: difference ${r.market.difference.text} ≠ artifact ${signedDifference(a.projection - a.line).text}`);
    if (a.capturedAt !== r.market.quotedAt.iso || quoteTimeEt(a.capturedAt) !== r.market.quotedAt.et) v.push(`${id}: quote time`);
    const cap = Date.parse(a.capturedAt);
    if (!(cap < tip) || asOf - cap > LINE_MAX_AGE_HOURS * 3600_000 || cap > asOf) v.push(`${id}: stale or post-tip line (captured ${a.capturedAt})`);
    if (r.market.book.state === "SHOWN" && a.book !== r.market.book.key) v.push(`${id}: book`);
    if (r.market.overPrice.state === "SHOWN" && americanPrice(a.overPrice).text !== r.market.overPrice.text) v.push(`${id}: over price`);
    if (r.market.underPrice.state === "SHOWN" && americanPrice(a.underPrice).text !== r.market.underPrice.text) v.push(`${id}: under price`);
  }
  // model-only medians (printed grey on the box-score cards): lane value, qualified family, game not started
  for (const r of doc.modelOnly ?? []) {
    const { eventId, playerId, market: family, tipUtc } = r.identity;
    const lm = laneMedian(lane, eventId, playerId, family);
    if (lm !== r.model.value || fmt1(lm) !== r.model.display) v.push(`${r.rowId}: lane value ${lm} ≠ model-only ${r.model.value}`);
    if (!directionAuthorization("nba", family, "site").ok) v.push(`${r.rowId}: unqualified family ${family}`);
    if (!(instantMs(tipUtc) > asOf)) v.push(`${r.rowId}: game started`);
    if (doc.rows.some((x) => x.rowId === r.rowId)) v.push(`${r.rowId}: both compared and model-only`);
  }
  return v;
}

/* ─────────────────────────────────────────── captions ─────────────────────────────────────────── */

const lower = (s) => String(s).replace(/^(\w)/, (c) => c.toLowerCase());

/** One natural caption per game card, from the card's own rows (strings copied, no promises, no em dashes). */
export function gameCaption(doc, eventId, size = SIZES.landscape) {
  const ev = doc.events.find((e) => e.eventId === eventId);
  const { rows } = selectCardRows(doc, eventId, size.maxRows);
  const [away, home] = ev.matchup.split(" @ ");
  const books = [...new Set(rows.filter(pricesShown).map((r) => r.market.book.label))];
  const parts = rows.map((r) => `${r.identity.playerName} ${lower(r.identity.marketLabel)}: model ${r.model.display}, line ${r.market.line.text} (${r.market.direction.word}, ${r.market.difference.text})`);
  return [
    `${away} at ${home}, tip ${tipEt(ev.tipUtc)}.`,
    `Our model's projections next to ${books.length ? `${books.join(" and ")} lines` : "sportsbook lines"} quoted ${quoteRangeText(rows)}.`,
    `${parts.join("; ")}.`,
    "OVER and UNDER only say where the model's median sits against that line.",
    `${FOOTER.advice} ${FOOTER.responsible}`,
  ].join(" ");
}

/** The slate caption (counts from the export's events block). */
export function summaryCaption(doc) {
  const evs = doc.events.filter((e) => e.rows > 0);
  const total = evs.reduce((a, e) => a + e.rows, 0);
  const sum = (k) => evs.reduce((a, e) => a + e[k], 0);
  return [
    `NBA, ${slateDateText(doc.edition.date)}: our model's official projections set against sportsbook lines for ${evs.length} game${evs.length === 1 ? "" : "s"}.`,
    `Across ${total} comparison${total === 1 ? "" : "s"}, the model sits above the line ${sum("over")} times, below it ${sum("under")} times and level with it ${sum("neutral")} times.`,
    "Points, rebounds, assists and their combinations only.",
    "OVER and UNDER describe the model against one line, not a probability or a pick.",
    `${FOOTER.advice} ${FOOTER.responsible}`,
  ].join(" ");
}

/** [] when a caption is clean: no em or en dash, no banned or promissory words. */
export function captionViolations(text) {
  const v = [];
  if (text.includes(EM_DASH)) v.push("caption contains an em dash");
  if (text.includes(EN_DASH)) v.push("caption contains an en dash");
  const b = bannedIn(text);
  if (b.length) v.push(`caption contains banned words: ${b.join(", ")}`);
  if (!text.includes(FOOTER.advice)) v.push("caption lacks Not betting advice");
  if (!text.includes("1-800-GAMBLER")) v.push("caption lacks the responsible-gambling line");
  return v;
}
