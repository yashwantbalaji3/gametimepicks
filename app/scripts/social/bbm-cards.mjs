/* global document, window, getComputedStyle -- bbmLayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER & MOONSHOT CHALLENGE GRAPHICS V2 (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §4). One 1080x1350 card per lane on
 * the established social stage (game-day-cards.mjs shell). Script-only. Every number sits in a data-cell element and is
 * proven by verifyBbmCard against the lane view (src/lib/social/bbm-lane.mjs laneView) and the resolved, re-checked legs
 * (src/lib/social/combo-social.mjs resolveCombo).
 *
 *   hero     STEP k OF N (or BUSTED AT STEP k OF N, NO QUALIFYING CARD TODAY with the step it is still on, GOAL REACHED)
 *   ladder   one rung per step: completed (filled), active (lit ring), failed, upcoming
 *   bankroll START (muted) · TRACKED (solid: the settled result) · GOAL (dashed outline: hypothetical)
 *   legs     team identity, game, tip, MODEL WIN PROBABILITY / MODEL PROJECTION; Moonshot rotation flags
 *   money    WAGER (tracked stake) · POTENTIAL PAYOUT · POTENTIAL PROFIT (striped: pending) · LADDER PROGRESS.
 *            Payout numbers come only from a verified PAYOUT_COMPUTED; otherwise PAYOUT · AWAITING VERIFIED PRICES.
 *   footer   one factual line: Tracked challenge · no real wager placed.
 *
 * No review banner, offer banner, "must land" sentence or betting-advice footer (founder V2 directive): approval stays in
 * the console. No price, line, book or odds text ever prints. A fixture price prints only with its SAMPLE PRICE ribbon.
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, sourceTextProblems, statLabelProblems, teamOf } from "./game-day-cards.mjs";
import { visibleText } from "./nba-line-cards.mjs";
import { BADGE, RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export const BBM_DESIGN_VERSION = "bbm-v2";
export const FACT_LINE = "Tracked challenge · no real wager placed";
/** Terms review 2026-11-04 (docs/odds/ODDS_API_CHALLENGE_GRAPHICS_TERMS_2026-11-04.md): beside the fact line, US audience. */
export const RG_LINE = "21+ · Gamble responsibly";
/** An early price's tag (founder P0 2026-11-04): small and honest, never a banner. */
export const PRELIMINARY_TAG = "Preliminary prices · re-verified before posting";
const FOOTER = `${FACT_LINE} · ${RG_LINE}`;
export const MODEL_LABEL = "MODEL PROJECTION";
export const WIN_LABEL = "MODEL WIN PROBABILITY";
export const AWAITING = "AWAITING VERIFIED PRICES";
export const TEST_RIBBON = "TEST FIXTURE · NOT REAL DATA";
export const SAMPLE_PRICE_RIBBON = "SAMPLE PRICE · NOT REAL";
/** Text the V2 directive removed from every export. A card printing any of it is refused. */
export const REMOVED_TEXT = Object.freeze(["FOUNDER REVIEW ONLY", "NOT AUTHORIZED FOR SOCIAL POSTING", "MODEL-ONLY", "NOT A SPORTSBOOK OFFER", "must land", "Not betting advice"]);
const PRODUCT = Object.freeze({
  "bank-builder": { name: "Bank Builder", cls: "bb", a: { abbr: "BANK", color: "#0E4A4F" }, b: { abbr: "BUILD", color: "#1B2F52" }, acc: "#F2C14E", acc2: "#4FD1C5" },
  moonshot: { name: "Moonshot", cls: "ms", a: { abbr: "MOON", color: "#6B1FA8" }, b: { abbr: "SHOT", color: "#E0480F" }, acc: "#FF7A2E", acc2: "#B57BFF" },
});

