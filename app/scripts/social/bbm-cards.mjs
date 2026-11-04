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
import { RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export const BBM_DESIGN_VERSION = "bbm-v2";
export const FACT_LINE = "Tracked challenge · no real wager placed";
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
.content .disclosure{font:700 26px/1.2 var(--display);letter-spacing:2px;color:rgba(247,247,242,.78);text-transform:uppercase}
.bv-rib{position:absolute;top:14px;left:0;right:0;z-index:9;text-align:center;font:900 26px/40px var(--headline);letter-spacing:.12em;color:#fff}
.bv-rib.t{background:#FF3B6B}.bv-rib.p{background:#E8B100;color:#050706}.bv-rib.t+.bv-rib.p{top:54px}
.bv{display:flex;flex-direction:column;flex:1;min-height:0}
.bv-top{margin-top:8px;display:flex;justify-content:center;align-items:center;gap:16px;font:900 34px/1 var(--headline);letter-spacing:6px;text-transform:uppercase}
.bv-top .p{color:var(--acc);text-shadow:0 0 22px color-mix(in srgb,var(--acc) 55%,transparent)}
.bv-top .l{padding:7px 14px 4px;border-radius:8px;background:var(--acc);color:#050706;letter-spacing:3px}
.bv-top .r{font:800 22px/1 var(--display);letter-spacing:3px;padding:7px 12px 4px;border-radius:999px;border:2px solid var(--acc2);color:#E4CCFF;background:rgba(5,8,6,.78)}
.bv-hero{margin-top:6px;text-align:center;font:900 108px/.9 var(--headline);letter-spacing:-1px;text-transform:uppercase;color:#F7F7F2;white-space:nowrap;overflow:hidden;text-shadow:0 6px 30px rgba(0,0,0,.6)}
.bv-hero b{color:var(--acc);font-weight:900}
.bv.ms .bv-hero{background:linear-gradient(180deg,#FFE3B0,#FF7A2E 55%,#E0480F);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 26px rgba(255,122,46,.5))}
.bv.ms .bv-hero b{color:inherit}
.bv-hero.s{font-size:84px;padding:0 10px}.bv-hero.bust{background:none;color:#FF4D5E;filter:drop-shadow(0 0 22px rgba(255,77,94,.45));-webkit-background-clip:initial;background-clip:initial}
.bv-sub{margin-top:6px;text-align:center;font:800 26px/1 var(--display);letter-spacing:5px;color:rgba(247,247,242,.85);text-transform:uppercase;white-space:nowrap}
.bv-lad{margin-top:16px;display:flex;align-items:flex-start;padding:0 40px}
.bv-lad .seg{flex:1;height:8px;margin-top:26px;border-radius:4px;background:rgba(255,255,255,.14)}
.bv-lad .seg.on{background:var(--acc)}
.bv-lad .seg:first-child,.bv-lad .seg:last-child{flex:.45}
.bv-lad .rg{flex:none;width:96px;text-align:center}
.bv-lad .dot{margin:0 auto;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 30px/1 var(--headline);border:4px solid rgba(255,255,255,.28);color:rgba(247,247,242,.55);background:rgba(5,8,6,.7)}
.bv-lad .rg.completed .dot{background:var(--acc);border-color:var(--acc);color:#050706}
.bv-lad .rg.active .dot{border-color:var(--acc);color:#F7F7F2;background:color-mix(in srgb,var(--acc) 22%,rgba(5,8,6,.85));box-shadow:0 0 0 6px color-mix(in srgb,var(--acc) 30%,transparent),0 0 30px var(--acc)}
.bv-lad .rg.failed .dot{background:#FF4D5E;border-color:#FF4D5E;color:#050706}
.bv-lad .rg .k{margin-top:7px;font:800 17px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.7);white-space:nowrap}
.bv-lad .rg.active .k{color:var(--acc)}.bv-lad .rg.failed .k{color:#FF4D5E}
.bv-lad .rg .a{margin-top:3px;font:800 19px/1 var(--display);color:var(--acc);white-space:nowrap}
.bv-bank{margin-top:14px;display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:12px}
.bv-bank>div{border-radius:14px;padding:9px 10px 8px;text-align:center}
.bv-bank .k{font:800 16px/1 var(--display);letter-spacing:2px;text-transform:uppercase;white-space:nowrap}
.bv-bank .v{display:block;margin-top:4px;font:900 44px/1 var(--display);white-space:nowrap}
.bv-bank .st{background:rgba(5,8,6,.6);border:1px solid rgba(255,255,255,.14);color:rgba(247,247,242,.72)}
.bv-bank .tr{background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 92%,#fff),var(--acc));color:#050706;box-shadow:0 0 34px color-mix(in srgb,var(--acc) 45%,transparent)}
.bv-bank .tr .v{font-size:50px}
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
.bv-legs.d{gap:8px}.bv-legs.d .lg{padding:7px 18px;gap:4px 12px}.bv-legs.d .nm{font-size:38px}.bv-legs.d .n{font-size:38px}.bv-legs.d .pv{font-size:44px;margin-top:1px}.bv-legs.d .mt{font-size:19px;margin-top:3px}.bv-legs.d .tg{font-size:19px}.bv-legs.d .pk{font-size:14px}.bv-legs.d .pm{font-size:16px;margin-top:0}.bv-legs.d .fl{font-size:21px}
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

function legHtml(cells, l, i, outcome) {
  const t = teamOf(l.team.abbr, l.team.name);
  const k = `leg${i + 1}`;
  const winner = l.kind === "GAME_WINNER";
  const who = winner ? t.name : l.player.name;
  const vs = `${l.home ? "vs" : "@"} ${l.opponent.abbr}`;
  const oc = outcome ? cell(cells, `${k}.outcome`, OUTCOME_TEXT[outcome] ?? outcome, `oc ${outcome}`) : "";
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag><i>FLAG</i>${cell(cells, `${k}.flag`, l.flagText.join(" · "))}</div>` : "";
  return `<div class="lg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, who)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${vs} · ${tipText(l.tipUtc)}`)}${oc}</div></div><div class="pj"><span class="pk">${esc(winner ? WIN_LABEL : MODEL_LABEL)}</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}<span class="pm">${cell(cells, `${k}.market`, winner ? "to win" : l.marketLabel)}</span></div>${flag}</div>`;
}

function ladderHtml(cells, v) {
  const parts = [];
  v.rungs.forEach((r, i) => {
    parts.push(`<div class="seg${i === 0 || v.rungs[i - 1].state === RUNG.COMPLETED ? " on" : ""}"></div>`);
    const mark = r.state === RUNG.COMPLETED ? "✓" : r.state === RUNG.FAILED ? "✕" : String(r.step);
    parts.push(`<div class="rg ${r.state}" data-rung="${r.state}"><div class="dot">${esc(mark)}</div><div class="k">STEP ${r.step}</div></div>`);
  });
  parts.push(`<div class="seg${v.view === VIEW.COMPLETE ? " on" : ""}"></div>`);
  return `<div class="bv-lad" data-ladder="${v.steps}">${parts.join("")}</div>`;
}

const bankHtml = (cells, v) => `<div class="bv-bank"><div class="st" data-bank="start"><div class="k">Start</div>${cell(cells, "bank.start", cents(v.baseCents), "v")}</div><div class="tr" data-bank="tracked"><div class="k">Tracked bankroll · settled</div>${cell(cells, "bank.tracked", cents(v.bankrollCents), "v")}</div><div class="gl" data-bank="goal"><div class="k">Goal · hypothetical</div>${cell(cells, "bank.goal", cents(v.targetCents), "v")}</div></div>`;

/** Status days: no wager today (no card) or the stake the busting step lost. */
function statusMoneyHtml(cells, v) {
  const progress = `<div><div class="k">Ladder progress</div>${cell(cells, "money.progress", `${v.cleared} OF ${v.steps}`, "v")}<div class="c">Steps cleared</div></div>`;
  if (v.view === VIEW.BUSTED) return `<div class="bv-money"><div><div class="k">Tracked bankroll</div>${cell(cells, "money.wager", cents(0), "v")}<div class="c">After the missed step</div></div><div class="bust"><div class="k">Result</div>${cell(cells, "money.result", `STEP ${v.step} MISSED`, "v")}<div class="c">Run ${esc(String(v.runId).replace(/^run-/, ""))} ends here</div></div>${progress}</div>`;
  return `<div class="bv-money"><div><div class="k">Wager</div>${cell(cells, "money.wager", "NONE", "v")}<div class="c">No card today</div></div><div><div class="k">Next card</div>${cell(cells, "money.next", `STEP ${v.step} OF ${v.steps}`, "v")}<div class="c">Same tracked bankroll</div></div>${progress}</div>`;
}

function moneyHtml(cells, v) {
  const progress = `<div><div class="k">Ladder progress</div>${cell(cells, "money.progress", `${v.cleared} OF ${v.steps}`, "v")}<div class="c">Steps cleared</div></div>`;
  // All-in ladder (SPEC §2 STAKE_SET): the tracked stake is the tracked bankroll; an unpriced card is never staked.
  const wager = `<div><div class="k">Wager</div>${cell(cells, "money.wager", cents(v.bankrollCents), "v")}<div class="c">${cell(cells, "money.wagerState", v.staked ? "Tracked stake" : "Not staked until priced")}</div></div>`;
  if (!v.payout) return `<div class="bv-money">${wager}<div class="pend aw" data-money="awaiting"><div class="k">Potential payout · profit</div>${cell(cells, "money.payout", AWAITING, "v")}</div>${progress}</div>`;
  const fx = v.payout.fixture ? '<span class="fx">SAMPLE</span>' : "";
  return `<div class="bv-money pr">${wager}<div class="pend" data-money="payout">${fx}<div class="k">Potential payout</div>${cell(cells, "money.payout", cents(v.payout.grossCents), "v")}<div class="c">Pending</div></div><div class="pend" data-money="profit">${fx}<div class="k">Potential profit</div>${cell(cells, "money.profit", cents(v.payout.profitCents), "v")}<div class="c">Pending</div></div>${progress}</div>`;
}

/**
 * One card for one lane on one day. `view` from laneView; `combo` the resolved legs (resolveCombo) for CARD and BUSTED.
 * `testData` puts the TEST ribbon on a card whose lane history is a fixture.
 */
export function bbmCard(view, combo = null, { testData = false } = {}) {
  const P = PRODUCT[view.product];
  if (!P) throw new Error(`no V2 design for ${view.product}`);
  const cells = {};
  const ms = view.product === "moonshot";
  const lane = `LANE ${view.letter}`;
  let hero; let sub; let middle; let moneyBlock = "";
  if (view.view === VIEW.CARD) {
    if (!combo) throw new Error(`${view.laneId}: a CARD view needs its resolved legs`);
    hero = `<div class="bv-hero">STEP <b>${cell(cells, "step", String(view.step))}</b> OF ${cell(cells, "steps", String(view.steps))}</div>`;
    sub = `${cell(cells, "legs", `${combo.legs.length} legs`)} · ${esc(MODEL_LABEL)}`;
    middle = `<div class="bv-legs${combo.legs.length > 2 ? " d" : ""}">${combo.legs.map((l, i) => legHtml(cells, l, i, null)).join("")}</div>`;
    moneyBlock = moneyHtml(cells, view);
  } else if (view.view === VIEW.BUSTED) {
    hero = `<div class="bv-hero s bust">${cell(cells, "status", `BUSTED AT STEP ${view.step} OF ${view.steps}`)}</div>`;
    sub = `${esc(lane)} · RUN ${esc(String(view.runId).replace(/^run-/, ""))}`;
    const outs = Object.fromEntries((view.legResults ?? []).map((r) => [r.legId, r.outcome]));
    moneyBlock = statusMoneyHtml(cells, view);
    middle = combo ? `<div class="bv-legs${combo.legs.length > 2 ? " d" : ""}">${combo.legs.map((l, i) => legHtml(cells, l, i, outs[l.legId] ?? "PENDING")).join("")}</div>` : `<div class="bv-stat"><div class="k">${cell(cells, "status.note", "Lane busted")}</div></div>`;
  } else if (view.view === VIEW.NO_ELIGIBLE_CARD) {
    hero = `<div class="bv-hero s">${cell(cells, "status", "NO QUALIFYING CARD TODAY")}</div>`;
    sub = cell(cells, "status.step", `STILL STEP ${view.step} OF ${view.steps}`);
    middle = `<div class="bv-stat"><div class="k">${cell(cells, "status.note", "No card met the rules today")}</div><div class="c">${cell(cells, "status.rule", "The lane keeps its step and its tracked bankroll.")}</div></div>`;
    moneyBlock = statusMoneyHtml(cells, view);
  } else if (view.view === VIEW.COMPLETE) {
    hero = `<div class="bv-hero s">${cell(cells, "status", "GOAL REACHED")}</div>`;
    sub = cell(cells, "status.step", `${view.steps} OF ${view.steps} CLEARED`);
    middle = `<div class="bv-stat"><div class="k">${cell(cells, "status.note", `Goal reached`)}</div></div>`;
  } else throw new Error(`${view.laneId}: no graphic for view ${view.view}`);
  const body = `${CSS}${ms ? '<div class="bv-burst"></div>' : ""}<div class="bv ${P.cls}" style="--acc:${P.acc};--acc2:${P.acc2}">
<div class="bv-top"><span class="p">${esc(P.name)}</span><span class="l">${esc(lane)}</span>${ms ? `<span class="r">${cell(cells, "risk", "Longshot · higher risk")}</span>` : ""}</div>
${hero}<div class="bv-sub">${sub}</div>
${ladderHtml(cells, view)}${bankHtml(cells, view)}${middle}${moneyBlock}</div>`;
  let html = shell({ away: P.a, home: P.b, chip: chipText(view.date), body, review: false, disclosure: FACT_LINE }).replace(/<div class="rg">[^<]*<\/div>/g, "");
  const ribbons = `${testData ? `<div class="bv-rib t">${esc(TEST_RIBBON)}</div>` : ""}${view.payout?.fixture ? `<div class="bv-rib p">${esc(SAMPLE_PRICE_RIBBON)}</div>` : ""}`;
  if (ribbons) html = html.replace('<div class="frame"></div>', `${ribbons}<div class="frame"></div>`);
  return { html, cells, laneId: view.laneId, view: view.view, testData, samplePrice: view.payout?.fixture === true, priced: view.payout != null, disclosure: FACT_LINE };
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
  if (card.view === VIEW.CARD && !text.includes(MODEL_LABEL)) e.push("MODEL PROJECTION label missing");
  const t = text.replace(AWAITING, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (PRICE_TEXT.test(t)) e.push(`price, line or odds text on image: ${t.match(PRICE_TEXT)[0]}`);
  if (HYPE.test(t)) e.push(`hype word on image: ${t.match(HYPE)[0]}`);
  if (/\bElo\b|[0-9a-f]{16,}/i.test(text)) e.push("internal text on image");
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(text), ...statLabelProblems(text));
  const payoutShown = "money.profit" in got;
  if (payoutShown && !card.priced) e.push("a payout prints without a verified PAYOUT_COMPUTED");
  if (card.priced && !payoutShown) e.push("a verified payout is not shown");
  if (card.view === VIEW.CARD && !card.priced && got["money.payout"] !== AWAITING) e.push(`an unpriced card must say ${AWAITING}`);
  if (card.samplePrice && !text.includes(SAMPLE_PRICE_RIBBON)) e.push("fixture price without its SAMPLE PRICE ribbon");
  if (!card.samplePrice && text.includes(SAMPLE_PRICE_RIBBON)) e.push("SAMPLE PRICE ribbon without a fixture price");
  if (card.testData !== text.includes(TEST_RIBBON)) e.push(card.testData ? "test fixture without its TEST ribbon" : "TEST ribbon on real data");
  return e;
}

/** Stacked blocks, top to bottom; each must start below the one before it. */
const STACK = ".bv-top,.bv-hero,.bv-sub,.bv-lad,.bv-bank,.lg,.bv-stat,.bv-money,.social,.disclosure";
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
      const clipped = [...document.querySelectorAll(".bv-money .v,.bv-bank .v,.bv-hero,.bv-sub,.lg .pv,.lg .mt,.bv-lad .a")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > 1080 - 40).map((e) => e.textContent);
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
