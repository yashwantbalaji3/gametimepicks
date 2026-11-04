/* global document, window, getComputedStyle -- bbmV4LayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER & MOONSHOT GRAPHICS V4 TEMPLATES (founder rules v2 + design references, 2026-11-04). Original
 * GameTimePicks art, 1080x1350:
 *   Bank Builder  a neon battery (green/gold): 5 cells, step 1 at the bottom, step 5 (goal) at the top
 *   Moonshot      a neon rocket (purple/orange): body in 5 segments, step 5 at the nose, a glowing engine below
 * Legs: at most 2 slots (rules v2). Kept from V3: no background lettering, badge, pace line, odds-source line or
 * tracked-challenge footer; logo · date · title · goal · lane and step once · meter left, legs right · stake / combined
 * odds (leg product) / payout / profit; 21+ small.
 *
 * Two modes, one card:
 *   template   placeholder slots ("Leg 1 · Awaiting qualified selection"), odds and probability "Pending / not yet
 *              qualified", the payout shown as the step TARGET (never a computed payout). A template always carries the
 *              TEMPLATE ribbon, never a VERIFIED tag, and is refused by every package path.
 *   real       values only from the engine record (lane view, resolved legs, verified price), as V2/V3.
 * The renderer holds no selection logic: which legs, how many, and every price come from the engine.
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, sourceTextProblems, statLabelProblems, teamOf } from "./game-day-cards.mjs";
import { visibleText } from "./nba-line-cards.mjs";
import { american, cents, chipText, tipText, AWAITING, TEST_RIBBON, SAMPLE_PRICE_RIBBON } from "./bbm-cards.mjs";
import { BADGE, RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export const BBM_V4_DESIGN_VERSION = "bbm-v4";
export const V4_FOOTER = "21+ · Gamble responsibly";
export const TEMPLATE_RIBBON = "Template preview · not a pick · do not post";
/** Founder rules v2 (2026-11-04): milestones after each step, and at most two legs per step. */
export const RULES_V2 = Object.freeze({
  maxLegs: 2,
  milestonesCents: Object.freeze({ "bank-builder": Object.freeze([20000, 50000, 125000, 312500, 1000000]), moonshot: Object.freeze([5000, 10000, 20000, 40000, 100000]) }),
});
export const PLACEHOLDER = Object.freeze({ leg1: "Leg 1 · Awaiting qualified selection", leg2: "Leg 2 · Optional · awaiting selection", pending: "Pending / not yet qualified" });
const PRODUCT = Object.freeze({
  "bank-builder": { name: "Bank Builder", cls: "bb", acc: "#F2C14E", neon: "#39FF88", a: "#0B3A22", b: "#3A2E08", goal: "$100 → $10,000" },
  moonshot: { name: "Moonshot", cls: "ms", acc: "#FF8A2E", neon: "#C77DFF", a: "#3E1068", b: "#6B240C", goal: "$25 → $1,000" },
});
const STATUS_WORD = Object.freeze({ [BADGE.WON]: "Won", [BADGE.LOST]: "Lost", [BADGE.HELD]: "Held", [BADGE.COMPLETED]: "Completed", [BADGE.FINISHED_SHORT]: "Finished short" });
/** The V4 checker refuses any of these (V3 removals, plus anything a template must never say). */
export const V4_REMOVED = Object.freeze([/NO REAL WAGER/i, /\bCAPTURED\b/i, /NEXT MILESTONE/i, /BELOW PACE|ON PACE|BEHIND PACE/i, /FOUNDER REVIEW ONLY/i, /NOT A SPORTSBOOK OFFER/i, /must land/i, /betting advice/i, /\bACTIVE\b/]);

