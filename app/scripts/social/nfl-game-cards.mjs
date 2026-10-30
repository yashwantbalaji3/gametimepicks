/**
 * NFL PER-GAME PLAYER PROJECTION CARDS — HTML templates, captions and the hard pre-render validation for the Week 8
 * Sunday/Monday graphics (render-nfl-game-graphics.mjs). Script-only: never imported by a page, component or route
 * (guard: src/lib/social/nfl-game-graphics.test.mjs). Pure apart from reading the approved logo once.
 *
 * Every printed number is a STRING COPIED from a `gtp-graphics-export@1` NFL_GAME_PLAYERS row
 * (lib/social/nfl-game-graphics-export.mjs): model.display, which is forecast-view.mjs formatValue of the official
 * snapshot's stored number. Nothing here rounds, compares or ranks; row order is the export's.
 *
 * Layout: 1080×1350 portrait, box-score style: away team panel above home team panel, each in position groups (QB, RB,
 * WR/TE) with position-aware columns. A team with more than ROWS_PER_TEAM_PAGE players continues on a second image.
 * A cell with no official number prints "—" (class "na"), explained in the footer. A labelled ESTIMATE cell (passing and
 * rushing yards today; founder P0 2026-10-30) prints the game page's digits with a small "est." marker (class "est"),
 * and the footer carries the estimate's one label text (family-publication.mjs estimateLabel) — never as a pick.
 *
 * SPORTSBOOK SLOT: marketSlot() is the only path a line, price or OVER/UNDER colour can take onto a card, and it opens
 * only when the NFL social surface is authorized AND the family is direction-qualified AND the row carries a SHOWN line
 * (never in contract @1). Today every NFL family is unqualified and social is not authorized: the slot is always empty.
 *
 * BRAND: public/brand/gametime-picks-logo.png and the site palette (as in nba-line-cards.mjs PALETTE).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PALETTE, SIDE_COLOR, BANNED_WORDS, EM_DASH, EN_DASH, tipEt, visibleText } from "./nba-line-cards.mjs";
import { displayAuthorization, directionAuthorization, DISPLAY_AUTHORIZATION } from "../../src/lib/odds/display-authorization.mjs";
import { formatValue, MARKET_KEY } from "../../src/lib/sports/nfl/forecast-view.mjs";
import { estimateLabel } from "../../src/lib/sports/nfl/family-publication.mjs";
import { BOARD_METRIC } from "../../src/lib/sports/nfl/board-ranking.mjs";
import { graphicsExportViolations, MODEL_STATUS, instantMs } from "../../src/lib/social/graphics-export.mjs";
import { ESTIMATE_DISPLAY, FAMILY, GROUPS, PURPOSE, EXCLUDED_AVAILABILITY } from "../../src/lib/social/nfl-game-graphics-export.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SIZE = Object.freeze({ key: "1080x1350", width: 1080, height: 1350 });
export const ROWS_PER_TEAM_PAGE = 7;
export const MISSING = EM_DASH;
export const REVIEW_BANNER = "FOUNDER REVIEW ONLY · NOT AUTHORIZED FOR SOCIAL POSTING";
export const FOOTER = Object.freeze({
  metric: "Yards and receptions: the official player board's median. Anytime TD: the chance to score at least one rushing or receiving touchdown if he plays.",
  missing: `${MISSING} means no official number for that player and statistic.`,
  noLines: "Model projections only: no sportsbook lines or prices are shown.",
  advice: "Not betting advice.",
  responsible: "21+ where required; the legal age varies by state. Gambling problem? Call 1-800-GAMBLER.",
});

/** Four numeric slots per row; Anytime TD always last. A null slot is not applicable to the group (blank, not "—"). */
export const SLOTS = Object.freeze({
  QB: Object.freeze(["passingYards", "rushingYards", null, "anytimeTd"]),
  RB: Object.freeze(["rushingYards", "receptions", "receivingYards", "anytimeTd"]),
  WRTE: Object.freeze([null, "receptions", "receivingYards", "anytimeTd"]),
});
for (const g of GROUPS) {
  if (JSON.stringify(SLOTS[g.key].filter(Boolean)) !== JSON.stringify(g.columns)) throw new Error(`nfl-game-cards: slots for ${g.key} differ from the export's columns`);
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let LOGO = null;
export function logoDataUri() {
  if (LOGO == null) LOGO = `data:image/png;base64,${fs.readFileSync(path.join(APP, "public", "brand", "gametime-picks-logo.png")).toString("base64")}`;
  return LOGO;
}

const rowById = (doc) => new Map(doc.rows.map((r) => [r.rowId, r]));

/** A row printed as a labelled estimate: OFFICIAL_ESTIMATE with its label and a value (never an unlabelled one). */
export const isLabelledEstimate = (r) => r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE && typeof r.model.label === "string" && r.model.label.length > 0 && r.model.display != null;
/** The exact text a cell prints: the export's display for an OFFICIAL or labelled-estimate row, else the missing mark. */
export const cellText = (r) => ((r.model.status === MODEL_STATUS.OFFICIAL || isLabelledEstimate(r)) && r.model.display != null ? r.model.display : MISSING);

/**
 * The estimate footnote for a set of rows: one sentence per distinct label, naming its statistics, with the marker.
 * The label text is the row's own model.label (the policy's estimateLabel), never retyped. "" when no estimate prints.
 */
function estimateGroups(rows) {
  const byLabel = new Map();
  for (const r of rows) if (r && isLabelledEstimate(r)) {
    const names = byLabel.get(r.model.label) ?? new Set();
    names.add(r.identity.marketLabel.toLowerCase());
    byLabel.set(r.model.label, names);
  }
  return [...byLabel].map(([label, names]) => {
    const list = [...names].sort();
    const said = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
    return { label, said: `${said.charAt(0).toUpperCase()}${said.slice(1)}`, shown: list.length === 1 ? "is shown as an estimate" : "are shown as estimates" };
  });
}
export function estimateFootnote(rows) {
  return estimateGroups(rows).map(({ label, said, shown }) => `${ESTIMATE_DISPLAY.marker} ${label}. ${said} ${shown}, never as a pick.`).join(" ");
}

/**
 * The gated sportsbook slot of one row: null unless NFL social display is authorized, the family is direction-qualified
 * for social, and the row carries a SHOWN line (contract @1 never does). Anytime TD (YES_NO) never has a direction.
 */
export function marketSlot(r, record = DISPLAY_AUTHORIZATION) {
  if (!displayAuthorization("nfl", "social", record).ok) return null;
  if (r.marketEligibility?.marketType !== "OVER_UNDER" || r.marketEligibility?.directionQualified !== true) return null;
  const dk = { player_receptions: "receptions", player_reception_yds: "reception_yds", player_pass_yds: "pass_yds", player_rush_yds: "rush_yds" }[r.identity.market];
  if (!dk || !directionAuthorization("nfl", dk, "social", record).ok) return null;
  const line = r.market?.line; const dir = r.market?.direction;
  if (line?.state !== "SHOWN" || dir?.state !== "SHOWN" || !SIDE_COLOR[dir.side]) return null;
  return { line: String(line.text), side: dir.side, color: SIDE_COLOR[dir.side] };
}

/** Exact markup of one value cell (the validator and the tests find it verbatim). */
export function cellMarkup(r, record = DISPLAY_AUTHORIZATION) {
  const text = cellText(r);
  const est = text !== MISSING && isLabelledEstimate(r);
  /* an estimate never takes the sportsbook slot (it is never direction-qualified); checked here as well */
  const m = est ? null : marketSlot(r, record);
  const cls = text === MISSING ? "v na" : est ? "v est" : "v";
  const style = m ? ` style="color:${m.color}"` : "";
  return `<div class="${cls}" data-row-id="${esc(r.rowId)}" data-status="${esc(r.model.status)}"${style}>${esc(text)}${est ? `<span class="em">${esc(ESTIMATE_DISPLAY.marker)}</span>` : ""}${m ? `<span class="mk">${esc(m.line)}</span>` : ""}</div>`;
}

/** Lead image slots per position group (QB starter, two backs, four receivers); leftover slots go to the next players. */
export const LEAD_SLOTS = Object.freeze({ QB: 1, RB: 2, WRTE: 4 });

/**
 * One team's players split into images, keeping the export's order (role, then the board's usage) inside every group.
 * Image 1 leads with LEAD_SLOTS per group, topped up in export order to ROWS_PER_TEAM_PAGE; later images carry the rest.
 */
export function teamPages(players, perTeam = ROWS_PER_TEAM_PAGE) {
  const lead = new Set();
  const taken = { QB: 0, RB: 0, WRTE: 0 };
  for (const p of players) if (lead.size < perTeam && taken[p.group] < LEAD_SLOTS[p.group]) { lead.add(p.playerId); taken[p.group] += 1; }
  for (const p of players) if (lead.size < perTeam) lead.add(p.playerId);
  const rest = players.filter((p) => !lead.has(p.playerId));
  const pages = [players.filter((p) => lead.has(p.playerId))];
  for (let i = 0; i < rest.length; i += perTeam) pages.push(rest.slice(i, i + perTeam));
  return pages;
}

/**
 * The images of one game (one when both teams fit). Every player of the export is on exactly one image.
 * @returns {Array<{ page: number, pages: number, teams: Array<{ team: string, homeAway: string, players: any[], total: number }> }>}
 */
export function paginate(doc, perTeam = ROWS_PER_TEAM_PAGE) {
  const split = doc.teams.map((t) => teamPages(t.players, perTeam));
  const pages = Math.max(1, ...split.map((x) => x.length));
  return Array.from({ length: pages }, (_, k) => ({
    page: k + 1, pages,
    teams: doc.teams.map((t, i) => ({ team: t.team, homeAway: t.homeAway, total: t.players.length, players: split[i][k] ?? [] })),
  }));
}

const GROUP_HDR = { QB: "QB", RB: "RB", WRTE: "WR / TE" };
function teamPanel(doc, t, byId, record, page) {
  const name = t.homeAway === "away" ? doc.game.awayName : doc.game.homeName;
  const head = `<div class="tbar"><span class="tabbr">${esc(t.team)}</span><span class="tname">${esc(name ?? "")}</span><span class="tside">${t.homeAway === "away" ? "Away" : "Home"}</span></div>`;
  if (!t.players.length) {
    const msg = t.total === 0 ? `No ${t.team} player has an official projection for this game.` : `All ${t.total} ${t.team} players are on the earlier image${page > 2 ? "s" : ""} of this game.`;
    return `<section class="team" data-team="${esc(t.team)}">${head}<div class="empty">${esc(msg)}</div></section>`;
  }
  const blocks = GROUPS.filter((g) => t.players.some((p) => p.group === g.key)).map((g) => {
    const hdr = `<div class="ghdr"><div>${GROUP_HDR[g.key]}</div>${SLOTS[g.key].map((fam) => `<div>${fam ? esc(FAMILY[fam].short) : ""}</div>`).join("")}</div>`;
    const rows = t.players.filter((p) => p.group === g.key).map((p) => {
      const cells = SLOTS[g.key].map((fam) => {
        if (!fam) return `<div class="v blank"></div>`;
        const r = byId.get(p.rowIds[g.columns.indexOf(fam)]);
        if (!r || r.identity.playerId !== p.playerId || r.identity.market !== MARKET_KEY[fam]) {
          throw new Error(`${p.playerId} ${fam}: export row missing or out of order`);
        }
        return cellMarkup(r, record);
      }).join("");
      const flag = p.availability ? `<span class="flag">${esc(p.availability)}</span>` : "";
      return `<div class="prow" data-player-id="${esc(p.playerId)}"><div class="pcell"><span class="pname">${esc(p.name)}</span><span class="ppos">${esc(p.position)}</span>${flag}</div>${cells}</div>`;
    }).join("\n");
    return `${hdr}\n${rows}`;
  }).join("\n");
  return `<section class="team" data-team="${esc(t.team)}">${head}\n${blocks}</section>`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SIZE.width}px;height:${SIZE.height}px;background:${PALETTE.bg};color:${PALETTE.text};font-family:"Geist","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden;background:radial-gradient(60% 50% at 50% 0%,rgba(52,211,153,0.14) 0%,transparent 70%),${PALETTE.bg};display:flex;flex-direction:column;padding:40px 44px 34px}
.review{position:absolute;top:0;left:0;right:0;height:34px;background:${PALETTE.gold};color:${PALETTE.bg};font:700 18px/34px "JetBrains Mono",Menlo,monospace;text-align:center;letter-spacing:2px;z-index:5}
.head{display:flex;align-items:center;gap:22px}
.card.rv .head{margin-top:22px}
.logo{width:112px;height:auto}
.htext{flex:1;min-width:0}
.eyebrow{font:700 17px/1.2 "JetBrains Mono",Menlo,monospace;letter-spacing:2.5px;color:${PALETTE.accent};text-transform:uppercase}
.title{font:800 58px/1.05 "Space Grotesk","Helvetica Neue",Arial,sans-serif;letter-spacing:-1px;margin-top:4px}
.sub{display:flex;justify-content:space-between;font:500 22px/1.3 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted};margin-top:4px}
.pg{font:600 18px/1.3 "JetBrains Mono",Menlo,monospace;color:${PALETTE.faint}}
.teams{margin-top:18px;flex:1;display:flex;flex-direction:column;gap:14px;min-height:0}
.team{background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:16px;padding:12px 20px 10px;flex:none}
.tbar{display:flex;align-items:baseline;gap:14px;padding-bottom:6px;border-bottom:1px solid ${PALETTE.border}}
.tabbr{font:800 30px/1 "Space Grotesk","Helvetica Neue",Arial,sans-serif}
.tname{font:600 20px/1 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted};flex:1}
.tside{font:700 14px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:2px;color:${PALETTE.faint};text-transform:uppercase}
.ghdr,.prow{display:grid;grid-template-columns:minmax(0,1fr) 112px 112px 112px 132px;align-items:center;column-gap:10px}
.ghdr{font:700 13px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:1.5px;color:${PALETTE.accent};text-transform:uppercase;padding:10px 0 4px}
.ghdr div:not(:first-child){text-align:right;color:${PALETTE.faint}}
.prow{height:41px;border-top:1px solid rgba(52,211,153,0.10)}
.pcell{display:flex;align-items:baseline;gap:10px;min-width:0}
.pname{font:700 22px/1.1 "Geist","Helvetica Neue",Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ppos{font:600 14px/1 "JetBrains Mono",Menlo,monospace;color:${PALETTE.faint};letter-spacing:1px}
.flag{font:700 12px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:1px;color:${PALETTE.gold};border:1px solid ${PALETTE.gold};border-radius:999px;padding:3px 7px;text-transform:uppercase;white-space:nowrap}
.v{font:700 25px/1 "JetBrains Mono",Menlo,monospace;text-align:right;font-variant-numeric:tabular-nums;color:${PALETTE.text}}
.v.na{color:${PALETTE.faint};font-weight:500}
.v.est{color:${PALETTE.muted}}
.v .em{display:block;font:600 12px/1 "JetBrains Mono",Menlo,monospace;color:${PALETTE.gold};letter-spacing:1px;margin-top:3px}
.v .mk{display:block;font:600 13px/1 "JetBrains Mono",Menlo,monospace;color:${PALETTE.muted};margin-top:3px}
.empty{font:500 20px/1.4 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.faint};padding:18px 0}
.foot{margin-top:14px;border-top:1px solid ${PALETTE.border};padding-top:10px;display:flex;flex-direction:column;gap:4px}
.foot p{font:500 15.5px/1.35 "Geist","Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.foot .q{color:${PALETTE.text};font-weight:600}
`;

const boardAsOfEt = (iso) => {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(d)}, ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
};

/**
 * One image of one game.
 * @param {{ doc: any, page: ReturnType<typeof paginate>[number], record?: object }} o
 */
export function renderGameCardHtml({ doc, page, record = DISPLAY_AUTHORIZATION }) {
  const byId = rowById(doc);
  const review = doc.purpose === PURPOSE.FOUNDER_REVIEW;
  const asOfText = boardAsOfEt(doc.rows[0]?.snapshot?.boardGeneratedAt);
  const pageRows = page.teams.flatMap((t) => t.players.flatMap((p) => p.rowIds.map((id) => byId.get(id))));
  const anyMissing = pageRows.some((r) => cellText(r) === MISSING);
  const estNote = estimateFootnote(pageRows);
  const body = `<header class="head"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div class="htext">
<div class="eyebrow">NFL · Week ${esc(doc.edition.week)} · Official player projections${page.page > 1 ? " · more players" : ""}</div>
<div class="title">${esc(doc.game.matchup)}</div>
<div class="sub"><span>Kickoff ${esc(tipEt(doc.game.kickoffUtc))}</span><span class="pg">${page.pages > 1 ? `${page.page} of ${page.pages}` : ""}</span></div>
</div></header>
<div class="teams">
${page.teams.map((t) => teamPanel(doc, t, byId, record, page.page)).join("\n")}
</div>
<footer class="foot">
<p class="q">${esc(FOOTER.metric)}</p>
${estNote ? `<p class="est">${esc(estNote)}</p>` : ""}
${anyMissing ? `<p class="miss">${esc(FOOTER.missing)}</p>` : ""}
<p>${asOfText ? `Official player board as of ${esc(asOfText)}. ` : ""}${esc(FOOTER.noLines)} ${esc(FOOTER.advice)} ${esc(FOOTER.responsible)}</p>
</footer>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>NFL ${esc(doc.game.matchup)} player projections ${page.page} of ${page.pages}</title><style>${CSS}</style></head>
<body><main class="card${review ? " rv" : ""}" data-purpose="${esc(doc.purpose)}" data-event-id="${esc(doc.game.eventId)}" data-page="${page.page}">
${review ? `<div class="review">${esc(REVIEW_BANNER)}</div>` : ""}
${body}
</main></body></html>
`;
}

const bannedIn = (text) => BANNED_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(text));

/**
 * The card HTML says exactly what the export says: the page's rows and no others, each cell verbatim, no market slot
 * unless authorized + qualified, no ruled-out player, the footer, the banner in review mode. [] when it holds.
 */
export function verifyCardHtml(html, doc, page, record = DISPLAY_AUTHORIZATION) {
  const v = [];
  const byId = rowById(doc);
  const want = page.teams.flatMap((t) => t.players.flatMap((p) => p.rowIds));
  const got = [...html.matchAll(/data-row-id="([^"]+)"/g)].map((m) => m[1]);
  if (JSON.stringify(got) !== JSON.stringify(want.map(esc))) v.push(`cells on the card ${got.length} ≠ export cells ${want.length} (or out of order)`);
  for (const id of want) {
    const r = byId.get(id);
    if (!r) { v.push(`${id}: not in the export`); continue; }
    if (!html.includes(cellMarkup(r, record))) v.push(`${id}: card is missing ${cellMarkup(r, record)}`);
    if (r.model.status !== MODEL_STATUS.OFFICIAL && !isLabelledEstimate(r) && cellText(r) !== MISSING) v.push(`${id}: a ${r.model.status} cell prints a number`);
    if ((r.model.status === MODEL_STATUS.OFFICIAL || isLabelledEstimate(r)) && r.model.display !== formatValue(r.model.kind, r.model.value)) v.push(`${id}: display is not formatValue of the value`);
    if (isLabelledEstimate(r) && !html.includes(`>${esc(r.model.display)}<span class="em">${esc(ESTIMATE_DISPLAY.marker)}</span>`)) v.push(`${id}: an estimate prints without its marker`);
  }
  if (!marketSlotsOpen(doc, record) && /class="mk"|style="color:/.test(html.replace(/<style>[\s\S]*?<\/style>/, ""))) v.push("a sportsbook slot or colour is on the card while not authorized");
  const text = visibleText(html);
  for (const s of [FOOTER.metric, FOOTER.noLines, FOOTER.advice, FOOTER.responsible]) if (!text.includes(s)) v.push(`footer missing: ${s}`);
  if (got.some((id) => cellText(byId.get(id) ?? { model: {} }) === MISSING) && !text.includes(FOOTER.missing)) v.push("missing-number footnote absent");
  const estRows = want.map((id) => byId.get(id)).filter((r) => r && isLabelledEstimate(r));
  if (estRows.length) {
    const note = estimateFootnote(estRows);
    if (!text.includes(note)) v.push("estimate footnote absent");
    for (const label of new Set(estRows.map((r) => r.model.label))) if (!text.includes(label)) v.push(`estimate label absent: ${label}`);
  } else if (html.includes(`<p class="est">`)) v.push("estimate footnote on a card with no estimate");
  if ((doc.purpose === PURPOSE.FOUNDER_REVIEW) !== html.includes(`<div class="review">${esc(REVIEW_BANNER)}</div>`)) v.push("review banner state");
  const outIds = new Set(doc.excluded.filter((x) => x.reason.startsWith("AVAILABILITY_")).map((x) => x.playerId));
  for (const m of html.matchAll(/data-player-id="([^"]+)"/g)) if (outIds.has(m[1])) v.push(`${m[1]}: ruled-out player on the card`);
  // The only em dashes on a card: the missing-number cells and the footnote that explains them.
  const rest = visibleText(html.replace(/<div class="v na"[^>]*>—<\/div>/g, "").replace(/<p class="miss">[\s\S]*?<\/p>/, ""));
  if (rest.includes(EM_DASH)) v.push("em dash outside a missing-number cell");
  const b = bannedIn(text);
  if (b.length) v.push(`banned words on the card: ${b.join(", ")}`);
  return v;
}
const marketSlotsOpen = (doc, record) => doc.rows.some((r) => marketSlot(r, record) != null);

/* ─────────────────────────────── hard validation against the sources ─────────────────────────────── */

/**
 * Before any PNG: every OFFICIAL cell equals the official snapshot's stored number (median for yards and receptions,
 * probability for anytime TD; read here from the snapshot itself, not through the view) and the raw player board; every
 * non-OFFICIAL cell is one the snapshot does not publish for that player; nothing is from a started game or a ruled-out
 * player; the contract validator is clean. [] when it holds.
 * @param {{ doc: any, snapshot: any, board: any }} o
 */
export function verifyAgainstSources({ doc, snapshot, board }) {
  const v = [...graphicsExportViolations(doc)];
  if (!snapshot) return [...v, "no official snapshot"];
  if (snapshot.snapshotId !== doc.publication.snapshotId) v.push(`snapshot ${snapshot.snapshotId} ≠ export ${doc.publication.snapshotId}`);
  const asOf = Date.parse(doc.asOf);
  if (!(instantMs(doc.game.kickoffUtc) > asOf)) v.push("game started");
  const sp = new Map((snapshot.players ?? []).map((p) => [p.playerId, p]));
  const bp = new Map((board?.players ?? []).map((p) => [p.playerId, p]));
  for (const r of doc.rows) {
    const id = r.rowId; const mk = r.identity.market;
    if (r.snapshot.id !== snapshot.snapshotId) v.push(`${id}: snapshot id`);
    const o = sp.get(r.identity.playerId)?.families?.[mk] ?? null;
    const atd = mk === "anytime_td";
    const headline = o ? (atd || BOARD_METRIC[mk] !== "median" ? o.expected : o.median) : null;
    const official = o && o.state === "PUBLISHED" && board?.families?.[mk]?.state === "PUBLISHED" ? headline : null;
    /* a labelled estimate: ESTIMATE in the snapshot AND on the board (the game page's own rule), never anytime TD */
    const estimate = !atd && o && o.state === "ESTIMATE" && board?.families?.[mk]?.state === "ESTIMATE" ? headline : null;
    const kind = atd ? "probability" : mk === "player_receptions" ? "count" : "yards";
    if (r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE) {
      if (!isLabelledEstimate(r)) v.push(`${id}: an estimate cell without its label or value`);
      if (estimate == null || estimate !== r.model.value) v.push(`${id}: snapshot estimate ${estimate} ≠ export ${r.model.value}`);
      if (formatValue(kind, estimate) !== r.model.display) v.push(`${id}: snapshot display ${formatValue(kind, estimate)} ≠ export ${r.model.display}`);
      const raw = bp.get(r.identity.playerId)?.markets?.[mk]?.median;
      if (raw !== r.model.value) v.push(`${id}: player board ${raw} ≠ export ${r.model.value}`);
      const label = estimateLabel(board?.families?.[mk]?.reason);
      if (r.model.label !== label) v.push(`${id}: label ${JSON.stringify(r.model.label)} ≠ policy label ${JSON.stringify(label)}`);
      if (r.marketEligibility?.directionQualified !== false) v.push(`${id}: an estimate is direction-qualified`);
    } else if (r.model.status === MODEL_STATUS.OFFICIAL) {
      if (official !== r.model.value) v.push(`${id}: snapshot ${official} ≠ export ${r.model.value}`);
      if (formatValue(kind, official) !== r.model.display) v.push(`${id}: snapshot display ${formatValue(kind, official)} ≠ export ${r.model.display}`);
      const raw = atd ? bp.get(r.identity.playerId)?.markets?.anytime_td?.probability : bp.get(r.identity.playerId)?.markets?.[mk]?.median;
      if (raw !== r.model.value) v.push(`${id}: player board ${raw} ≠ export ${r.model.value}`);
    } else {
      if (official != null && Number.isFinite(official)) v.push(`${id}: the snapshot publishes ${official} but the card withholds it`);
      if (estimate != null && Number.isFinite(estimate)) v.push(`${id}: the snapshot carries the labelled estimate ${estimate} but the card withholds it`);
      if (r.model.value != null || r.model.display != null) v.push(`${id}: a ${r.model.status} cell carries a number`);
    }
    const part = bp.get(r.identity.playerId)?.participation;
    if (EXCLUDED_AVAILABILITY.includes(part)) v.push(`${id}: ruled-out player (${part})`);
  }
  return v;
}

/* ─────────────────────────────────────────── captions ─────────────────────────────────────────── */

const say = (r) => {
  const d = r.model.display;
  if (r.identity.market === "anytime_td") return `${d} anytime TD chance`;
  if (r.identity.market === "player_receptions") return `${d} receptions`;
  return `${d} ${r.identity.marketLabel.toLowerCase()}`;
};

/** One caption per game (every image of it), from the export's own rows: strings copied, no promises, no dashes. */
export function gameCaption(doc, { featuredPerTeam = 2 } = {}) {
  const byId = rowById(doc);
  const when = tipEt(doc.game.kickoffUtc).replace(" · ", ", ");
  const featured = doc.teams.map((t) => {
    const ps = t.players.map((p) => ({ p, rs: p.rowIds.map((id) => byId.get(id)).filter((r) => r.model.status === MODEL_STATUS.OFFICIAL) })).filter((x) => x.rs.length >= 2).slice(0, featuredPerTeam);
    return ps.map(({ p, rs }) => `${p.name} (${t.team}) ${rs.map(say).join(", ")}`).join("; ");
  }).filter(Boolean);
  /* estimates never feature as a player's numbers in the caption; the caption says once that they are estimates */
  const estNote = estimateGroups(doc.rows).map(({ label, said, shown }) => `${said} ${shown} (${label}), never as a pick.`).join(" ");
  return [
    `${doc.game.awayName ?? doc.game.away} at ${doc.game.homeName ?? doc.game.home}, ${when}.`,
    `GameTime Picks official player projections for ${doc.teams.map((t) => `${t.players.length} ${t.team}`).join(" and ")} players.`,
    featured.length ? `${featured.join(". ")}.` : "",
    "Yards and receptions are medians; the anytime TD figure is the chance to score if he plays.",
    estNote,
    `${FOOTER.advice} ${FOOTER.responsible}`,
  ].filter(Boolean).join(" ");
}

/** [] when a caption is clean: no em or en dash, no banned or promissory words, the advice and helpline present. */
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
