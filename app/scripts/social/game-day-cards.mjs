/**
 * NBA GAME-DAY CARDS on the established social design: stage, shell, CSS and fit pass copied unchanged from gtp-social@2.3.3
 * (command-center/render, templates/social-v2 here). Bodies follow its nba-pregame / nba-players / top5 formats. Team marks
 * are monograms in team colours. Script-only. Every number sits in a data-cell element, proven by verifyGameDayCard.
 * No Elo text, hash or code reaches an image. The word "estimate" stays; nothing calls the number a validated probability.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrastRatio, nflTeamColor, relLuminance } from "../../src/lib/simulation-theater/nfl-team-colors.mjs";
import { clashes } from "../../src/lib/simulation-theater/nba/nba-team-colors.mjs";
import { nbaTeamColor } from "../../src/lib/simulation-theater/nba/nba-team-colors.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../src/lib/sports/nba/prop-line-adapter.mjs";
import { REFERENCE_BOOK_ORDER } from "../../src/lib/sports/nba/line-comparison.mjs";
import { logoDataUri, REVIEW_BANNER, BANNED_WORDS, visibleText } from "./nba-line-cards.mjs";
import { esc, cell } from "./social-pack-cards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const T = path.join(HERE, "templates", "social-v2");
export const DESIGN_VERSION = "2";
export const SOCIAL_HANDLE = "@GameTimePicksHQ";
export const GAME_POST_DESIGN_VERSION = "3";
export const NFL_GAME_POST_DESIGN_VERSION = "4";
/** Every card's footer: the handle line, then `lines` in order. Restoring a line is one more string here. */
export const CARD_FOOTER = Object.freeze({ handle: SOCIAL_HANDLE, lines: Object.freeze([process.env.GTP_NBA_UNIFIED_ROSTER ? "Model projections" : "Model projections · Not betting advice"]) });
export const DISCLOSURE = CARD_FOOTER.lines[0];
export const NFL_DISCLOSURE = DISCLOSURE;
export const PER_TEAM = 6;
const X = `<svg class="xmark" viewBox="0 0 1200 1227" aria-hidden="true"><path fill="currentColor" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.79 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>`;
const FACES = [["GTP Condensed", "BarlowCondensed-SemiBold.ttf", 600], ["GTP Condensed", "BarlowCondensed-Bold.ttf", 700], ["GTP Condensed", "BarlowCondensed-ExtraBold.ttf", 800], ["GTP Condensed", "BarlowCondensed-Black.ttf", 900], ["GTP Body", "Barlow-Medium.ttf", 500], ["GTP Body", "Barlow-SemiBold.ttf", 600], ["GTP Body", "Barlow-Bold.ttf", 700]];
let CSS = null;
const css = () => (CSS ??= `${FACES.map(([f, file, w]) => `@font-face{font-family:"${f}";font-weight:${w};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(HERE, "fonts", file)).toString("base64")}) format("truetype");}`).join("\n")}\n${fs.readFileSync(path.join(T, "social-v2.css"), "utf8")}${EXTRA}`);
const EXTRA = `
.draft{position:absolute;top:0;left:0;right:0;z-index:9;background:#F2C14E;color:#1B1405;text-align:center;font:800 24px/34px "GTP Condensed";letter-spacing:.06em}
.rg{margin-top:4px;text-align:center;font:600 17px/1.2 "GTP Body";color:rgba(247,247,242,.72)}
.tn{margin-top:14px;flex:1;display:flex;flex-direction:column;gap:7px;min-height:0}
.tnr{flex:1;min-height:0;display:grid;grid-template-columns:118px 74px 56px 1fr 56px 74px 96px;align-items:center;gap:8px;padding:0 14px;border-radius:14px;background:rgba(5,8,6,.74);border:1px solid rgba(255,255,255,.16)}
.tnh{flex:none;display:grid;grid-template-columns:118px 74px 56px 1fr 56px 74px 96px;gap:8px;padding:0 14px;font:700 19px/1 var(--display);letter-spacing:3px;color:rgba(247,247,242,.75)}
.tnr .t{font:700 25px/1 var(--display);white-space:nowrap}.tnr .tm{font:900 32px/1 var(--headline);text-align:center;white-space:nowrap}.tnr .p{font:800 27px/1 var(--display);text-align:center}
.tnr .bar{display:flex;height:24px;border-radius:12px;overflow:hidden;gap:3px;background:#050706}.tnr .bar i{display:block;height:100%}
.tnr .wn{font:900 28px/1 var(--headline);text-align:center;color:#050706;background:#39FF88;border-radius:8px;padding:7px 2px 5px}
.pl{padding:7px 4px 6px;border-top:1px solid rgba(255,255,255,.12)}.pl .pn2{display:block;font:800 29px/1.05 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;min-width:0}
.pl .ns{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;margin-top:3px}.pl .ns b{display:block;font:900 33px/1 var(--display);white-space:nowrap}.pl .ns em{display:block;font:700 18px/1.2 var(--display);font-style:normal;white-space:nowrap;letter-spacing:.3px}
.st-hd{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;font:700 19px/1 var(--display);letter-spacing:3px;color:rgba(247,247,242,.72);padding:0 4px 6px}
.pl{padding:13px 4px 12px}.pl .pn2{font-size:32px}.pl .ns{margin-top:6px}.pl .ns b{font-size:37px}.lines.sl.real .pl{padding:6px 4px 5px}.lines.sl.real .pl .pn2{font-size:27px}.lines.sl.real .pl .ns{margin-top:2px}.lines.sl.real .pl .ns b{font-size:29px}
.lines.sl{margin-top:12px;align-content:start}.lines.sl .lcol{padding:14px 12px 8px}.lines.sl .lhead h3{font-size:42px;margin-bottom:0}
.over{color:#4ADE80}.under{color:#F87171}.none{color:#AEB8B1}
.lgd{display:flex;justify-content:center;gap:22px;margin-top:8px;font:700 19px/1 var(--display);letter-spacing:1px}
.t5row .v b.over{color:#4ADE80;text-shadow:none}.t5row .v b.under{color:#F87171;text-shadow:none}.t5row .v b.none{color:#AEB8B1;text-shadow:none}
.t5 .ln{display:block;font:700 26px/1.2 var(--display);letter-spacing:.5px;white-space:nowrap;margin-top:4px}
.t5row .v .ln.over{color:#4ADE80}.t5row .v .ln.under{color:#F87171}.t5row .v .ln.none{color:#AEB8B1}
.rc{margin-top:22px;flex:1;display:flex;flex-direction:column;gap:14px;justify-content:center}
.rcs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.rcs div{background:rgba(5,8,6,.74);border-radius:14px;padding:14px 0 10px;text-align:center}.rcs b{display:block;font:900 66px/1 var(--display)}.rcs i{font:700 21px/1 var(--display);font-style:normal;letter-spacing:3px;color:rgba(247,247,242,.72)}
.rcr{display:grid;grid-template-columns:1fr 200px 140px;align-items:center;gap:12px;padding:46px 20px;border-radius:14px;background:rgba(5,8,6,.74);border-left:7px solid #4ADE80}.rcr.miss{border-left-color:#F87171}
.rxh{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:16px}.rxh>div{text-align:center}.rxh b{display:block;white-space:nowrap}.rxh .rec{font:900 250px/.86 var(--display);color:#39FF88;text-shadow:0 0 34px rgba(57,255,136,.5)}.rxh .acc{font:900 142px/.9 var(--display);color:#F7F7F2}.rxh i{display:block;margin-top:8px;font:700 28px/1 var(--display);font-style:normal;letter-spacing:4px;color:rgba(247,247,242,.78)}
.rc.rx{margin-top:18px;gap:12px;justify-content:stretch}.rxr{flex:1;min-height:0;display:grid;grid-template-columns:112px 1fr 214px;align-items:center;gap:16px;padding:0 20px 0 14px;border-radius:14px;border:2px solid var(--o);border-left-width:14px;background:linear-gradient(90deg,var(--ot),rgba(5,8,6,.82) 62%)}.rxr.hit{--o:#39FF88;--ot:rgba(57,255,136,.24)}.rxr.miss{--o:#FF4D4D;--ot:rgba(255,77,77,.3)}.rxr.void{--o:#AEB8B1;--ot:rgba(174,184,177,.16)}
.rxr .ic{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--o)}.rxr .ic svg{width:88px;height:88px}.rxr .ic span{font:800 21px/1 var(--display);letter-spacing:1px;text-transform:uppercase}.rxr .s{font:900 66px/1 var(--headline);white-space:nowrap;min-width:0}.rxr .pd{text-align:right}.rxr .pd i{display:block;font:700 22px/1 var(--display);font-style:normal;letter-spacing:2px;color:rgba(247,247,242,.76)}.rxr .pd span{display:block;margin-top:6px;font:900 58px/1 var(--headline);white-space:nowrap}
.rxh.d{margin-top:6px}.rxh.d .rec{font-size:128px}.rxh.d .acc{font-size:100px}.rxh.d i{margin-top:4px;font-size:21px}
.rc.rx.d{margin-top:10px;gap:6px}.rc.rx.d .rxr{grid-template-columns:186px 1fr 170px;gap:10px;padding:0 16px 0 10px;border-left-width:10px}.rc.rx.d .ic{flex-direction:row;gap:8px;justify-content:flex-start}.rc.rx.d .ic svg{width:34px;height:34px}.rc.rx.d .ic span{font-size:25px}.rc.rx.d .s{font-size:43px}.rc.rx.d .pd{display:flex;align-items:baseline;justify-content:flex-end;gap:8px}.rc.rx.d .pd i{font-size:16px;letter-spacing:1px}.rc.rx.d .pd span{margin-top:0;font-size:38px}
.gph{flex:1;min-height:0;display:flex;flex-direction:column}.gph .winner2{margin:6px 0 0;flex:none}.gph .winner2 .k{font-size:26px}.gph .winner2 .slab{margin-top:8px;padding:8px 44px 6px}.gph .winner2 .slab .nick{font-size:80px}.gph .meter{margin-top:10px;padding:12px 22px 14px}.gph .meter-k{font-size:22px}.gph .meter-labels{margin-top:6px}.gph .ml b{font-size:66px}.gph .ml span{font-size:23px}.gph .meter-bar{margin-top:8px;height:26px}.gph .strip{flex:none;margin-top:10px}.gph .strip div{padding:11px 8px 8px}.gph .strip b{font-size:32px}.gph .strip .pv{color:#F2C14E}
.tdb{flex:1;min-height:0;margin-top:10px;display:flex;flex-direction:column;gap:6px}.tdh{flex:none;text-align:center;font:800 27px/1 var(--display);letter-spacing:3px;color:#39FF88}.tdr{flex:1;min-height:0;max-height:132px;display:grid;grid-template-columns:44px 1fr 92px 120px;align-items:center;gap:10px;padding:0 18px;border-radius:12px;background:rgba(5,8,6,.78);border:1px solid rgba(255,255,255,.16);border-left:8px solid var(--c)}.tdr .n{font:900 32px/1 var(--headline);color:rgba(247,247,242,.72)}.tdr .pn2{display:block;font:800 36px/1.05 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;min-width:0}.tdr .tag{position:static;align-self:center;justify-self:center;margin:0;font:900 26px/1 var(--headline);padding:6px 8px 4px;border-radius:7px;background:var(--c);color:var(--cink)}.tdr .pc{font:900 46px/1 var(--headline);text-align:right;color:#39FF88}
.gph.solo{justify-content:center;gap:34px}.gph.solo .winner2 .slab .nick{font-size:104px}.gph.solo .meter{margin-top:0}
.tdb.solo{margin-top:34px;gap:20px;justify-content:center}.tdb.solo .tdh{margin-bottom:8px}.tdb.solo .tdr{flex:none;height:190px;max-height:none;grid-template-columns:56px 1fr 112px 170px;gap:14px;padding:0 24px}.tdb.solo .tdr .n{font-size:50px}.tdb.solo .tdr .pn2{font-size:50px}.tdb.solo .tdr .tag{font-size:34px}.tdb.solo .tdr .pc{font-size:66px}
.secl{margin-top:8px;text-align:center;font:800 28px/1.1 var(--display);letter-spacing:3px;color:#39FF88}
.tdv{text-align:right}.tdv .pc{display:block;color:#F5F7F6}.tdv .yes{display:block;margin-top:4px;font:700 28px/1.1 var(--display);white-space:nowrap;color:#AEB8B1}
.estl{margin-top:8px;text-align:center;font:800 24px/1.1 var(--display);letter-spacing:1px;color:#F2C14E}
.tn.dense{gap:4px;margin-top:8px}.tn.dense .tnr .tm{font-size:28px}.tn.dense .tnr .p{font-size:24px}.tn.dense .tnr .wn{font-size:24px;padding:4px 2px 2px}.tn.dense .tnr .bar{height:18px}
.tn.dense .tnr,.tn.dense .tnh{grid-template-columns:128px 66px 76px 1fr 76px 66px 88px}
.rc.dense{margin-top:12px;gap:4px;justify-content:flex-start}.rc.dense .rcr{padding:0 16px;flex:1;min-height:0}.rc.dense .rcr .s{font-size:30px}.rc.dense .rcr .w{font-size:21px}.rc.dense .rcr .o{font-size:24px}
.rc.dense + *{margin-top:0}.pl.nfl .ns b{font-size:32px}.pl.nfl .ns em{font-size:17px;color:rgba(247,247,242,.72)}
.mkp + .strip{flex:none;margin-top:10px}.winner2.mkw{flex:none;margin-top:6px}.winner2.mkw .k{font-size:26px}.winner2.mkw .slab{margin-top:8px;padding:8px 44px 6px}.winner2.mkw .slab .nick{font-size:84px}
.mkp{flex:none;margin:10px auto 0;width:100%;padding:12px 18px 10px;border-radius:14px;background:rgba(5,8,6,.74);border:1px solid rgba(242,193,78,.55);text-align:center}.mkp .mk{font:700 20px/1 var(--display);letter-spacing:2px;color:#F2C14E;text-transform:uppercase}.mkp .mv{display:block;margin-top:6px;font:900 46px/1 var(--headline);white-space:nowrap}.mkp .mq{display:block;margin-top:5px;font:700 21px/1 var(--display);color:rgba(247,247,242,.75);white-space:nowrap}
.tn.ml .tnr,.tn.ml .tnh{grid-template-columns:104px 88px 54px 1fr 54px 88px 96px 132px;gap:7px}.tn.ml .tnr{padding:0 8px 0 12px}.tn.ml .tnh{padding:0 8px 0 12px;align-items:center;letter-spacing:0;font-size:20px;white-space:nowrap}.tn.ml .tnh>span:nth-child(7){text-align:center}.tn.ml .tnh .wh{text-align:center;color:#F7F7F2}.tn.ml .tnh .ph{text-align:center;color:#F2C14E;font-size:22px}.tn.ml .tnr .t{font-size:22px;letter-spacing:0}.tn.ml .tnr .p{font-size:24px}
.tn.ml .tnr .pr{font:900 42px/1 var(--headline);font-variant-numeric:tabular-nums;text-align:right;color:#F2C14E;white-space:nowrap;background:rgba(242,193,78,.13);border:1px solid rgba(242,193,78,.55);border-radius:8px;padding:9px 12px 6px}
.mkn{margin-top:8px;text-align:center;font:700 21px/1.15 var(--display);color:#F2C14E}
.tn.ml.dec .tnr,.tn.ml.dec .tnh{grid-template-columns:104px 88px 76px 1fr 76px 88px 96px 132px}
.tn.pp{margin-top:8px;gap:6px}.tn.pp .tnr,.tn.pp .tnh{grid-template-columns:1fr 128px 104px 250px;gap:8px}.tn.pp .tnr .vs{font:900 30px/1 var(--headline);text-align:right;white-space:nowrap}.tn.pp .tnh span:last-child{text-align:right}.tn.pp .tnr .nm{min-width:0}.tn.pp .tnr .nm .pn2{display:block;font:800 31px/1.05 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden}.tn.pp .tnr .nm i{display:block;margin-top:3px;font:700 19px/1 var(--display);font-style:normal;letter-spacing:1px;color:rgba(247,247,242,.72)}.tn.pp .tnr .c{font:800 30px/1 var(--display);text-align:center;white-space:nowrap}.tn.pp .tnh span:not(:first-child){text-align:center}
.ubh{text-align:center;margin-top:4px;font:800 30px/1 var(--display);letter-spacing:3px;color:#F2C14E}.ul{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;margin-top:12px}.ub{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:8px 20px;border-radius:14px;background:rgba(5,8,6,.78);border:1px solid rgba(255,255,255,.16);border-left:7px solid #F2C14E}.ubt{font:700 21px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.75);text-transform:uppercase}.ubm{font:900 42px/1.02 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden}.ubm em{font-style:normal;color:#F2C14E;font-size:.7em}.ubf{display:flex;align-items:baseline;gap:14px}.ubl{font:700 20px/1 var(--display);letter-spacing:1px;color:rgba(247,247,242,.72)}.ubp{font:800 33px/1 var(--display);color:#39FF88;white-space:nowrap}.ubc{margin-left:auto;font:900 44px/1 var(--headline);color:#39FF88}.ubb{height:12px;border-radius:6px;background:#2A322D;overflow:hidden}.ubb i{display:block;height:100%;background:#39FF88}.ubr{display:flex;justify-content:flex-end;align-items:baseline;gap:10px}.ubq{font:900 34px/1 var(--headline);color:#F2C14E}.ubk{font:700 20px/1 var(--display);color:rgba(247,247,242,.72)}.ub.hero{gap:28px;padding:30px;justify-content:space-evenly}.hero .ubt{font-size:32px;text-align:center}.hero .ubm{font-size:100px;white-space:normal;text-align:center;line-height:1.05}.hero .ubp{font-size:70px}.hero .ubc{font-size:96px}.hero .ubl{font-size:28px}.hero .ubf{flex-wrap:wrap}.hero .ubl{width:100%}.hero .ubb{height:26px;border-radius:13px}.hero .ubq{font-size:66px}.hero .ubk{font-size:30px}
.rcr .s{font:900 50px/1 var(--headline);white-space:nowrap}.rcr .w{font:700 24px/1.1 var(--display);text-align:center}.rcr .o{font:900 32px/1 var(--headline);text-align:right}
`;