const CSS = `<style>
.ghost,.seam,.field{display:none!important}
.beams{opacity:.5}.flare{opacity:.7}
.half.l{background:radial-gradient(110% 70% at 18% 0%,color-mix(in srgb,var(--pa) 90%,#000) 0%,#040605 72%)!important}
.half.r{background:radial-gradient(110% 70% at 82% 0%,color-mix(in srgb,var(--pb) 90%,#000) 0%,#040605 72%)!important}
.content .disclosure{font:700 19px/1.2 var(--display);letter-spacing:3px;color:rgba(247,247,242,.6);text-transform:uppercase}
.v4{display:flex;flex-direction:column;flex:1;min-height:0}
.v4-title{margin-top:2px;text-align:center;font:900 96px/.95 var(--headline);text-transform:uppercase;white-space:nowrap;background:linear-gradient(180deg,#FFF3C4,var(--acc) 55%,color-mix(in srgb,var(--acc) 70%,#8a4b00));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 22px color-mix(in srgb,var(--acc) 50%,transparent)) drop-shadow(0 4px 10px rgba(0,0,0,.8))}
.v4-goal{margin-top:6px;text-align:center;font:900 40px/1 var(--display);letter-spacing:1px;color:#F7F7F2;text-transform:uppercase;white-space:nowrap}
.v4-lane{margin:12px auto 0;display:flex;align-items:center;border-radius:999px;border:2px solid color-mix(in srgb,var(--neon) 70%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--neon) 40%,transparent);overflow:hidden;font:900 26px/1 var(--display);letter-spacing:3px;text-transform:uppercase;white-space:nowrap}
.v4-lane b{padding:9px 18px 7px;background:linear-gradient(180deg,#FFE27A,var(--acc));color:#050706;font-weight:900}
.v4-lane span{padding:9px 18px 7px;color:#F7F7F2}
.v4-lane .st{color:#050706;padding:9px 16px 7px}.v4-lane .st.LOST{background:#FF4D5E}.v4-lane .st.HELD{background:#FFB23F}.v4-lane .st.WON,.v4-lane .st.COMPLETED{background:var(--neon)}.v4-lane .st.FINISHED{background:#C9D1D9}
.v4-mid{flex:1;min-height:0;margin-top:20px;display:grid;grid-template-columns:270px 1fr;gap:24px}
/* battery */
.bat4{position:relative;margin-top:26px;display:flex;flex-direction:column;padding:16px 14px;border-radius:30px;border:4px solid var(--neon);background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(5,8,6,.9) 30%,rgba(5,8,6,.92) 70%,rgba(255,255,255,.06));box-shadow:0 0 26px color-mix(in srgb,var(--neon) 60%,transparent),inset 0 0 26px color-mix(in srgb,var(--neon) 18%,transparent)}
.bat4:before{content:"";position:absolute;top:-30px;left:50%;width:110px;height:24px;margin-left:-55px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,#f2f2f2,#8b8f94 60%,#4a4e52);box-shadow:0 0 12px rgba(255,255,255,.25)}
.bat4 .segs{flex:1;display:flex;flex-direction:column-reverse;gap:9px}
/* rocket */
.rk{position:relative;height:100%;min-height:560px}
.rk svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rk .segs{position:absolute;left:58px;right:58px;top:96px;bottom:150px;display:flex;flex-direction:column-reverse;gap:6px}
.rk .sg{border-radius:10px}.rk .sg .k{font-size:14px}.rk .sg .m{font-size:27px;margin-top:2px}.rk .sg .t{display:none}
/* shared segments */
.sg{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:14px;border:2px solid rgba(247,247,242,.14);background:rgba(247,247,242,.04);color:rgba(247,247,242,.42);text-align:center;min-height:0}
.sg .k{font:800 17px/1 var(--display);letter-spacing:2px;text-transform:uppercase}
.sg .m{margin-top:3px;font:900 32px/1 var(--display);white-space:nowrap}
.sg .t{margin-top:2px;font:700 13px/1 var(--display);letter-spacing:2px;text-transform:uppercase;opacity:.8}
.sg.completed{background:linear-gradient(180deg,color-mix(in srgb,var(--neon) 85%,#fff),var(--neon));border-color:var(--neon);color:#050706}
.sg.active{border:3px solid var(--acc);background:radial-gradient(120% 120% at 50% 50%,color-mix(in srgb,var(--acc) 40%,#1a1203),rgba(5,8,6,.9));color:#FFF6D8;box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 25%,transparent),0 0 30px color-mix(in srgb,var(--acc) 70%,transparent)}
.sg.active .m{color:var(--acc)}
.sg.failed{background:rgba(255,77,94,.22);border-color:#FF4D5E;color:#FF6B7A}
/* legs */
.legs4{display:flex;flex-direction:column;justify-content:center;gap:20px;min-width:0}
.lg4{display:grid;grid-template-columns:62px 1fr auto;align-items:center;gap:8px 18px;padding:26px 24px;border-radius:22px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 34%,rgba(5,8,6,.94)),rgba(5,8,6,.92) 62%);border:2px solid color-mix(in srgb,var(--c) 55%,rgba(255,255,255,.18));box-shadow:0 0 22px color-mix(in srgb,var(--c) 25%,transparent);min-width:0}
.lg4 .n{grid-row:1 / 3;font:900 64px/1 var(--headline);color:var(--acc);text-align:center}
.lg4 .nm{font:900 50px/1.02 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;color:#F7F7F2;min-width:0}
.lg4 .mt{grid-column:2;display:flex;align-items:center;gap:10px;font:700 24px/1 var(--display);color:rgba(247,247,242,.82);white-space:nowrap;min-width:0}
.lg4 .tg{font:900 22px/1 var(--headline);padding:5px 8px 3px;border-radius:7px;background:var(--c);color:var(--cink)}
.lg4 .od{font:900 24px/1 var(--display);padding:6px 10px 4px;border-radius:8px;background:rgba(247,247,242,.94);color:#050706}
.lg4 .pj{grid-column:3;grid-row:1 / 3;text-align:right;padding-left:14px;border-left:2px solid rgba(247,247,242,.14)}
.lg4 .pk{display:block;font:800 15px/1.15 var(--display);letter-spacing:2px;color:var(--acc);text-transform:uppercase}
.lg4 .pv{display:block;margin-top:4px;font:900 64px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.lg4 .fl{grid-column:2 / 4;font:800 20px/1.2 var(--display);color:#FFD166;white-space:normal;overflow:hidden;max-height:2.5em}
.lg4 .oc{font:900 20px/1 var(--headline);padding:5px 8px 3px;border-radius:6px}.lg4 .oc.WIN{background:var(--neon);color:#050706}.lg4 .oc.LOSS{background:#FF4D5E;color:#050706}.lg4 .oc.PENDING,.lg4 .oc.VOID,.lg4 .oc.PUSH{background:rgba(255,255,255,.2);color:#F7F7F2}
.lg4.ph{border-style:dashed;background:rgba(5,8,6,.78);box-shadow:none;--c:#5a5f66}
.lg4.ph .nm{font-size:30px;line-height:1.1;white-space:normal;color:rgba(247,247,242,.9)}
.lg4.ph .pv{font-size:24px;color:rgba(247,247,242,.6);white-space:normal;max-width:190px}
.lg4.ph .mt{color:rgba(247,247,242,.55)}
.stat4{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center}
.stat4 .k{font:900 56px/1.05 var(--headline);text-transform:uppercase;color:#F7F7F2}
.stat4 .c{font:700 26px/1.3 var(--display);color:rgba(247,247,242,.8)}
.comb4{flex:none;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 18px;border-radius:999px;border:2px solid color-mix(in srgb,var(--neon) 60%,transparent);background:rgba(5,8,6,.82);box-shadow:0 0 18px color-mix(in srgb,var(--neon) 30%,transparent);white-space:nowrap}
.comb4 .k{font:800 20px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.85);text-transform:uppercase}
.comb4 .v{font:900 40px/1 var(--display);color:var(--neon)}
.comb4 .tg{font:900 16px/1 var(--display);letter-spacing:2px;padding:6px 10px 4px;border-radius:999px;border:2px solid currentColor;text-transform:uppercase}
.comb4 .tg.ver{color:var(--neon)}.comb4 .tg.pre,.comb4 .tg.tpl{color:#FFB23F}
.money4{flex:none;margin-top:14px;display:grid;grid-template-columns:1fr 1.45fr 1fr;gap:12px;align-items:stretch}
.money4>div{border-radius:18px;padding:14px 16px 12px;text-align:center;background:rgba(5,8,6,.88);border:2px solid rgba(255,255,255,.16);min-width:0}
.money4 .k{font:800 17px/1.1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.78);text-transform:uppercase;white-space:nowrap}
.money4 .v{display:block;margin-top:8px;font:900 46px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.money4 .pay{border:3px solid var(--acc);background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 26%,rgba(5,8,6,.9)),rgba(5,8,6,.92));box-shadow:0 0 30px color-mix(in srgb,var(--acc) 40%,transparent)}
.money4 .pay .k{color:var(--acc)}.money4 .pay .v{font-size:58px;color:var(--acc)}
.money4 .pay .v[data-cell="money.target"]{font-size:46px}
.money4 .pro .v{color:var(--neon)}
.money4 .aw{grid-column:2 / 4}.money4 .aw .v{font-size:34px}
.money4 .sub{margin-top:8px;font:700 13px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.55);text-transform:uppercase}
.rib4{position:absolute;top:14px;left:0;right:0;z-index:9;text-align:center;font:900 22px/36px var(--headline);letter-spacing:.12em;color:#050706;background:#FFB23F;text-transform:uppercase}
.rib4.t{background:#FF3B6B;color:#fff}
</style>`;