const CSS = `<style>
.content .disclosure{font:700 22px/1.2 var(--display);letter-spacing:2px;white-space:nowrap;color:rgba(247,247,242,.78);text-transform:uppercase}
.bv-rib{position:absolute;top:14px;left:0;right:0;z-index:9;text-align:center;font:900 26px/40px var(--headline);letter-spacing:.12em;color:#fff}
.bv-rib.t{background:#FF3B6B}.bv-rib.p{background:#E8B100;color:#050706}
.bv{display:flex;flex-direction:column;flex:1;min-height:0}
.bv-top{margin-top:8px;display:flex;justify-content:center;align-items:center;gap:16px;font:900 34px/1 var(--headline);letter-spacing:6px;text-transform:uppercase}
.bv-top .p{color:var(--acc);text-shadow:0 0 22px color-mix(in srgb,var(--acc) 55%,transparent)}
.bv-top .l{padding:7px 14px 4px;border-radius:8px;background:var(--acc);color:#050706;letter-spacing:3px}
.bv-top .r{font:800 22px/1 var(--display);letter-spacing:3px;padding:7px 12px 4px;border-radius:999px;border:2px solid var(--acc2);color:#E4CCFF;background:rgba(5,8,6,.78)}
.bv-hero{margin-top:6px;text-align:center;font:900 98px/.9 var(--headline);letter-spacing:-1px;text-transform:uppercase;color:#F7F7F2;white-space:nowrap;overflow:hidden;text-shadow:0 6px 30px rgba(0,0,0,.6)}
.bv-hero b{color:var(--acc);font-weight:900}
.bv.ms .bv-hero{background:linear-gradient(180deg,#FFE3B0,#FF7A2E 55%,#E0480F);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 26px rgba(255,122,46,.5))}
.bv.ms .bv-hero b{color:inherit}
.bv-hero.s{font-size:84px;padding:0 10px}.bv-hero.bust{background:none;color:#FF4D5E;filter:drop-shadow(0 0 22px rgba(255,77,94,.45));-webkit-background-clip:initial;background-clip:initial}
.bv-sub{margin-top:6px;text-align:center;font:800 26px/1 var(--display);letter-spacing:5px;color:rgba(247,247,242,.85);text-transform:uppercase;white-space:nowrap}
.bv-lad{margin-top:12px;display:flex;align-items:flex-start;padding:0 40px}
.bv-lad .seg{flex:1;height:8px;margin-top:23px;border-radius:4px;background:rgba(255,255,255,.14)}
.bv-lad .seg.on{background:var(--acc)}
.bv-lad .seg:first-child,.bv-lad .seg:last-child{flex:.45}
.bv-lad .rg{flex:none;width:96px;text-align:center}
.bv-lad .dot{margin:0 auto;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 30px/1 var(--headline);border:4px solid rgba(255,255,255,.28);color:rgba(247,247,242,.55);background:rgba(5,8,6,.7)}
.bv-lad .rg.completed .dot{background:var(--acc);border-color:var(--acc);color:#050706}
.bv-lad .rg.active .dot{border-color:var(--acc);color:#F7F7F2;background:color-mix(in srgb,var(--acc) 22%,rgba(5,8,6,.85));box-shadow:0 0 0 6px color-mix(in srgb,var(--acc) 30%,transparent),0 0 30px var(--acc)}
.bv-lad .rg.failed .dot{background:#FF4D5E;border-color:#FF4D5E;color:#050706}
.bv-lad .rg .k{margin-top:7px;font:800 17px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.7);white-space:nowrap}
.bv-lad .rg.active .k{color:var(--acc)}.bv-lad .rg.failed .k{color:#FF4D5E}
.bv-lad .rg .a{margin-top:3px;font:800 19px/1 var(--display);color:var(--acc);white-space:nowrap}
.bv-bank{margin-top:10px;display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:12px}
.bv-bank>div{border-radius:14px;padding:9px 10px 8px;text-align:center}
.bv-bank .k{font:800 16px/1 var(--display);letter-spacing:2px;text-transform:uppercase;white-space:nowrap}
.bv-bank .v{display:block;margin-top:3px;font:900 40px/1 var(--display);white-space:nowrap}
.bv-bank .st{background:rgba(5,8,6,.6);border:1px solid rgba(255,255,255,.14);color:rgba(247,247,242,.72)}
.bv-bank .tr{background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 92%,#fff),var(--acc));color:#050706;box-shadow:0 0 34px color-mix(in srgb,var(--acc) 45%,transparent)}
.bv-bank .tr .v{font-size:46px}
.bv-bank .gl{background:rgba(5,8,6,.55);border:3px dashed var(--acc);color:var(--acc)}
.bv-legs{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:12px;margin-top:14px}
.lg{position:relative;display:grid;grid-template-columns:60px 1fr 300px;align-items:center;gap:14px;padding:14px 20px;border-radius:18px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 34%,rgba(5,8,6,.9)),rgba(5,8,6,.88) 58%);border:1px solid rgba(255,255,255,.16);border-left:10px solid var(--c)}
.lg .n{font:900 48px/1 var(--headline);color:var(--acc);text-align:center}
.lg .who{min-width:0}
.lg .nm{display:block;font:900 50px/1.02 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden}
.lg .mt{display:flex;align-items:center;gap:10px;margin-top:6px;font:700 22px/1 var(--display);letter-spacing:1px;color:rgba(247,247,242,.8);white-space:nowrap}
.lg .tg{font:900 22px/1 var(--headline);padding:5px 8px 3px;border-radius:7px;background:var(--c);color:var(--cink)}
.lg .pj{text-align:right}
.lg .pk{display:block;font:800 16px/1 var(--display);letter-spacing:2px;color:var(--acc)}
.lg .pv{display:block;margin-top:4px;font:900 62px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.lg .pm{display:block;margin-top:2px;font:700 19px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.75);white-space:nowrap}
.lg .oc{font:900 20px/1 var(--headline);letter-spacing:2px;padding:5px 8px 3px;border-radius:6px}
.lg .oc.WIN{background:var(--acc);color:#050706}.lg .oc.LOSS{background:#FF4D5E;color:#050706}.lg .oc.VOID,.lg .oc.PUSH,.lg .oc.PENDING{background:rgba(255,255,255,.2);color:#F7F7F2}
.lg .fl{grid-column:2 / 4;display:flex;align-items:center;gap:10px;min-width:0;font:800 22px/1.1 var(--display);letter-spacing:.5px;color:#FFD166;white-space:nowrap;overflow:hidden}
.lg .fl i{flex:none;font:900 19px/1 var(--headline);font-style:normal;padding:4px 8px 2px;border-radius:6px;background:#FFD166;color:#050706;letter-spacing:1px}
.lg .fl span{min-width:0;overflow:hidden}
.bv-legs.d{gap:7px}.bv-legs.d .lg{padding:5px 18px;gap:3px 12px}.bv-legs.d .nm{font-size:36px}.bv-legs.d .n{font-size:38px}.bv-legs.d .pv{font-size:44px;margin-top:1px}.bv-legs.d .mt{font-size:19px;margin-top:3px}.bv-legs.d .tg{font-size:19px}.bv-legs.d .pk{font-size:14px}.bv-legs.d .pm{font-size:16px;margin-top:0}.bv-legs.d .fl{font-size:21px}
.bv-legs.d5{gap:5px;margin-top:10px}.bv-legs.d5 .lg{padding:4px 16px;gap:2px 10px;grid-template-columns:48px 1fr 230px}.bv-legs.d5 .nm{font-size:31px}.bv-legs.d5 .n{font-size:32px}.bv-legs.d5 .pv{font-size:36px;margin-top:0}.bv-legs.d5 .pk{font-size:12px}.bv-legs.d5 .pm{display:none}.bv-legs.d5 .mt{font-size:17px;margin-top:2px;gap:8px}.bv-legs.d5 .tg,.bv-legs.d5 .od,.bv-legs.d5 .ln{font-size:16px;padding:3px 6px 2px}.bv-legs.d5 .fl{font-size:20px}.bv-legs.d5 .fl i{font-size:16px}
.bv.n5 .bv-hero{font-size:84px}.bv.n5 .bv-sub{font-size:22px;margin-top:4px}.bv.n5 .bv-lad{margin-top:8px}.bv.n5 .bv-bank{margin-top:8px}.bv.n5 .bv-bank .v{font-size:36px}.bv.n5 .bv-bank .tr .v{font-size:40px}.bv.n5 .bv-pace{margin-top:6px;font-size:19px}.bv.n5 .bv-money{margin-top:8px}.bv.n5 .bv-money .v{font-size:36px}.bv.n5 .bv-src{margin-top:6px}
.bv.bb .bv-legs{gap:20px}.bv.bb .lg{padding:30px 26px}.bv.bb .nm{font-size:60px}.bv.bb .pv{font-size:76px}.bv.bb .mt{margin-top:10px}
.bv-stat{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;margin-top:18px;text-align:center}
.bv-stat .k{font:900 50px/1.05 var(--headline);letter-spacing:3px;text-transform:uppercase;color:#F7F7F2;padding:18px 28px 14px;border-radius:18px;border:2px solid rgba(255,255,255,.2);background:rgba(5,8,6,.7)}
.bv-stat .c{font:700 28px/1.3 var(--display);letter-spacing:1px;color:rgba(247,247,242,.82)}
.bv-money{flex:none;margin-top:14px;display:grid;grid-template-columns:1fr 1.7fr 1.15fr;gap:10px}
.bv-money.pr{grid-template-columns:1fr 1fr 1fr 1.15fr}
.bv-money>div{position:relative;border-radius:14px;padding:11px 14px 10px;background:rgba(5,8,6,.8);border:1px solid rgba(255,255,255,.16);min-width:0}
.bv-money .k{font:800 16px/1 var(--display);letter-spacing:2px;color:var(--acc);text-transform:uppercase;white-space:nowrap}
.bv-money .v{display:block;margin-top:6px;font:900 40px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.bv-money .c{margin-top:4px;font:700 15px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.62);text-transform:uppercase;white-space:nowrap}
.bv-money .pend{background:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 10px,rgba(5,8,6,.82) 10px 20px);border:2px dashed color-mix(in srgb,var(--acc) 70%,transparent)}
.bv-money .bust{border:2px solid #FF4D5E}.bv-money .bust .k,.bv-money .bust .v{color:#FF4D5E}
.bv-money .aw .v{font-size:31px;margin-top:9px}
.bv-money .fx{position:absolute;bottom:9px;right:10px;font:900 14px/1 var(--headline);letter-spacing:2px;padding:3px 6px 1px;border-radius:5px;background:#E8B100;color:#050706}
.bv-top .bd{font:900 24px/1 var(--headline);letter-spacing:3px;padding:8px 14px 5px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;background:rgba(5,8,6,.82);border:2px solid currentColor}
.bv-top .bd:before{content:"";width:12px;height:12px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor}
.bd.ACTIVE{color:#39FF88}.bd.WON{color:#F2C14E}.bd.LOST{color:#FF4D5E}.bd.HELD{color:#FFB23F}.bd.COMPLETED{color:#F2C14E}.bd.FINISHED{color:#C9D1D9}
.bv-lad .rg .m{margin-top:3px;font:800 19px/1 var(--display);color:rgba(247,247,242,.55);white-space:nowrap}
.bv-lad .rg.completed .m,.bv-lad .rg.active .m{color:var(--acc)}
.bv-pace{margin-top:8px;text-align:center;font:800 22px/1 var(--display);letter-spacing:3px;text-transform:uppercase;white-space:nowrap}
.bv-pace.ON_PACE{color:rgba(247,247,242,.85)}.bv-pace.BEHIND{color:#FFB23F}.bv-pace.WITHHELD{color:rgba(247,247,242,.7)}
.lg .od{font:900 21px/1 var(--display);letter-spacing:1px;padding:5px 8px 3px;border-radius:6px;background:rgba(247,247,242,.92);color:#050706}
.bv-src{flex:none;margin-top:10px;display:flex;justify-content:center;align-items:center;gap:14px;white-space:nowrap;overflow:hidden}
.bv-src .cp{font:900 22px/1 var(--headline);letter-spacing:2px;padding:6px 12px 4px;border-radius:8px;background:var(--acc);color:#050706;text-transform:uppercase}
.bv-src .cp.est{background:#FFB23F}
.bv-pre{flex:none;margin-top:6px;text-align:center;font:800 16px/1 var(--display);letter-spacing:2px;color:#FFB23F;white-space:nowrap}
.bv-src .sr{font:700 16px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.66);text-transform:uppercase}
.lg .ln{font:900 20px/1 var(--headline);letter-spacing:1px;padding:5px 8px 3px;border-radius:6px;border:2px solid var(--acc);color:var(--acc)}
.bv-burst{position:absolute;left:50%;top:330px;width:1400px;height:1400px;margin-left:-700px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,122,46,.10) 0 4deg,transparent 4deg 12deg);-webkit-mask:radial-gradient(circle,#000 0,#000 30%,transparent 62%);mask:radial-gradient(circle,#000 0,#000 30%,transparent 62%);pointer-events:none}
</style>`;

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const at = (iso) => new Date(Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")));
export const tipText = (iso) => `${ET_TIME.format(at(iso))} ET`;
/** The posting day is an ET calendar date; printed from the date itself, never from a clock. */
export const chipText = (date) => `NBA · ${ET_DAY.format(new Date(`${date}T12:00:00Z`)).replace(",", "")}`;
/** $100, $10,000, $464.13 from integer cents: whole dollars without cents, otherwise two decimals. */
export const cents = (c) => money(c / 100);
const money = (n) => `$${Number(n).toLocaleString("en-US", Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OUTCOME_TEXT = Object.freeze({ WIN: "LANDED", LOSS: "MISSED", VOID: "VOID", PUSH: "PUSH", PENDING: "PENDING" });

/** American odds as printed: +264, -110 (ASCII hyphen: the house rule bans typographic dashes on images). */
export const american = (n) => (Number.isFinite(n) ? `${n > 0 ? "+" : "-"}${Math.abs(Math.round(n))}` : null);
const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function legHtml(cells, l, i, outcome, price = null) {
  const t = teamOf(l.team.abbr, l.team.name);
  const k = `leg${i + 1}`;
  const winner = l.kind === "GAME_WINNER";
  const who = winner ? t.name : l.player.name;
  const vs = `${l.home ? "vs" : "@"} ${l.opponent.abbr}`;
  const oc = outcome ? cell(cells, `${k}.outcome`, OUTCOME_TEXT[outcome] ?? outcome, `oc ${outcome}`) : "";
  // A prop line prints only with a verified (or labelled sample) price: SPEC rev. 2 §1, no line is published before §7.
  const line = l.kind === "PLAYER_PROP" && l.lineText ? cell(cells, `${k}.line`, l.lineText, "ln") : "";
  // The leg's verified American odds (SPEC §7), from the engine's PRICE_VERIFIED for this card.
  const odds = price && price.oddsFormat === "american" && american(price.price) ? cell(cells, `${k}.odds`, american(price.price), "od") : "";
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag><i>FLAG</i>${cell(cells, `${k}.flag`, l.flagText.join(" · "))}</div>` : "";
  return `<div class="lg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, who)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${vs} · ${tipText(l.tipUtc)}`)}${line}${odds}${oc}</div></div><div class="pj"><span class="pk">${esc(winner ? WIN_LABEL : MODEL_LABEL)}</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}<span class="pm">${cell(cells, `${k}.market`, winner ? "to win" : l.kind === "PLAYER_PROP" ? `${l.marketLabel} chance` : l.marketLabel)}</span></div>${flag}</div>`;
}

/** Leg-area density: two legs roomy, three or four compact, five or more (Moonshot rev. 2) tighter still. */
const legClass = (n) => (n >= 5 ? " d d5" : n > 2 ? " d" : "");

function ladderHtml(cells, v) {
  const parts = [];
  v.rungs.forEach((r, i) => {
    parts.push(`<div class="seg${i === 0 || v.rungs[i - 1].state === RUNG.COMPLETED ? " on" : ""}"></div>`);
    const mark = r.state === RUNG.COMPLETED ? "✓" : r.state === RUNG.FAILED ? "✕" : String(r.step);
    parts.push(`<div class="rg ${r.state}" data-rung="${r.state}"><div class="dot">${esc(mark)}</div><div class="k">STEP ${r.step}</div><div class="m">${cell(cells, `ladder.m${r.step}`, cents(r.milestoneCents))}</div></div>`);
  });
  parts.push(`<div class="seg${v.view === VIEW.COMPLETE ? " on" : ""}"></div>`);
  return `<div class="bv-lad" data-ladder="${v.steps}">${parts.join("")}</div>`;
}

/** The held day's note from the engine's reason code: no frozen card file is not the same as no card meeting the rules. */
const heldNote = (reason) => (/^NO_FROZEN_CARD_FILE/.test(String(reason ?? "")) ? "No frozen card for today" : /^PENDING_VOID_REVIEW/.test(String(reason ?? "")) ? "A void is under review" : "No card met the rules today");

/** Pace against the illustrative milestone (SPEC rev. 2 §2). */
function paceHtml(cells, v) {
  if (!v.pace) return "";
  if (v.pace.state === "WITHHELD") return `<div class="bv-pace WITHHELD" data-pace="WITHHELD">${cell(cells, "pace", "PACE WITHHELD UNTIL VERIFIED PRICES")}</div>`;
  const below = v.payout?.belowPace ? " · this card prices below pace" : "";
  // Lane-level (PD 2026-11-04): the lane's step and next milestone, never "on pace" beside a card that prices below it.
  const text = (v.pace.state === "ON_PACE" ? `Step ${v.step} · next milestone ${cents(v.pace.nextMilestoneCents)}` : `Behind pace by ${cents(v.pace.shortfallCents)} · milestone ${cents(v.pace.milestoneCents)}`) + below;
  return `<div class="bv-pace ${v.pace.state}" data-pace="${v.pace.state}">${cell(cells, "pace", text.toUpperCase())}</div>`;
}

const bankHtml = (cells, v) => `<div class="bv-bank"><div class="st" data-bank="start"><div class="k">Start</div>${cell(cells, "bank.start", cents(v.baseCents), "v")}</div><div class="tr" data-bank="tracked"><div class="k">Tracked bankroll · settled</div>${cell(cells, "bank.tracked", v.bankrollCents == null ? "WITHHELD" : cents(v.bankrollCents), "v")}</div><div class="gl" data-bank="goal"><div class="k">Goal · hypothetical</div>${cell(cells, "bank.goal", cents(v.targetCents), "v")}</div></div>`;

/** Status days: no wager today (no card) or the stake the busting step lost. */
function statusMoneyHtml(cells, v) {
  const progress = `<div><div class="k">Ladder progress</div>${cell(cells, "money.progress", `${v.cleared} OF ${v.steps}`, "v")}<div class="c">Steps cleared</div></div>`;
  if (v.view === VIEW.BUSTED) return `<div class="bv-money"><div><div class="k">Tracked bankroll</div>${cell(cells, "money.wager", v.bankrollCents == null ? "WITHHELD" : cents(v.bankrollCents), "v")}<div class="c">${v.bankrollCents == null ? "Until verified prices" : "Staked on the missed step"}</div></div><div class="bust"><div class="k">Result</div>${cell(cells, "money.result", `STEP ${v.step} MISSED`, "v")}<div class="c">Run ${esc(String(v.runId).replace(/^run-/, ""))} ends here</div></div>${progress}</div>`;
  if (v.view === VIEW.WON) return `<div class="bv-money"><div><div class="k">Tracked bankroll</div>${cell(cells, "money.wager", v.bankrollCents == null ? "WITHHELD" : cents(v.bankrollCents), "v")}<div class="c">Settled result</div></div><div><div class="k">Next card</div>${cell(cells, "money.next", v.step < v.steps ? `STEP ${v.step + 1} OF ${v.steps}` : "NONE", "v")}<div class="c">From the next slate</div></div>${progress}</div>`;
  return `<div class="bv-money"><div><div class="k">Wager</div>${cell(cells, "money.wager", "NONE", "v")}<div class="c">No card today</div></div><div><div class="k">Next card</div>${cell(cells, "money.next", `STEP ${v.step} OF ${v.steps}`, "v")}<div class="c">Same tracked bankroll</div></div>${progress}</div>`;
}

function moneyHtml(cells, v) {
  const progress = `<div><div class="k">Ladder progress</div>${cell(cells, "money.progress", `${v.cleared} OF ${v.steps}`, "v")}<div class="c">Steps cleared</div></div>`;
  // All-in ladder (SPEC §2 STAKE_SET): the tracked stake is the tracked bankroll; an unpriced card is never staked.
  const wager = `<div><div class="k">Wager</div>${cell(cells, "money.wager", v.bankrollCents == null ? "WITHHELD" : cents(v.bankrollCents), "v")}<div class="c">${cell(cells, "money.wagerState", v.staked ? "Tracked stake" : v.stakePending ? "Stake once verified" : "Not staked until priced")}</div></div>`;
  if (!v.payout) return `<div class="bv-money">${wager}<div class="pend aw" data-money="awaiting"><div class="k">Potential payout · profit</div>${cell(cells, "money.payout", AWAITING, "v")}</div>${progress}</div>`;
  const fx = v.payout.fixture ? '<span class="fx">SAMPLE</span>' : "";
  // Combined price: one book's leg product, or (same game) an estimate that is never a book's offer (SPEC §7).
  return `<div class="bv-money pr">${wager}<div class="pend" data-money="payout">${fx}<div class="k">Potential payout</div>${cell(cells, "money.payout", cents(v.payout.grossCents), "v")}<div class="c">Pending</div></div><div class="pend" data-money="profit">${fx}<div class="k">Potential profit</div>${cell(cells, "money.profit", cents(v.payout.profitCents), "v")}<div class="c">Pending</div></div>${progress}</div>`;
}

/**
 * One card for one lane on one day. `view` from laneView; `combo` the resolved legs (resolveCombo) for CARD and BUSTED.
 * `testData` puts the TEST ribbon on a card whose lane history is a fixture.
 */
export function bbmCard(view, combo = null, { testData = false } = {}) {
  const P = PRODUCT[view.product];
  if (!P) throw new Error(`no V2 design for ${view.product}`);
  if (!Object.values(BADGE).includes(view.badge)) throw new Error(`${view.laneId}: status badge ${view.badge} is not in the public vocabulary`);
  const cells = {};
  const ms = view.product === "moonshot";
  const lane = `LANE ${view.letter}`;
  let hero; let sub; let middle; let moneyBlock = "";
  if (view.view === VIEW.CARD) {
    if (!combo) throw new Error(`${view.laneId}: a CARD view needs its resolved legs`);
    hero = `<div class="bv-hero">STEP <b>${cell(cells, "step", String(view.step))}</b> OF ${cell(cells, "steps", String(view.steps))}</div>`;
    sub = `${cell(cells, "legs", `${combo.legs.length} legs`)} · ${esc(MODEL_LABEL)}${ms ? ` · ${cell(cells, "risk", "Longshot")}` : ""}`;
    middle = `<div class="bv-legs${legClass(combo.legs.length)}">${combo.legs.map((l, i) => legHtml(cells, l, i, null, view.payout?.legs?.[l.legId] ?? null)).join("")}</div>`;
    if (view.payout) {
      // Combined price: one book's leg product, or (same game) an estimate that is never a book's offer (SPEC §7).
      const am = american(view.payout.combinedAmerican);
      const combined = am ? `${view.payout.estimate ? "Estimate" : "Combined"} ${am}${view.payout.estimate ? "" : " · leg product"}` : null;
      const books = (view.payout.books ?? []).map((b) => String(b).replace(/\s*[—–]\s*/g, " · ")).join(" · ");
      const src = books ? `Odds ${books}${view.payout.capturedAt ? ` · captured ${ET_CLOCK.format(new Date(Date.parse(view.payout.capturedAt)))} ET` : ""}` : null;
      if (combined || src) middle += `<div class="bv-src">${combined ? cell(cells, "price.combined", combined, `cp${view.payout.estimate ? " est" : ""}`) : ""}${src ? cell(cells, "price.source", src, "sr") : ""}</div>`;
      if (view.payout.preliminary) middle += `<div class="bv-pre">${cell(cells, "price.preliminary", PRELIMINARY_TAG.toUpperCase())}</div>`;
    }
    moneyBlock = moneyHtml(cells, view);
  } else if (view.view === VIEW.BUSTED) {
    hero = `<div class="bv-hero s bust">${cell(cells, "status", `BUSTED AT STEP ${view.step} OF ${view.steps}`)}</div>`;
    sub = `${esc(lane)} · RUN ${esc(String(view.runId).replace(/^run-/, ""))}`;
    const outs = Object.fromEntries((view.legResults ?? []).map((r) => [r.legId, r.outcome]));
    moneyBlock = statusMoneyHtml(cells, view);
    middle = combo ? `<div class="bv-legs${legClass(combo.legs.length)}">${combo.legs.map((l, i) => legHtml(cells, l, i, outs[l.legId] ?? "PENDING")).join("")}</div>` : `<div class="bv-stat"><div class="k">${cell(cells, "status.note", "Lane busted")}</div></div>`;
  } else if (view.view === VIEW.WON) {
    hero = `<div class="bv-hero s">${cell(cells, "status", `STEP ${view.step} OF ${view.steps} WON`)}</div>`;
    sub = cell(cells, "status.step", view.step < view.steps ? `STEP ${view.step + 1} IS NEXT` : "LADDER COMPLETE");
    const outs = Object.fromEntries((view.legResults ?? []).map((r) => [r.legId, r.outcome]));
    middle = `<div class="bv-legs${legClass(combo.legs.length)}">${combo.legs.map((l, i) => legHtml(cells, l, i, outs[l.legId] ?? "PENDING")).join("")}</div>`;
    moneyBlock = statusMoneyHtml(cells, view);
  } else if (view.view === VIEW.NO_ELIGIBLE_CARD) {
    hero = `<div class="bv-hero s">${cell(cells, "status", "NO QUALIFYING CARD TODAY")}</div>`;
    sub = cell(cells, "status.step", `STILL STEP ${view.step} OF ${view.steps}`);
    middle = `<div class="bv-stat"><div class="k">${cell(cells, "status.note", heldNote(view.reason))}</div><div class="c">${cell(cells, "status.rule", "The lane keeps its step and its tracked bankroll.")}</div></div>`;
    moneyBlock = statusMoneyHtml(cells, view);
  } else if (view.view === VIEW.COMPLETE || view.view === VIEW.FINISHED_SHORT) {
    const done = view.view === VIEW.COMPLETE;
    hero = `<div class="bv-hero s">${cell(cells, "status", done ? "GOAL REACHED" : "FINISHED SHORT")}</div>`;
    sub = cell(cells, "status.step", `${view.cleared} OF ${view.steps} STEPS WON`);
    middle = `<div class="bv-stat"><div class="k">${cell(cells, "status.note", view.bankrollCents == null ? `Tracked bankroll withheld until verified prices` : `${cents(view.bankrollCents)} of ${cents(view.targetCents)}`)}</div><div class="c">${cell(cells, "status.rule", done ? "Tracked bankroll reached the goal." : "Five steps won below the goal. The founder decides what follows.")}</div></div>`;
  } else throw new Error(`${view.laneId}: no graphic for view ${view.view}`);
  const body = `${CSS}${ms ? '<div class="bv-burst"></div>' : ""}<div class="bv ${P.cls}${(combo?.legs.length ?? 0) >= 5 ? " n5" : ""}" style="--acc:${P.acc};--acc2:${P.acc2}">
