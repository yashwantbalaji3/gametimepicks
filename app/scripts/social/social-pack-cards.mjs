/**
 * SOCIAL PACK CARDS: 1080 × 1350 HTML for the winner roundups, Top 5 boards and results recaps. Script-only. A card is
 * built from a `cells` map (key → exact text) and every printed number sits in a data-cell element, so verifyPackCard can
 * prove the HTML prints exactly those strings and nothing was rounded on the way. Fonts are the bundled Barlow files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BANNED_WORDS, EM_DASH, EN_DASH, REVIEW_BANNER, logoDataUri, visibleText } from "./nba-line-cards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SIZE = Object.freeze({ key: "1080x1350", width: 1080, height: 1350 });
export const ROWS_PER_CARD = 12;
export const FOOT = Object.freeze({
  advice: "Not betting advice.",
  responsible: "21+ where required; the legal age varies by state. Gambling problem? Call 1-800-GAMBLER.",
  projections: "Model projections, not picks.",
  noLines: "No sportsbook lines or prices are shown.",
});
/** The founder titles and the Elo label carry a word the banned list otherwise refuses; only these exact phrases pass. */
export const APPROVED_PHRASES = Object.freeze(["WINNER PREDICTIONS", "WINNER PREDICTION", "game-winner estimate"]);

/** A proportional meter: widths are the exact probabilities; the remainder (NFL tie share) stays grey. */
export const meterHtml = (id, away, home) => `<div class="meter" data-meter="${esc(id)}" data-away="${away}" data-home="${home}"><i style="width:${(away * 100).toFixed(2)}%"></i><u style="width:${(home * 100).toFixed(2)}%"></u></div>`;
export function meterProblems(html) {
  const e = [];
  for (const m of html.matchAll(/data-meter="([^"]+)" data-away="([^"]+)" data-home="([^"]+)"><i style="width:([\d.]+)%"><\/i><u style="width:([\d.]+)%"/g)) {
    if ((Number(m[2]) * 100).toFixed(2) !== m[4] || (Number(m[3]) * 100).toFixed(2) !== m[5]) e.push(`meter ${m[1]} is not proportional`);
    if (Number(m[4]) + Number(m[5]) > 100.02) e.push(`meter ${m[1]} exceeds 100%`);
  }
  return e;
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const cell = (cells, key, text, cls = "") => { cells[key] = String(text); return `<span class="${cls}" data-cell="${esc(key)}">${esc(text)}</span>`; };

const FACES = [["GTP Condensed", "BarlowCondensed-Bold.ttf", 700], ["GTP Condensed", "BarlowCondensed-ExtraBold.ttf", 800], ["GTP Condensed", "BarlowCondensed-Black.ttf", 900], ["GTP Body", "Barlow-SemiBold.ttf", 600], ["GTP Body", "Barlow-Bold.ttf", 700]];
let FONT_CSS = null;
const fontFaces = () => (FONT_CSS ??= FACES.map(([f, file, w]) => `@font-face{font-family:"${f}";font-weight:${w};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(HERE, "fonts", file)).toString("base64")}) format("truetype");}`).join("\n"));