const data = () => JSON.parse(fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/nba-team-colors.json"), "utf8"));
const lift = (hex) => { let c = hex; for (let i = 0; i < 9 && relLuminance(c) < 0.05; i += 1) { const n = parseInt(c.slice(1), 16); const up = (v) => Math.min(255, Math.round(v + (255 - v) * 0.14)); c = `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(up).map((v) => v.toString(16).padStart(2, "0")).join("")}`; } return c; };
const inkOn = (bg) => (contrastRatio(bg, "#F7F7F2") >= contrastRatio(bg, "#050706") ? "#F7F7F2" : "#050706");
const NICK = Object.freeze({ "Portland Trail Blazers": ["Portland", "Trail Blazers"] });
/** Team identity for a card: real colours; a near-black primary is lifted only enough to read on the dark stage. */
export function teamOf(abbr, fullName) {
  const c = nbaTeamColor(data(), abbr);
  if (!c) throw new Error(`no verified colour for ${abbr}`);
  const words = String(fullName).split(" ");
  const [city, nickname] = NICK[fullName] ?? [words.slice(0, -1).join(" "), words.at(-1)];
  const color = lift(c.primary);
  return { abbr, name: fullName, city, nickname, color, secondary: lift(c.secondary), ink: inkOn(color) };
}
/** The same identity for an NFL team, from the validated NFL colours. */
export function nflTeamOf(abbr, fullName) {
  const c = nflTeamColor(abbr);
  if (!c) throw new Error(`no verified colour for ${abbr}`);
  const words = String(fullName).split(" ");
  const color = lift(c.primary);
  return { abbr, name: fullName, city: words.slice(0, -1).join(" "), nickname: words.at(-1), color, secondary: lift(c.secondary), ink: inkOn(color) };
}
/** The two meter colours: real team colours; on a clash the home side takes its secondary. */
export function meterColours(away, home) {
  if (!clashes(away.color, home.color)) return [away.color, home.color];
  if (!clashes(away.color, home.secondary)) return [away.color, home.secondary];
  if (!clashes(away.secondary, home.color)) return [away.secondary, home.color];
  return [away.color, "#F7F7F2"];
}

export function shell({ away, home, chip, body, review = true, disclosure = DISCLOSURE }) {
  const slots = { rawCss: css(), rawVars: `--ca:${away?.color ?? "#123A28"};--cb:${home?.color ?? "#123A28"}`, ghostA: away?.abbr ?? "", ghostB: home?.abbr ?? "", logoDataUri: logoDataUri(), chip, rawBody: body, rawBodyClass: "fmt-nba-pregame", disclosure, rawSocial: `<div class="social" data-handle="${CARD_FOOTER.handle}">${X}<span>${CARD_FOOTER.handle}</span></div>` };
  const html = fs.readFileSync(path.join(T, "shell.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`slot ${k}`);
    return k.startsWith("raw") || k === "logoDataUri" ? slots[k] : esc(slots[k]);
  });
  return html
    .replace('<div class="frame"></div>', `${review ? `<div class="draft">${esc(REVIEW_BANNER)}</div>` : ""}<div class="frame"></div>`)
    .replace(/(<div class="disclosure">[^<]*<\/div>)/, `$1${CARD_FOOTER.lines.filter((l) => l !== disclosure).map((l) => `<div class="rg">${esc(l)}</div>`).join("")}`);
}

const bcell = (cells, key, text, attrs = "") => { cells[key] = String(text); return `<b ${attrs} data-cell="${esc(key)}">${esc(text)}</b>`; };
const mark = (t) => `<div class="mark mono" data-mark="monogram" style="--c:${t.color};--a:${t.secondary};--cink:${t.ink}"><span data-fit>${esc(t.abbr)}</span></div>`;
const mbox = (t) => `<div class="mbox ${t.nickname.length > 11 ? "long" : ""}" style="--c:${t.color};--a:${t.secondary};--cink:${t.ink}">${mark(t)}<div class="mtext"><div class="city" data-fit>${esc(t.city)}</div><div class="nick" data-fit>${esc(t.nickname)}</div></div></div>`;
const slab = (t) => `<div class="slab" style="--c:${t.color};--a:${t.secondary};--cink:${t.ink}"><div class="city" data-fit>${esc(t.city)}</div><div class="nick" data-fit>${esc(t.nickname)}</div></div>`;

/** Reference 1. `g`: { eventId, away, home, awayP, homeP, awayPct, homePct, winner (team|null), tipDay, tipTime, chip }. */
export function winnerCard(g, { kicker = "GameTimePicks Prediction", meterLabel = "Model win probability", disclosure = DISCLOSURE, review = true } = {}) {
  const cells = {};
  const [ca, cb] = meterColours(g.away, g.home);
  const total = g.awayP + g.homeP;
  const body = `<div class="kicker">${esc(kicker)}</div><div class="matchup">${mbox(g.away)}<div class="vs2">@</div>${mbox(g.home)}</div>
<div class="meter" data-meter="elo"><div class="meter-k">${esc(meterLabel)}</div><div class="meter-labels"><div class="ml l">${bcell(cells, "away.pct", `${g.awayPct}%`)}<span data-fit>${esc(g.away.name)}</span></div><div class="ml r">${bcell(cells, "home.pct", `${g.homePct}%`)}<span data-fit>${esc(g.home.name)}</span></div></div>
<div class="meter-bar"><i class="seg away" data-share="${g.awayP}" style="width:${((100 * g.awayP) / total).toFixed(3)}%;--c:${ca}"></i><i class="seg home" data-share="${g.homeP}" style="width:${((100 * g.homeP) / total).toFixed(3)}%;--c:${cb}"></i></div></div>
<div class="winner2${g.market ? " mkw" : ""}"><div class="k">${g.winner ? "Predicted Winner" : "Too close to call"}</div>${g.winner ? slab(g.winner) : ""}</div>
${g.market ? `<div class="mkp"><div class="mk">${esc(g.market.label ?? "Price")}</div>${cell(cells, "market.price", `${g.market.sideAbbr} ${g.market.priceText}`, "mv")}</div>` : ""}<div class="strip"><div>${bcell(cells, "day", g.tipDay, "data-fit")}<span>${g.startWord ?? "Tip-off"}</span></div><div>${bcell(cells, "time", g.tipTime, "data-fit")}<span>Eastern time</span></div></div>`;
  return { html: shell({ away: g.away, home: g.home, chip: g.chip, body, disclosure, review }), cells, v2: true, disclosure };
}

/** Image 1 of an NFL game post: predicted side, official chances, kickoff, the side's price, then the top anytime TD chances. */
export function nflHeroCard(g, { disclosure = NFL_DISCLOSURE } = {}) {
  const cells = {};
  const [ca, cb] = meterColours(g.away, g.home);
  const total = g.awayP + g.homeP;
  const body = `<div class="kicker">GameTimePicks Prediction</div><div class="gph solo"><div class="winner2"><div class="k">Predicted Winner</div>${slab(g.winner)}</div>
<div class="meter" data-meter="official"><div class="meter-k">Model win probability</div><div class="meter-labels"><div class="ml l">${bcell(cells, "away.pct", `${g.awayPct}%`)}<span data-fit>${esc(g.away.name)}</span></div><div class="ml r">${bcell(cells, "home.pct", `${g.homePct}%`)}<span data-fit>${esc(g.home.name)}</span></div></div>
<div class="meter-bar"><i class="seg away" data-share="${g.awayP}" style="width:${((100 * g.awayP) / total).toFixed(3)}%;--c:${ca}"></i><i class="seg home" data-share="${g.homeP}" style="width:${((100 * g.homeP) / total).toFixed(3)}%;--c:${cb}"></i></div></div>
<div class="strip"><div>${bcell(cells, "day", g.tipDay, "data-fit")}<span>Kickoff</span></div><div>${bcell(cells, "time", g.kickoffText, "data-fit")}<span>Eastern</span></div>${g.market ? `<div>${bcell(cells, "market.price", `${g.market.sideAbbr} ${g.market.priceText}`, 'class="pv" data-fit')}<span>Price</span></div>` : ""}</div></div>`;
  return { html: shell({ away: g.away, home: g.home, chip: g.chip, body, disclosure }), cells, v2: true, disclosure };
}

/** Ranked anytime TD card: rank, name, team, probability, and the verified Yes price when one exists. `rows` is one to three players already cleared for availability. */
export function nflTdCard({ away, home, chip, rows, disclosure = NFL_DISCLOSURE }) {
  const cells = {};
  const body = `<div class="kicker">Top ${rows.length} Anytime TD Candidates</div><div class="tdb solo"><div class="tdh">MODEL TOUCHDOWN PROBABILITY</div>${rows.map((r) => `<div class="tdr" style="--c:${r.team.color};--cink:${r.team.ink}"><span class="n">${r.rank}</span><span class="pn2" data-fit>${cell(cells, `td.${r.key}.name`, r.name)}</span><span class="tag">${esc(r.team.abbr)}</span><div class="tdv">${cell(cells, `td.${r.key}.pct`, r.pct, "pc")}${r.quote ? cell(cells, `td.${r.key}.yes`, mono(r.note), "yes") : ""}</div></div>`).join("")}</div>`;
  return { html: shell({ away, home, chip, body, disclosure }), cells, v2: true, disclosure };
}

/** A: one card, every game of the slate. */
export function tonightCard({ games, chip, kicker = "NBA Tonight", sub = "Model win probability", timeHead = "TIP ET", disclosure = DISCLOSURE, priced = false, note = null }) {
  const cells = {};
  const rows = games.map((g) => {
    const [ca, cb] = meterColours(g.away, g.home);
    return `<div class="tnr">${cell(cells, `${g.eventId}.tip`, g.tipTime, "t")}${cell(cells, `${g.eventId}.away`, g.away.abbr, "tm")}${cell(cells, `${g.eventId}.ap`, `${g.awayPct}%`, "p")}<div class="bar" data-bar="${g.eventId}"><i style="width:${(g.awayP * 100).toFixed(2)}%;background:${ca}"></i><i style="width:${(g.homeP * 100).toFixed(2)}%;background:${cb}"></i></div>${cell(cells, `${g.eventId}.hp`, `${g.homePct}%`, "p")}${cell(cells, `${g.eventId}.home`, g.home.abbr, "tm")}${cell(cells, `${g.eventId}.w`, g.winner?.abbr ?? "EVEN", "wn")}${priced ? cell(cells, `${g.eventId}.price`, g.market.priceText, "pr") : ""}</div>`;
  }).join("");
  const priceHead = "PRICE";
  const body = `<div class="kicker">${esc(kicker)}</div><div class="sub" data-fit>${esc(sub)}</div><div class="tn ${games.length > 10 ? "dense" : ""} ${priced ? "ml" : ""} ${priced && games.some((g) => String(g.awayPct).includes(".")) ? "dec" : ""}"><div class="tnh"><span>${esc(timeHead)}</span><span>AWAY</span><span></span>${priced ? '<span class="wh">MODEL WIN %</span>' : "<span></span>"}<span></span><span>HOME</span><span>WINNER</span>${priced ? `<span class="ph">${esc(priceHead)}</span>` : ""}</div>${rows}</div>${note ? `<div class="mkn">${cell(cells, "market.quoted", note)}</div>` : ""}`;
  return { html: shell({ chip, body, disclosure }), cells, v2: true, disclosure };
}

const CLS = Object.freeze({ over: "over", under: "under", neutral: "none", none: "none" });
const mono = (s) => String(s).replace(/−/g, "-");
/** A number and, on a real-line card, its comparison. `line` from lineBlock; `real` false = reference 2 (plain white). */
function statCell(cells, key, text, line, real) {
  if (!real) return `<div>${`<b>${cell(cells, key, text)}</b>`}</div>`;
  const cls = line ? CLS[line.cls] : "none";
  const g = line ? (line.glyph || "●") : "●";
  return `<div><b class="${cls}">${cell(cells, key, `${g} ${text}`)}</b>${line ? `<em class="${cls}">${cell(cells, `${key}.line`, mono(line.text.replace(/^([OU] \S+) /, "$1 · ")))}</em>` : "<em>&nbsp;</em>"}</div>`;
}

/** Reference 2, all players over Part 1/2. `players`: { id, name, pts, reb, ast, lines? } per side. */
export function statPages({ away, home, chip, awayPlayers: allAway, homePlayers: allHome, real = false }) {
  // Unified one-image layout: verified starters plus a sixth man per team, order from the roster file.
  const unified = process.env.GTP_NBA_UNIFIED_ROSTER ? JSON.parse(fs.readFileSync(process.env.GTP_NBA_UNIFIED_ROSTER, "utf8")) : null;
  const pick = (t, ps) => (unified ? (unified[t.abbr] ?? []).map((e) => (e.review ? e : ps.find((p) => String(p.id) === String(e)))).filter(Boolean) : ps);
  const awayPlayers = pick(away, allAway); const homePlayers = pick(home, allHome);
  const pages = Math.max(1, Math.ceil(Math.max(awayPlayers.length, homePlayers.length) / PER_TEAM));
  return Array.from({ length: pages }, (_, i) => {
    const cells = {};
    const col = (t, ps) => `<div class="lcol" style="--c:${t.color}"><div class="lhead">${mark(t)}<h3 data-fit>${esc(t.nickname)}</h3></div><div class="st-hd"><span>PTS</span><span>REB</span><span>AST</span></div>${ps.slice(i * PER_TEAM).length ? "" : `<div class="pl"><span class="pn2">All rows on Part 1</span></div>`}${ps.slice(i * PER_TEAM, (i + 1) * PER_TEAM).map((p) => p.review ? `<div class="pl"><span class="pn2" data-fit>${esc(p.name)}</span><div class="ns" style="display:block;text-align:left"><em style="font-size:22px">${esc(p.text ?? "Projection under model review")}</em></div></div>` : `<div class="pl"><span class="pn2" data-fit>${cell(cells, `${p.id}.name`, p.name)}</span><div class="ns">${["pts", "reb", "ast"].map((k) => unified?.__cells?.[String(p.id)]?.includes(k) ? `<div><b style="font-size:24px">Review</b></div>` : statCell(cells, `${p.id}.${k}`, p[k], p.lines?.[k] ?? null, real)).join("")}</div></div>`).join("")}</div>`;
    const part = pages > 1 ? ` · Part ${i + 1} of ${pages}` : "";
    const body = `<div class="kicker">${unified ? "Model projection" : "Projected stat lines"}</div><div class="sub" data-fit>${esc(away.abbr)} @ ${esc(home.abbr)}${part}</div>${real ? `<div class="lgd"><span class="over">▲ Above line</span><span class="under">▼ Below line</span><span class="none">● No comparison</span></div>` : ""}<div class="lines sl ${real ? "real" : ""}">${col(away, awayPlayers)}${col(home, homePlayers)}</div>`;
    return { html: shell({ away, home, chip, body }), cells, v2: true, part: i + 1, parts: pages };
  });
}

/** B. `rows`: { key, rank, name, team (obj), opponent, tip, text, line? }. */
export function top5Card({ title, chip, rows, real = false, kicker = "Top 5 Projections", sub = "Projected for the game", estimate = null, section = null, disclosure = DISCLOSURE, note = null, away = null, home = null }) {
  const cells = {};
  const body = `<div class="kicker">${esc(kicker)}</div><div class="title" style="font-size:84px;margin-top:14px">${esc(title)}</div><div class="sub" data-fit>${esc(sub)}</div>${section ? `<div class="secl">${cell(cells, "section", section)}</div>` : ""}${estimate ? `<div class="estl">${cell(cells, "estimate", estimate)}</div>` : ""}<div class="t5">${rows.map((r) => {
    const cls = real ? (r.line ? CLS[r.line.cls] : "none") : "";
    const num = r.line?.glyph ? `${r.line.glyph} ${r.text}` : r.text;
    return `<div class="t5row r${r.rank}" style="--c:${r.team.color}"><div class="n">${r.rank}</div><div style="min-width:0"><span class="pname board nm" data-fit style="display:block">${cell(cells, `${r.key}.name`, r.name)}</span><div class="sb"><span class="tag" style="--c:${r.team.color};--cink:${r.team.ink}">${esc(r.team.abbr)}</span><span>vs ${esc(r.opponent)} · ${esc(r.tip)}</span></div></div><div class="v">${bcell(cells, `${r.key}.num`, num, cls ? `class="${cls}" style="font-size:64px"` : "")}${real && r.line ? cell(cells, `${r.key}.line`, mono(r.line.sideText ?? r.line.text), `ln ${cls}`) : ""}${r.note ? cell(cells, `${r.key}.note`, mono(r.note), "ln none") : ""}</div></div>`;
  }).join("")}</div>${note ? `<div class="mkn">${cell(cells, "market.quoted", note)}</div>` : ""}`;
  return { html: shell({ away, home, chip, body, disclosure }), cells, v2: true, disclosure };
}

const NFL_SLOT = Object.freeze([["player_pass_yds", "PASS YDS"], ["player_rush_yds", "RUSH YDS"], ["player_reception_yds", "REC YDS"], ["anytime_td", "TD CHANCE"], ["player_receptions", "REC"]]);
export const NFL_SLOTS_PER_PLAYER = 3;
/** Per-game NFL player card. `players`: { id, name, stats: { family: text } }; each player shows his first three families in NFL_SLOT order. */
export function nflPlayerPages({ away, home, chip, awayPlayers, homePlayers, estimate = null }) {
  const pages = Math.max(1, Math.ceil(Math.max(awayPlayers.length, homePlayers.length) / PER_TEAM));
  return Array.from({ length: pages }, (_, i) => {
    const cells = {};
    const slots = (p) => NFL_SLOT.filter(([f]) => p.stats[f] != null).slice(0, NFL_SLOTS_PER_PLAYER);
    const col = (t, ps) => `<div class="lcol" style="--c:${t.color}"><div class="lhead">${mark(t)}<h3 data-fit>${esc(t.nickname)}</h3></div>${ps.slice(i * PER_TEAM, (i + 1) * PER_TEAM).map((p) => `<div class="pl nfl"><span class="pn2" data-fit>${cell(cells, `${p.id}.name`, p.name)}</span><div class="ns">${slots(p).map(([f, label]) => `<div><b>${cell(cells, `${p.id}.${f}`, p.stats[f])}</b><em>${esc(label)}</em></div>`).join("")}</div></div>`).join("")}</div>`;
    const part = pages > 1 ? ` · Part ${i + 1} of ${pages}` : "";
    const body = `<div class="kicker">Projected player stats</div><div class="sub" data-fit>${esc(away.abbr)} @ ${esc(home.abbr)}${part}</div>${estimate ? `<div class="estl">${cell(cells, "estimate", estimate)}</div>` : ""}<div class="lines sl">${col(away, awayPlayers)}${col(home, homePlayers)}</div>`;
    return { html: shell({ away, home, chip, body, disclosure: NFL_DISCLOSURE }), cells, v2: true, disclosure: NFL_DISCLOSURE, part: i + 1, parts: pages };
  });
}

export const NFL_PROP_ROWS_PER_IMAGE = 8;
/** Combined props with the social line comparison. `rows`: { key, name, team, family, projection, line, vs: { text, cls } }. Colour is arithmetic only (nfl-line-comparison.mjs). */
export function nflPropsPages({ away, home, chip, rows, estimate = null, note = null, legend = null }) {
  const pages = Math.max(1, Math.ceil(rows.length / NFL_PROP_ROWS_PER_IMAGE));
  return Array.from({ length: pages }, (_, i) => {
    const cells = {};
    const list = rows.slice(i * NFL_PROP_ROWS_PER_IMAGE, (i + 1) * NFL_PROP_ROWS_PER_IMAGE).map((r) => `<div class="tnr"><div class="nm"><span class="pn2" data-fit>${cell(cells, `${r.key}.name`, r.name)}</span><i>${esc(r.team)} · ${esc(r.family)}</i></div>${cell(cells, `${r.key}.proj`, r.projection, "c")}${cell(cells, `${r.key}.line`, r.line, "c")}${cell(cells, `${r.key}.vs`, r.vs.text, r.vs.cls)}</div>`).join("");
    const part = pages > 1 ? ` · Part ${i + 1} of ${pages}` : "";
    const body = `<div class="kicker">Player projections</div><div class="sub" data-fit>${esc(away.abbr)} @ ${esc(home.abbr)}${part}</div>${estimate ? `<div class="estl">${cell(cells, "estimate", estimate)}</div>` : ""}<div class="tn pp"><div class="tnh"><span>PLAYER</span><span>MODEL</span><span>LINE</span><span>VS LINE</span></div>${list}</div>${legend ? `<div class="mkn">${cell(cells, "legend", legend)}</div>` : ""}${note ? `<div class="mkn">${cell(cells, "market.quoted", note)}</div>` : ""}`;
    return { html: shell({ away, home, chip, body, disclosure: NFL_DISCLOSURE }), cells, v2: true, disclosure: NFL_DISCLOSURE, part: i + 1, parts: pages };
  });
}

/** E. `recap` from buildNbaRecap. */
export function recapCard({ recap, chip, teams, kicker = "NBA Results", disclosure = DISCLOSURE }) {
  const cells = {};
  const body = `<div class="kicker">${esc(kicker)}</div><div class="sub" data-fit>${esc(`${recap.graded} of ${recap.gamesScheduled} games graded`)}</div><div class="rcs">${[["GRADED", recap.graded], ["CORRECT", recap.correct], ["MISSED", recap.missed], ["ACCURACY", recap.accuracy]].map(([l, v]) => `<div><b>${cell(cells, `stat.${l}`, v ?? "n/a")}</b><i>${l}</i></div>`).join("")}</div><div class="rc ${recap.games.length > 6 ? "dense" : ""}">${recap.games.map((g) => {
    const s = g.final ? `${g.away} ${g.final.away} @ ${g.home} ${g.final.home}` : g.matchup;
    const o = g.outcome === "CORRECT" ? "Correct" : g.outcome === "MISSED" ? "Missed" : "Not graded";
    return `<div class="rcr ${g.outcome === "MISSED" ? "miss" : ""}" ${teams ? "" : ""}>${cell(cells, `${g.eventId}.final`, s, "s")}${cell(cells, `${g.eventId}.side`, g.frozenSide ? `Predicted ${g.frozenSide}` : "No side", "w")}${cell(cells, `${g.eventId}.o`, o, "o")}</div>`;
  }).join("")}</div>`;
  return { html: shell({ chip, body, disclosure }), cells, v2: true, disclosure };
}

const ICON = Object.freeze({
  CORRECT: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 40 80 88 22" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  MISSED: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20 20 80 80M80 20 20 80" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/></svg>',
});
const OUTCOME = Object.freeze({ CORRECT: ["hit", "Correct"], MISSED: ["miss", "Missed"] });
export const RESULTS_HERO_MAX_ROWS = 12;
/** The slate on the game-day stage: the record, the accuracy, one row per game; compact rows past six games. Beyond 12, recapCard. */
export function resultsHeroCard({ recap, chip, kicker = "NBA Results", disclosure = DISCLOSURE }) {
  if (recap.games.length > RESULTS_HERO_MAX_ROWS) return recapCard({ recap, chip, kicker, disclosure });
  const dense = recap.games.length > 6;
  const cells = {};
  const rows = recap.games.map((g) => {
    const [cls, word] = OUTCOME[g.outcome] ?? ["void", "Not graded"];
    const score = g.final ? `${g.away} ${g.final.away} @ ${g.home} ${g.final.home}` : g.matchup;
    return `<div class="rxr ${cls}"><div class="ic">${ICON[g.outcome] ?? ""}${cell(cells, `${g.eventId}.o`, word)}</div>${cell(cells, `${g.eventId}.final`, score, "s")}<div class="pd"><i>PREDICTED</i>${cell(cells, `${g.eventId}.side`, g.frozenSide ?? "No side")}</div></div>`;
  }).join("");
  const body = `<div class="kicker">${esc(kicker)}</div><div class="sub" data-fit>${esc(`${recap.graded} of ${recap.gamesScheduled} games graded`)}</div><div class="rxh${dense ? " d" : ""}"><div>${bcell(cells, "stat.RECORD", `${recap.correct}-${recap.missed}`, 'class="rec"')}<i>RECORD</i></div><div>${bcell(cells, "stat.ACCURACY", recap.accuracy ?? "n/a", 'class="acc"')}<i>ACCURACY</i></div></div><div class="rc rx${dense ? " d" : ""}">${rows}</div>`;
  return { html: shell({ chip, body, disclosure }), cells, v2: true, disclosure };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')]));
const OK_PHRASES = [/predicted winner/gi, /game winner estimates?/gi, /winner/g, /WINNER/g];
const BOOK_NAMES = REFERENCE_BOOK_ORDER.map((k) => NBA_PROP_LINE_ADAPTER.bookLabel(k));
/** Source-neutral display: no book name and no quote line on any image; book, time and market ids stay in the package metadata. */
export function sourceTextProblems(text) {
  const t = String(text).toLowerCase();
  return [...BOOK_NAMES.filter((b) => t.includes(b.toLowerCase())).map((b) => `book name on image: ${b}`), ...(/\b(prices? )?(observed|quoted)\b/.test(t) ? ["quote line on image"] : [])];
}
/** [] when a v2 card prints exactly `cells`, carries banner and footer, and no internal text. */
/** Stat labels say MODEL PROJECTION: no "est.", Estimate or projected median as visible text. EST kickoffs and the win-chance label are not stat labels. */
export function statLabelProblems(text) {
  const t = String(text).replace(/game winner estimates?/gi, " ");
  return [...(/(^|[^a-z])est\./.test(t) ? ["est. on image"] : []), ...(/\bestimates?\b/i.test(t) ? ["Estimate on image"] : []), ...(/projected median/i.test(t) ? ["projected median on image"] : [])];
}
export function verifyGameDayCard(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " "));
  if (!text.includes(REVIEW_BANNER)) e.push("banner missing");
  if (!text.includes(card.disclosure ?? DISCLOSURE)) e.push("footer missing");
  if (/\bElo\b|[0-9a-f]{16,}|moneyline/i.test(text)) e.push("internal text on image");
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(text), ...statLabelProblems(text));
  let t = text; for (const p of OK_PHRASES) t = t.replace(p, " ");
  for (const w of BANNED_WORDS) if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(t)) e.push(`banned ${w}`);
  return e;
}