<div class="bv-top"><span class="p">${esc(P.name)}</span><span class="l">${esc(lane)}</span>${cell(cells, "badge", view.badge, `bd ${String(view.badge).split(" ")[0]}`)}</div>
${hero}<div class="bv-sub">${sub}</div>
${ladderHtml(cells, view)}${bankHtml(cells, view)}${paceHtml(cells, view)}${middle}${moneyBlock}</div>`;
  let html = shell({ away: P.a, home: P.b, chip: chipText(view.date), body, review: false, disclosure: FOOTER }).replace(/<div class="rg">[^<]*<\/div>/g, "");
  // One ribbon, clear of the logo: a TEST history with a sample price says both.
  const rib = [testData ? TEST_RIBBON : null, view.payout?.fixture ? SAMPLE_PRICE_RIBBON : null].filter(Boolean);
  const ribbons = rib.length ? `<div class="bv-rib ${testData ? "t" : "p"}">${esc(rib.join(" · "))}</div>` : "";
  if (ribbons) html = html.replace('<div class="frame"></div>', `${ribbons}<div class="frame"></div>`);
  return { html, cells, laneId: view.laneId, view: view.view, badge: view.badge, preliminary: view.payout?.preliminary === true, testData, samplePrice: view.payout?.fixture === true, priced: view.payout != null, disclosure: FOOTER };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")]));
/** Odds, prices, lines and bet language never print. "AWAITING VERIFIED PRICES" and the SAMPLE PRICE ribbon are the only price words. */
const PRICE_TEXT = /[+−-]\d{3}\b|\bodds\b|\bparlay\b|\bline\b|\bspread\b|\bmoneyline\b|\bprice\b|\bover\b|\bunder\b|\d(\.\d+)?x\b|×/i;
const HYPE = /\b(lock|locks|guarantee|guaranteed|sure thing|can't lose|cannot lose|free money|hammer|smash|will hit|will win|best bet|edge)\b/i;
/** [] when a V2 card is clean. */
export function verifyBbmCard(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " "));
  for (const r of REMOVED_TEXT) if (text.toLowerCase().includes(r.toLowerCase())) e.push(`removed text on image: ${r}`);
  if (!text.includes(FACT_LINE)) e.push("the tracked-challenge line is missing");
  if (!text.includes(RG_LINE)) e.push("the 21+ responsible-gambling line is missing");
  if (card.view === VIEW.CARD && !text.includes(MODEL_LABEL)) e.push("MODEL PROJECTION label missing");
  if (!card.badge || got.badge !== card.badge) e.push("status badge missing");
  // Price cells (SPEC §7, socialFeedPrices ON for BBM V2): leg odds, prop lines, the combined price and the odds source.
  const PRICE_CELL = /\.(odds|line)$|^price\./;
  const priceCells = Object.entries(got).filter(([k]) => PRICE_CELL.test(k));
  if (priceCells.length && !card.priced) e.push("price text prints without a verified price");
  let shown = text;
  for (const [, val] of priceCells) shown = shown.split(val).join(" ");
  let t = shown.replace(AWAITING, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (Object.keys(got).some((k) => /\.line$/.test(k)) && !card.priced) e.push("a prop line prints without a verified price");
  if (card.priced) for (const [k, v] of Object.entries(got)) if (/\.line$/.test(k)) t = t.replace(v, " ");
  if (PRICE_TEXT.test(t)) e.push(`price, line or odds text on image: ${t.match(PRICE_TEXT)[0]}`);
  if (HYPE.test(t)) e.push(`hype word on image: ${t.match(HYPE)[0]}`);
  if (/\bElo\b|[0-9a-f]{16,}/i.test(text)) e.push("internal text on image");
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(shown), ...statLabelProblems(shown));
  const payoutShown = "money.profit" in got;
  if (payoutShown && !card.priced) e.push("a payout prints without a verified PAYOUT_COMPUTED");
  if (card.priced && !payoutShown) e.push("a verified payout is not shown");
  if (card.view === VIEW.CARD && !card.priced && got["money.payout"] !== AWAITING) e.push(`an unpriced card must say ${AWAITING}`);
  if (card.samplePrice && !text.includes(SAMPLE_PRICE_RIBBON)) e.push("fixture price without its SAMPLE PRICE ribbon");
  if (card.preliminary !== text.includes(PRELIMINARY_TAG.toUpperCase())) e.push(card.preliminary ? "a preliminary price without its tag" : "a preliminary tag on a verified price");
  if (!card.samplePrice && text.includes(SAMPLE_PRICE_RIBBON)) e.push("SAMPLE PRICE ribbon without a fixture price");
  if (card.testData !== text.includes(TEST_RIBBON)) e.push(card.testData ? "test fixture without its TEST ribbon" : "TEST ribbon on real data");
  return e;
}

/** Stacked blocks, top to bottom; each must start below the one before it. */
const STACK = ".bv-top,.bv-hero,.bv-sub,.bv-lad,.bv-bank,.bv-pace,.lg,.bv-src,.bv-pre,.bv-stat,.bv-money,.social,.disclosure";
/** Layout problems of each card in a real browser (`browser`: a Playwright browser). */
export async function bbmLayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate((sel) => {
      const boxes = [...document.querySelectorAll(sel)].map((e) => ({ cls: e.className, r: e.getBoundingClientRect() }));
      const overlaps = [];
      for (let i = 1; i < boxes.length; i += 1) if (boxes[i].r.top < boxes[i - 1].r.bottom - 1) overlaps.push(`${boxes[i - 1].cls} / ${boxes[i].cls}`);
      const area = document.querySelector(".bv-legs")?.getBoundingClientRect();
      const outside = area ? [...document.querySelectorAll(".lg")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < area.top - 1 || r.bottom > area.bottom + 1; }).length : 0;
      const clipped = [...document.querySelectorAll(".bv-money .v,.bv-money .c,.bv-bank .v,.bv-hero,.bv-sub,.lg .pv,.lg .mt,.bv-lad .a,.bv-src,.bv-pace")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > 1080 - 40).map((e) => e.textContent);
      const flags = [...document.querySelectorAll("[data-flag] span")].filter((e) => e.scrollWidth > e.clientWidth + 1 || parseFloat(getComputedStyle(e).fontSize) < 20).map((e) => e.textContent);
      return { overlaps, outside, clipped, flags, last: boxes.at(-1).r.bottom, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    }, STACK);
    const name = c.name ?? c.laneId;
    if (m.overlaps.length) errs.push(`${name}: blocks overlap: ${m.overlaps.join(", ")}`);
    if (m.outside) errs.push(`${name}: ${m.outside} leg(s) spill out of the leg area`);
    if (m.clipped.length) errs.push(`${name}: text clipped: ${m.clipped.join(" | ")}`);
    if (m.flags.length) errs.push(`${name}: flag text does not fit legibly: ${m.flags.join(" | ")}`);
    if (m.last > 1350 - 8) errs.push(`${name}: footer at ${Math.round(m.last)}px`);
    if (m.fit.length || m.page) errs.push(`${name}: does not fit: ${m.fit.join(" | ")}`);
  }
  await page.close();
  return errs;
}