const CSS = () => `${fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;background:#07110C}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;display:flex;flex-direction:column;color:#F4F7F2;font-family:"GTP Body",sans-serif;font-weight:600;background:radial-gradient(1100px 620px at 50% -8%,#123A28 0%,#0A1B13 58%,#07110C 100%)}
.review{background:#F2C14E;color:#1B1405;text-align:center;font:800 28px "GTP Condensed";letter-spacing:.06em;padding:9px 0}
.head{display:flex;align-items:center;gap:26px;padding:26px 48px 18px}
.logo{width:112px;height:112px;object-fit:contain}
.brand{font:800 30px "GTP Condensed";letter-spacing:.12em;color:#4ADE80}
.title{font:900 60px/1.02 "GTP Condensed";letter-spacing:.01em}
.sub{font:700 32px "GTP Condensed";color:#B9C7BE;letter-spacing:.04em}
.rows{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:0 48px}
.row{flex:1;min-height:0;max-height:var(--max);display:grid;align-items:center;gap:14px;padding:0 20px;background:rgba(255,255,255,.055);border-radius:12px;border-left:6px solid #4ADE80}
.row.miss{border-left-color:#F87171}.row.void{border-left-color:#8E9A92}
.g{font:800 38px "GTP Condensed";white-space:nowrap}
.m{font:700 26px "GTP Body";color:#C9D5CD;white-space:nowrap}
.w{font:900 40px "GTP Condensed";color:#4ADE80;white-space:nowrap;text-align:right}
.r{font:800 30px "GTP Condensed";white-space:nowrap;text-align:right}
.n{font:900 64px "GTP Condensed";color:#4ADE80;text-align:center}
.big{font:900 150px/1 "GTP Condensed";color:#4ADE80;text-align:center}
.feat{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;align-items:center;padding:0 60px;text-align:center}
.feat .g{font-size:96px}.feat .m{font-size:36px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 48px 12px}
.st{background:rgba(255,255,255,.07);border-radius:12px;padding:8px 0;text-align:center}
.st b{display:block;font:900 58px/1.05 "GTP Condensed"}.st i{font:700 24px "GTP Condensed";font-style:normal;color:#B9C7BE;letter-spacing:.06em}
.meter{display:flex;justify-content:space-between;height:16px;border-radius:8px;background:#3A4640;overflow:hidden;margin-top:6px}
.meter i{display:block;background:#4ADE80}.meter u{display:block;background:#60A5FA}
.feat .meter{width:100%;height:36px;border-radius:18px}
.lnw{text-align:right}.ln{display:block;font:800 25px "GTP Condensed";white-space:nowrap}.ln.over,.w.over{color:#4ADE80}.ln.under,.w.under{color:#F87171}.ln.neutral,.w.neutral{color:#8E9A92}
.foot{padding:12px 48px 22px;font:600 21px/1.28 "GTP Body";color:#AEBBB2}
.foot .est{color:#F2C14E;font-weight:700}`;

/**
 * @param {{ review?: boolean, title: string, sub: string, body: string, foot: string[], est?: string|null, stats?: string, htmlTitle: string, maxRow?: number }} o
 */
export function pageHtml({ review = true, brand = "GAME TIME PICKS", title, sub, body, foot, est = null, stats = "", htmlTitle, maxRow = 150 }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(htmlTitle)}</title><style>${CSS()}</style></head><body>
<main class="card" style="--max:${maxRow}px">${review ? `<div class="review">${esc(REVIEW_BANNER)}</div>` : ""}
<header class="head"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div><div class="brand">${esc(brand)}</div><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div></header>
${stats}${body}
<footer class="foot">${est ? `<p class="est">${esc(est)}</p>` : ""}${foot.map((f) => `<p>${esc(f)}</p>`).join("")}</footer>
</main></body></html>`;
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'), m[2].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")]));
const bannedIn = (text) => { let t = text; for (const p of APPROVED_PHRASES) t = t.split(p).join(" "); return BANNED_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(t)); };

/** [] when the card prints exactly `cells`, carries the banner, and its words are clean. */
export function verifyPackCard(html, cells) {
  const e = [];
  const got = cellsIn(html);
  for (const [k, v] of Object.entries(cells)) if (got[k] !== v) e.push(`${k}: card prints ${got[k]}, expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in cells)) e.push(`${k}: on the card but not validated`);
  e.push(...meterProblems(html));
  if (/moneyline/i.test(html)) e.push("moneyline wording");
  if (!html.includes(REVIEW_BANNER)) e.push("review banner missing");
  const text = visibleText(html);
  const b = bannedIn(text);
  if (b.length) e.push(`banned words: ${b.join(", ")}`);
  if (/[—–]/.test(text)) e.push(`dash on card (${EM_DASH}${EN_DASH})`);
  if (!text.includes("1-800-GAMBLER")) e.push("responsible-gambling line missing");
  return e;
}

/** [] when a caption is clean. */
export function packCaptionViolations(text) {
  const v = [];
  if (text.includes(EM_DASH) || text.includes(EN_DASH)) v.push("caption contains an em or en dash");
  const b = bannedIn(text);
  if (b.length) v.push(`caption contains banned words: ${b.join(", ")}`);
  if (!text.includes(FOOT.advice)) v.push("caption lacks Not betting advice");
  if (!text.includes("1-800-GAMBLER")) v.push("caption lacks the responsible-gambling line");
  return v;
}
export const legalLine = `${FOOT.advice} ${FOOT.responsible}`;