const seg = (cells, r, steps) => {
  const top = r.step === steps;
  const mark = r.state === RUNG.COMPLETED ? "✓ " : r.state === RUNG.FAILED ? "✕ " : "";
  return `<div class="sg ${r.state}" data-rung="${r.state}"><span class="k">${esc(mark)}Step ${r.step}</span>${cell(cells, `ladder.m${r.step}`, `${top ? "" : "~"}${cents(r.milestoneCents)}`, "m")}<span class="t">${top ? "Goal" : "Target"}</span></div>`;
};
function battery(cells, rungs) {
  return `<div class="bat4" data-meter="battery"><div class="segs">${rungs.map((r) => seg(cells, r, rungs.length)).join("")}</div></div>`;
}
function rocket(cells, rungs) {
  const svg = `<svg viewBox="0 0 270 780" preserveAspectRatio="none" aria-hidden="true"><defs>
<linearGradient id="hull" x1="0" x2="1"><stop offset="0" stop-color="#2a1640"/><stop offset=".5" stop-color="#140a22"/><stop offset="1" stop-color="#2a1640"/></linearGradient>
<radialGradient id="fire" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#FFF6D0"/><stop offset=".35" stop-color="#FFB23F"/><stop offset=".7" stop-color="#FF5A1F" stop-opacity=".8"/><stop offset="1" stop-color="#7A2CFF" stop-opacity="0"/></radialGradient></defs>
<path d="M135 8 C 190 60 215 110 220 150 L 220 640 L 50 640 L 50 150 C 55 110 80 60 135 8 Z" fill="url(#hull)" stroke="#C77DFF" stroke-width="5" style="filter:drop-shadow(0 0 14px #C77DFF)"/>
<path d="M50 520 L 6 640 L 6 690 L 50 650 Z M220 520 L 264 640 L 264 690 L 220 650 Z" fill="#2a1640" stroke="#FF8A2E" stroke-width="4" style="filter:drop-shadow(0 0 10px #FF8A2E)"/>
<rect x="95" y="640" width="80" height="34" rx="6" fill="#3a3f46" stroke="#9aa0a6" stroke-width="3"/>
<ellipse cx="135" cy="730" rx="62" ry="64" fill="url(#fire)"/></svg>`;
  return `<div class="rk" data-meter="rocket">${svg}<div class="segs">${rungs.map((r) => seg(cells, r, rungs.length)).join("")}</div></div>`;
}

function legSlot(cells, l, i, price, outcome) {
  const k = `leg${i + 1}`;
  if (l.placeholder) {
    return `<div class="lg4 ph" data-slot="${l.placeholder}"><div class="n">${i + 1}</div>${cell(cells, `${k}.name`, i === 0 ? PLACEHOLDER.leg1 : PLACEHOLDER.leg2, "nm")}<div class="pj"><span class="pk">Model win probability</span>${cell(cells, `${k}.proj`, PLACEHOLDER.pending, "pv")}</div><div class="mt">${cell(cells, `${k}.odds`, "Odds pending")}</div></div>`;
  }
  const t = teamOf(l.team.abbr, l.team.name);
  const odds = price && price.oddsFormat === "american" && american(price.price) ? cell(cells, `${k}.odds`, american(price.price), "od") : "";
  const oc = outcome ? cell(cells, `${k}.outcome`, { WIN: "LANDED", LOSS: "MISSED" }[outcome] ?? outcome, `oc ${outcome}`) : "";
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag>${cell(cells, `${k}.flag`, `⚑ ${l.flagText.join(" · ")}`)}</div>` : "";
  return `<div class="lg4" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><span class="nm" data-fit>${cell(cells, `${k}.name`, l.kind === "GAME_WINNER" ? t.name : l.player.name)}</span><div class="pj"><span class="pk">Model win<br>probability</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}</div><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}${odds}${oc}</div>${flag}</div>`;
}

/**
 * One V4 card. `model`: { product, letter, date, step, steps, rungs, baseCents, targetCents, bankrollCents, badge, view,
 * legs (resolved legs, or { placeholder: "required"|"optional" } slots), payout (engine price) | null, template: bool,
 * legResults }.
 */
export function bbmCardV4(model, { testData = false } = {}) {
  const P = PRODUCT[model.product];
  if (!P) throw new Error(`no V4 design for ${model.product}`);
  if ((model.legs ?? []).length > RULES_V2.maxLegs) throw new Error(`${model.legs.length} legs: rules v2 take at most ${RULES_V2.maxLegs}`);
  if (!Object.values(BADGE).includes(model.badge)) throw new Error(`status ${model.badge} is not in the public vocabulary`);
  const cells = {};
  const tpl = model.template === true;
  const status = model.badge === BADGE.ACTIVE ? "" : `<span class="st ${String(model.badge).split(" ")[0]}">${cell(cells, "status", STATUS_WORD[model.badge] ?? model.badge)}</span>`;
  const stepWord = model.view === VIEW.COMPLETE || model.view === VIEW.FINISHED_SHORT ? `${model.rungs.filter((r) => r.state === RUNG.COMPLETED).length} of ${model.steps} won` : `Step ${model.step} of ${model.steps}`;
  const top = `<div class="v4-title">${esc(P.name)}</div><div class="v4-goal">${cell(cells, "goal", `${cents(model.baseCents)} → ${cents(model.targetCents)} challenge`)}</div><div class="v4-lane"><b>${cell(cells, "lane", `Lane ${model.letter}`)}</b><span>${cell(cells, "step", stepWord)}</span>${status}</div>`;
  const meter = model.product === "moonshot" ? rocket(cells, model.rungs) : battery(cells, model.rungs);
  const outs = Object.fromEntries((model.legResults ?? []).map((r) => [r.legId, r.outcome]));
  let right; let bottom = "";
  const cardView = [VIEW.CARD, VIEW.WON, VIEW.BUSTED].includes(model.view) && (model.legs ?? []).length;
  if (cardView) {
    right = `<div class="legs4">${model.legs.map((l, i) => legSlot(cells, l, i, model.view === VIEW.CARD ? model.payout?.legs?.[l.legId] : null, model.view === VIEW.CARD || l.placeholder ? null : outs[l.legId] ?? "PENDING")).join("")}</div>`;
    if (model.view === VIEW.CARD) {
      const stepTarget = model.rungs[model.step - 1]?.milestoneCents;
      const am = model.payout ? american(model.payout.combinedAmerican) : null;
      const tag = tpl ? `<span class="tg tpl">${cell(cells, "price.template", "Not yet qualified")}</span>` : model.payout?.preliminary ? `<span class="tg pre">${cell(cells, "price.preliminary", "Preliminary odds")}</span>` : model.payout && !model.payout.fixture ? `<span class="tg ver">${cell(cells, "price.verified", "Verified odds")}</span>` : "";
      bottom += `<div class="comb4"><span class="k">${esc(model.payout?.estimate ? "Combined odds (estimate)" : "Combined odds (leg product)")}</span>${cell(cells, "price.combined", am ?? "Pending", "v")}${tag}</div>`;
      const stake = `<div><div class="k">Tracked stake</div>${cell(cells, "money.wager", model.bankrollCents == null ? "WITHHELD" : cents(model.bankrollCents), "v")}</div>`;
      if (tpl) bottom += `<div class="money4">${stake}<div class="pay"><div class="k">Step target</div>${cell(cells, "money.target", `Target ~${cents(stepTarget)}`, "v")}<div class="sub">${cell(cells, "money.targetNote", "A target, not a payout")}</div></div><div><div class="k">Potential profit</div>${cell(cells, "money.profitPending", "Pending", "v")}</div></div>`;
      else if (!model.payout) bottom += `<div class="money4">${stake}<div class="aw"><div class="k">Potential payout</div>${cell(cells, "money.payout", AWAITING, "v")}</div></div>`;
      else bottom += `<div class="money4">${stake}<div class="pay" data-money="payout"><div class="k">Potential payout</div>${cell(cells, "money.payout", cents(model.payout.grossCents), "v")}</div><div class="pro"><div class="k">Potential profit</div>${cell(cells, "money.profit", cents(model.payout.profitCents), "v")}</div></div>`;
    }
  } else {
    const note = model.view === VIEW.NO_ELIGIBLE_CARD ? ["No qualified card today", "The lane holds its place and its tracked bankroll."] : model.view === VIEW.COMPLETE ? ["Goal reached", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : model.view === VIEW.FINISHED_SHORT ? ["Finished short", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : ["Lane busted", ""];
    right = `<div class="stat4"><div class="k">${cell(cells, "status.note", note[0])}</div>${note[1] ? `<div class="c">${cell(cells, "status.rule", note[1])}</div>` : ""}</div>`;
  }
  const body = `${CSS}<div class="v4 ${P.cls}" style="--acc:${P.acc};--neon:${P.neon}">${top}<div class="v4-mid">${meter}${right}</div>${bottom}</div>`;
  let html = shell({ away: { abbr: "", color: P.a }, home: { abbr: "", color: P.b }, chip: chipText(model.date), body, review: false, disclosure: V4_FOOTER }).replace(/<div class="rg">[^<]*<\/div>/g, "").replace(/style="--ca:[^"]*"/, `style="--ca:${P.a};--cb:${P.b};--pa:${P.a};--pb:${P.b}"`);
  const rib = [tpl ? TEMPLATE_RIBBON : null, testData ? TEST_RIBBON : null, model.payout?.fixture ? SAMPLE_PRICE_RIBBON : null].filter(Boolean);
  if (rib.length) html = html.replace('<div class="frame"></div>', `<div class="rib4 ${testData && !tpl ? "t" : ""}">${esc(rib.join(" · "))}</div><div class="frame"></div>`);
  return { html, cells, laneId: model.laneId, view: model.view, badge: model.badge, template: tpl, preliminary: model.payout?.preliminary === true, testData, samplePrice: model.payout?.fixture === true, priced: model.payout != null, disclosure: V4_FOOTER, design: BBM_V4_DESIGN_VERSION };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")]));
const PRICE_TEXT = /[+−-]\d{3}\b|\bparlay\b|\bline\b|\bover\b|\bunder\b|×/i;
/** [] when a V4 card is clean. A template must say it is one, and can never look verified or carry a payout. */
export function verifyBbmCardV4(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " "));
  for (const r of V4_REMOVED) if (r.test(text)) e.push(`removed item on image: ${text.match(r)[0]}`);
  if (!text.includes(V4_FOOTER)) e.push("the 21+ line is missing");
  if ((text.match(/\bStep \d+ of \d+\b/gi) ?? []).length > 1) e.push("the lane step is stated twice");
  if (card.template) {
    if (!text.toLowerCase().includes(TEMPLATE_RIBBON.toLowerCase())) e.push("a template without its TEMPLATE ribbon");
    if ("price.verified" in got || /verified odds/i.test(text)) e.push("a template carries VERIFIED");
    if ("money.payout" in got || "money.profit" in got) e.push("a template carries a payout or profit");
    if (card.priced) e.push("a template carries a price");
  } else if (/template preview/i.test(text)) e.push("TEMPLATE ribbon on a real card");
  const priceCells = Object.entries(got).filter(([k]) => /\.odds$|^price\./.test(k));
  let shown = text; for (const [, v] of priceCells) shown = shown.split(v).join(" ");
  shown = shown.replace(/Combined odds \((leg product|estimate)\)/gi, " ").replace(AWAITING, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (PRICE_TEXT.test(shown)) e.push(`price text outside its cells: ${shown.match(PRICE_TEXT)[0]}`);
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(shown), ...statLabelProblems(shown));
  if (!card.template) {
    const verified = card.priced && !card.preliminary && !card.samplePrice;
    if (verified !== ("price.verified" in got)) e.push(verified ? "a verified price without its tag" : "a verified tag without a verified real price");
  }
  return e;
}

/** Layout problems in a real browser: clipped or off-canvas cells, overlapping blocks, spilled rows, tiny text. */
export async function bbmV4LayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      // Inline text has no box of its own (client sizes read 0): only block-level cells can clip sideways; all stay on the
      // canvas. Vertical overflow is checked on the containers (meter segments, leg rows, stacked blocks), since large
      // numerals at line-height 1 always overhang their own line box.
      const clipped = [...document.querySelectorAll("[data-cell]")].filter((e) => { const r = e.getBoundingClientRect(); const block = getComputedStyle(e).display !== "inline"; return (block && e.scrollWidth > e.clientWidth + 1) || r.right > 1080 - 18 || r.left < 18 || r.bottom > 1350 - 8; }).map((e) => `${e.dataset.cell}=${e.textContent}`);
      const boxes = [".top", ".v4-title", ".v4-goal", ".v4-lane", ".v4-mid", ".comb4", ".money4", ".social", ".disclosure"].map((s) => document.querySelector(s)).filter(Boolean).map((e) => ({ s: e.className, r: e.getBoundingClientRect() }));
      const overlaps = []; for (let i = 1; i < boxes.length; i += 1) if (boxes[i].r.top < boxes[i - 1].r.bottom - 1) overlaps.push(`${boxes[i - 1].s} / ${boxes[i].s}`);
      const area = document.querySelector(".legs4")?.getBoundingClientRect();
      const spill = area ? [...document.querySelectorAll(".lg4")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < area.top - 1 || r.bottom > area.bottom + 1; }).length : 0;
      const segOut = [...document.querySelectorAll(".sg")].filter((e) => e.scrollHeight > e.clientHeight + 2).length + [...document.querySelectorAll("[data-flag]")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2).length;
      const small = [...document.querySelectorAll("[data-cell]")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.dataset.cell);
      return { clipped, overlaps, spill, segOut, small, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    });
    const n = c.name ?? c.laneId;
    if (m.clipped.length) errs.push(`${n}: clipped ${m.clipped.join(" | ")}`);
    if (m.overlaps.length) errs.push(`${n}: overlap ${m.overlaps.join(", ")}`);
    if (m.spill) errs.push(`${n}: ${m.spill} leg row(s) spill`);
    if (m.segOut) errs.push(`${n}: ${m.segOut} meter segment(s) or flag line(s) overflow`);
    if (m.small.length) errs.push(`${n}: text under 13px ${m.small.join(", ")}`);
    if (m.fit.length || m.page) errs.push(`${n}: does not fit ${m.fit.join(" | ")}`);
  }
  await page.close();
  return errs;
}
