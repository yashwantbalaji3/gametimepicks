/* global document, window, getComputedStyle -- bbmV3LayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER & MOONSHOT GRAPHICS V3 (founder design directive 2026-11-04 ~17:08Z). An original GameTimePicks layout,
 * 1080x1350, on the established stage (game-day-cards.mjs shell) with its background lettering, seam and field removed.
 *
 *   top     logo · NBA + date chip · product title · goal ($100 → $10,000) · lane and step, stated once
 *   middle  a vertical battery ladder on the left (step 1 at the bottom, 5 at the top, each with its milestone): won
 *           steps filled, the current step lit, a failed step marked, future steps subdued; legs on the right
 *   bottom  TRACKED STAKE · COMBINED ODDS (LEG PRODUCT) · POTENTIAL PAYOUT (the focal number) · POTENTIAL PROFIT
 *
 * Removed against V2: the status badge, the horizontal meter, the pace line, the odds-source line (provenance stays in
 * the manifest: the terms review says attribution is not required), the tracked-challenge footer (the caption carries
 * it), methodology text and repeated STEP wording. Kept, small: 21+ · Gamble responsibly (recommended on priced graphics).
 * Same data as V2: the lane view (engine laneDisplay), the resolved legs, and the engine's verified price. The cell keys
 * the parity check reads (legN.team, legN.proj, money.*) are the same.
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, sourceTextProblems, statLabelProblems, teamOf } from "./game-day-cards.mjs";
import { visibleText } from "./nba-line-cards.mjs";
import { american, cents, chipText, tipText, AWAITING, TEST_RIBBON, SAMPLE_PRICE_RIBBON, MODEL_LABEL, WIN_LABEL } from "./bbm-cards.mjs";
import { BADGE, RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export const BBM_V3_DESIGN_VERSION = "bbm-v3";
export const V3_FOOTER = "21+ · Gamble responsibly";
/** Text V3 removed; a card printing any of it is refused. */
export const V3_REMOVED = Object.freeze([/NO REAL WAGER/i, /\bCAPTURED\b/i, /\bODDS (DRAFTKINGS|FANDUEL|BETMGM|CAESARS|SAMPLE BOOK)\b/i, /NEXT MILESTONE/i, /BELOW PACE|ON PACE|BEHIND PACE/i, /FOUNDER REVIEW ONLY/i, /NOT A SPORTSBOOK OFFER/i, /must land/i, /betting advice/i, /\bACTIVE\b/]);
const PRODUCT = Object.freeze({
  "bank-builder": { name: "Bank Builder", cls: "bb", acc: "#F2C14E", acc2: "#39D98A", a: "#0E3B2A", b: "#3A2E08" },
  moonshot: { name: "Moonshot", cls: "ms", acc: "#FF7A2E", acc2: "#B57BFF", a: "#4A1677", b: "#7A2A0C" },
});
const STATUS_WORD = Object.freeze({ [BADGE.WON]: "Won", [BADGE.LOST]: "Lost", [BADGE.HELD]: "Held", [BADGE.COMPLETED]: "Completed", [BADGE.FINISHED_SHORT]: "Finished short" });

const CSS = `<style>
.ghost,.seam,.field{display:none!important}
.beams{opacity:.42}.flare{opacity:.55}
.half.l{background:radial-gradient(120% 70% at 20% 0%,color-mix(in srgb,var(--pa) 80%,#000) 0%,#050706 70%)!important}
.half.r{background:radial-gradient(120% 70% at 80% 0%,color-mix(in srgb,var(--pb) 85%,#000) 0%,#050706 70%)!important}
.content .disclosure{font:700 19px/1.2 var(--display);letter-spacing:3px;color:rgba(247,247,242,.58);text-transform:uppercase}
.v3{display:flex;flex-direction:column;flex:1;min-height:0}
.v3-title{margin-top:4px;text-align:center;font:900 92px/.95 var(--headline);letter-spacing:1px;text-transform:uppercase;color:var(--acc);text-shadow:0 0 34px color-mix(in srgb,var(--acc) 45%,transparent),0 4px 18px rgba(0,0,0,.8);white-space:nowrap}
.v3.ms .v3-title{background:linear-gradient(180deg,#FFE3B0,#FF7A2E 55%,#E0480F);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 22px rgba(255,122,46,.45))}
.v3-goal{margin-top:8px;text-align:center;font:900 46px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.v3-goal .ar{color:var(--acc);padding:0 10px}
.v3-lane{margin-top:10px;display:flex;justify-content:center;gap:12px;font:800 24px/1 var(--display);letter-spacing:4px;text-transform:uppercase;color:rgba(247,247,242,.86);white-space:nowrap}
.v3-lane b{color:#050706;background:var(--acc);padding:6px 12px 4px;border-radius:8px;font-weight:900;letter-spacing:3px}
.v3-lane .st{padding:6px 12px 4px;border-radius:8px;border:2px solid currentColor}
.v3-lane .st.LOST{color:#FF4D5E}.v3-lane .st.HELD{color:#FFB23F}.v3-lane .st.WON,.v3-lane .st.COMPLETED{color:var(--acc)}.v3-lane .st.FINISHED{color:#C9D1D9}
.v3-mid{flex:1;min-height:0;margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:22px}
.bat{position:relative;display:flex;flex-direction:column;align-items:stretch;padding:22px 14px 14px;border-radius:26px;border:3px solid rgba(247,247,242,.28);background:linear-gradient(180deg,rgba(5,8,6,.82),rgba(5,8,6,.94));box-shadow:inset 0 0 30px rgba(0,0,0,.6)}
.bat:before{content:"";position:absolute;top:-14px;left:50%;width:70px;height:14px;margin-left:-35px;border-radius:7px 7px 0 0;background:rgba(247,247,242,.28)}
.cellz{flex:1;display:flex;flex-direction:column-reverse;gap:8px}
.cz{flex:1;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-radius:12px;border:2px solid rgba(247,247,242,.12);background:rgba(247,247,242,.04);color:rgba(247,247,242,.45)}
.cz .n{font:900 34px/1 var(--headline)}.cz .m{font:800 22px/1 var(--display);white-space:nowrap}
.cz.completed{background:linear-gradient(90deg,var(--acc),color-mix(in srgb,var(--acc) 70%,#fff));border-color:var(--acc);color:#050706}
.cz.active{border:3px solid var(--acc);background:color-mix(in srgb,var(--acc) 22%,rgba(5,8,6,.9));color:#F7F7F2;box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 22%,transparent),0 0 26px color-mix(in srgb,var(--acc) 60%,transparent)}
.cz.active .m{color:var(--acc)}
.cz.failed{background:rgba(255,77,94,.22);border-color:#FF4D5E;color:#FF4D5E}
.legs3{display:flex;flex-direction:column;justify-content:center;gap:14px;min-width:0}
.lg3{display:grid;grid-template-columns:1fr auto;align-items:center;gap:6px 14px;padding:18px 22px;border-radius:18px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 30%,rgba(5,8,6,.94)),rgba(5,8,6,.9) 62%);border:1px solid rgba(255,255,255,.14);border-left:9px solid var(--c);min-width:0}
.lg3 .nm{font:900 46px/1.02 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;color:#F7F7F2}
.lg3 .mt{grid-column:1;display:flex;align-items:center;gap:10px;font:700 21px/1 var(--display);letter-spacing:1px;color:rgba(247,247,242,.78);white-space:nowrap;min-width:0}
.lg3 .tg{font:900 20px/1 var(--headline);padding:4px 7px 2px;border-radius:6px;background:var(--c);color:var(--cink)}
.lg3 .od{font:900 22px/1 var(--display);padding:5px 9px 3px;border-radius:7px;background:rgba(247,247,242,.94);color:#050706}
.lg3 .pj{grid-column:2;grid-row:1 / 3;text-align:right}
.lg3 .pv{display:block;font:900 58px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.lg3 .pk{display:block;margin-top:4px;font:800 14px/1.1 var(--display);letter-spacing:2px;color:var(--acc);text-transform:uppercase;white-space:nowrap}
.lg3 .fl{grid-column:1 / 3;font:800 19px/1.1 var(--display);color:#FFD166;white-space:nowrap;overflow:hidden}
.lg3 .oc{font:900 18px/1 var(--headline);padding:4px 8px 2px;border-radius:6px}.lg3 .oc.WIN{background:var(--acc);color:#050706}.lg3 .oc.LOSS{background:#FF4D5E;color:#050706}.lg3 .oc.PENDING,.lg3 .oc.VOID,.lg3 .oc.PUSH{background:rgba(255,255,255,.2);color:#F7F7F2}
.v3.bb .legs3{gap:22px}.v3.bb .lg3{padding:30px 24px}.v3.bb .lg3 .nm{font-size:54px}.v3.bb .lg3 .pv{font-size:70px}.v3.bb .lg3 .mt{font-size:23px;margin-top:6px}.v3.bb .lg3 .pk{font-size:15px}
.legs3.d{gap:8px}.legs3.d .lg3{padding:8px 16px;gap:3px 12px}.legs3.d .nm{font-size:32px}.legs3.d .mt{font-size:17px;gap:8px}.legs3.d .tg,.legs3.d .od{font-size:16px;padding:3px 6px 2px}.legs3.d .pv{font-size:38px}.legs3.d .pk{font-size:11px;margin-top:2px}.legs3.d .fl{font-size:16px}
.stat3{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center}
.stat3 .k{font:900 54px/1.05 var(--headline);text-transform:uppercase;color:#F7F7F2}
.stat3 .c{font:700 26px/1.3 var(--display);color:rgba(247,247,242,.8)}
.money3{flex:none;margin-top:20px;display:grid;grid-template-columns:0.9fr 1.35fr 1.45fr 1fr;gap:10px;align-items:stretch}
.money3>div{border-radius:16px;padding:12px 14px 10px;background:rgba(5,8,6,.86);border:1px solid rgba(255,255,255,.16);min-width:0}
.money3 .k{font:800 15px/1.15 var(--display);letter-spacing:1.5px;white-space:nowrap;color:rgba(247,247,242,.72);text-transform:uppercase}
.money3 .v{display:block;margin-top:6px;font:900 40px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.money3 .tg2{margin-top:4px;font:800 13px/1 var(--display);letter-spacing:2px;color:var(--acc2);text-transform:uppercase;white-space:nowrap}
.money3 .tg2.pre{color:#FFB23F}
.money3 .pay{background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 30%,rgba(5,8,6,.9)),rgba(5,8,6,.92));border:3px solid var(--acc);box-shadow:0 0 30px color-mix(in srgb,var(--acc) 35%,transparent)}
.money3 .pay .k{color:var(--acc)}.money3 .pay .v{font-size:58px;color:#F7F7F2}
.money3 .aw{grid-column:2 / 5}.money3 .aw .v{font-size:34px}
.rib3{position:absolute;top:14px;left:0;right:0;z-index:9;text-align:center;font:900 24px/38px var(--headline);letter-spacing:.12em;color:#fff;background:#FF3B6B}
.rib3.p{background:#E8B100;color:#050706}
</style>`;

const OUTCOME = Object.freeze({ WIN: "LANDED", LOSS: "MISSED", VOID: "VOID", PUSH: "PUSH", PENDING: "PENDING" });

function battery(cells, v) {
  const rung = (r) => {
    const mark = r.state === RUNG.COMPLETED ? "✓" : r.state === RUNG.FAILED ? "✕" : String(r.step);
    return `<div class="cz ${r.state}" data-rung="${r.state}"><span class="n">${esc(mark)}</span>${cell(cells, `ladder.m${r.step}`, cents(r.milestoneCents), "m")}</div>`;
  };
  return `<div class="bat" data-ladder="${v.steps}"><div class="cellz">${v.rungs.map(rung).join("")}</div></div>`;
}

function legRow(cells, l, i, outcome, price) {
  const t = teamOf(l.team.abbr, l.team.name);
  const k = `leg${i + 1}`;
  const winner = l.kind === "GAME_WINNER";
  const who = winner ? t.name : l.player.name;
  const odds = price && price.oddsFormat === "american" && american(price.price) ? cell(cells, `${k}.odds`, american(price.price), "od") : "";
  const line = l.kind === "PLAYER_PROP" && l.lineText ? cell(cells, `${k}.line`, l.lineText, "od") : "";
  const oc = outcome ? cell(cells, `${k}.outcome`, OUTCOME[outcome] ?? outcome, `oc ${outcome}`) : "";
  // Injury markers: the leg's shown rotation flags, names only (the status rides in the caption-free graphic).
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag>${cell(cells, `${k}.flag`, `⚑ ${l.flagText.join(" · ")}`)}</div>` : "";
  return `<div class="lg3" style="--c:${t.color};--cink:${t.ink}"><span class="nm" data-fit>${cell(cells, `${k}.name`, who)}</span><div class="pj">${cell(cells, `${k}.proj`, l.projectionText, "pv")}<span class="pk">${esc(winner ? WIN_LABEL : MODEL_LABEL)}</span></div><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}${line}${odds}${oc}</div>${flag}</div>`;
}

function moneyBlock(cells, v) {
  const stake = `<div><div class="k">Tracked stake</div>${cell(cells, "money.wager", v.bankrollCents == null ? "WITHHELD" : cents(v.bankrollCents), "v")}</div>`;
  if (!v.payout) return `<div class="money3">${stake}<div class="aw"><div class="k">Potential payout</div>${cell(cells, "money.payout", AWAITING, "v")}</div></div>`;
  const am = american(v.payout.combinedAmerican);
  const tag = v.payout.preliminary ? `<div class="tg2 pre">${cell(cells, "price.preliminary", "Preliminary odds")}</div>` : v.payout.fixture ? "" : `<div class="tg2">${cell(cells, "price.verified", "Verified odds")}</div>`;
  const combinedLabel = v.payout.estimate ? "Combined odds (estimate)" : "Combined odds (leg product)";
  return `<div class="money3">${stake}<div><div class="k">${esc(combinedLabel)}</div>${cell(cells, "price.combined", am ?? "n/a", "v")}${tag}</div><div class="pay" data-money="payout"><div class="k">Potential payout</div>${cell(cells, "money.payout", cents(v.payout.grossCents), "v")}</div><div><div class="k">Potential profit</div>${cell(cells, "money.profit", cents(v.payout.profitCents), "v")}</div></div>`;
}

/** One V3 card. Same inputs as bbmCard (bbm-cards.mjs). */
export function bbmCardV3(view, combo = null, { testData = false } = {}) {
  const P = PRODUCT[view.product];
  if (!P) throw new Error(`no V3 design for ${view.product}`);
  if (!Object.values(BADGE).includes(view.badge)) throw new Error(`${view.laneId}: status ${view.badge} is not in the public vocabulary`);
  const cells = {};
  const status = view.badge === BADGE.ACTIVE ? "" : `<span class="st ${String(view.badge).split(" ")[0]}">${cell(cells, "status", STATUS_WORD[view.badge] ?? view.badge)}</span>`;
  // The step once: the step the lane is on (or the step it won, lost or finished at).
  const stepWord = view.view === VIEW.COMPLETE || view.view === VIEW.FINISHED_SHORT ? `${view.cleared} of ${view.steps} won` : `Step ${view.step} of ${view.steps}`;
  const top = `<div class="v3-title">${esc(P.name)}</div><div class="v3-goal">${cell(cells, "goal.start", cents(view.baseCents))}<span class="ar">→</span>${cell(cells, "goal.target", cents(view.targetCents))}</div><div class="v3-lane"><b>${cell(cells, "lane", `Lane ${view.letter}`)}</b><span>${cell(cells, "step", stepWord)}</span>${status}</div>`;
  let right; let money = "";
  if (combo && [VIEW.CARD, VIEW.WON, VIEW.BUSTED].includes(view.view)) {
    const outs = Object.fromEntries((view.legResults ?? []).map((r) => [r.legId, r.outcome]));
    right = `<div class="legs3${combo.legs.length > 2 ? " d" : ""}">${combo.legs.map((l, i) => legRow(cells, l, i, view.view === VIEW.CARD ? null : outs[l.legId] ?? "PENDING", view.view === VIEW.CARD ? view.payout?.legs?.[l.legId] ?? null : null)).join("")}</div>`;
    if (view.view === VIEW.CARD) money = moneyBlock(cells, view);
  } else {
    const note = view.view === VIEW.NO_ELIGIBLE_CARD ? ["No qualifying card today", "The lane keeps its step and its tracked bankroll."] : view.view === VIEW.COMPLETE ? ["Goal reached", `${cents(view.bankrollCents)} of ${cents(view.targetCents)}`] : view.view === VIEW.FINISHED_SHORT ? ["Finished short", `${cents(view.bankrollCents)} of ${cents(view.targetCents)}`] : ["Lane busted", ""];
    right = `<div class="stat3"><div class="k">${cell(cells, "status.note", note[0])}</div>${note[1] ? `<div class="c">${cell(cells, "status.rule", note[1])}</div>` : ""}</div>`;
  }
  const body = `${CSS}<div class="v3 ${P.cls}" style="--acc:${P.acc};--acc2:${P.acc2}">${top}<div class="v3-mid">${battery(cells, view)}${right}</div>${money}</div>`;
  let html = shell({ away: { abbr: "", color: P.a }, home: { abbr: "", color: P.b }, chip: chipText(view.date), body, review: false, disclosure: V3_FOOTER }).replace(/<div class="rg">[^<]*<\/div>/g, "").replace("<body ", `<body data-v3="1" `).replace(/style="--ca:[^"]*"/, `style="--ca:${P.a};--cb:${P.b};--pa:${P.a};--pb:${P.b}"`);
  const rib = [testData ? TEST_RIBBON : null, view.payout?.fixture ? SAMPLE_PRICE_RIBBON : null].filter(Boolean);
  if (rib.length) html = html.replace('<div class="frame"></div>', `<div class="rib3 ${testData ? "" : "p"}">${esc(rib.join(" · "))}</div><div class="frame"></div>`);
  return { html, cells, laneId: view.laneId, view: view.view, badge: view.badge, preliminary: view.payout?.preliminary === true, testData, samplePrice: view.payout?.fixture === true, priced: view.payout != null, disclosure: V3_FOOTER, design: BBM_V3_DESIGN_VERSION };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")]));
const PRICE_TEXT = /[+−-]\d{3}\b|\bodds\b|\bparlay\b|\bline\b|\bover\b|\bunder\b|×/i;
/** [] when a V3 card is clean. */
export function verifyBbmCardV3(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " "));
  for (const r of V3_REMOVED) if (r.test(text)) e.push(`V3 removed item on image: ${text.match(r)[0]}`);
  if (!text.includes(V3_FOOTER) && card.priced) e.push("the 21+ line is missing on a priced graphic");
  if ((text.match(/\bSTEP\b/gi) ?? []).length > 1) e.push("STEP wording repeated");
  const priceCells = Object.entries(got).filter(([k]) => /\.(odds|line)$|^price\./.test(k));
  if (priceCells.length && !card.priced) e.push("price text prints without a price");
  let shown = text; for (const [, v] of priceCells) shown = shown.split(v).join(" ");
  shown = shown.replace(/Combined odds \((leg product|estimate)\)/gi, " ").replace(AWAITING, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (PRICE_TEXT.test(shown)) e.push(`price or odds text outside its cells: ${shown.match(PRICE_TEXT)[0]}`);
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(shown), ...statLabelProblems(shown));
  if (card.priced && !("money.profit" in got) && !card.preliminary && !card.samplePrice) e.push("a priced card without its profit");
  if (card.view === VIEW.CARD && !card.priced && got["money.payout"] !== AWAITING) e.push(`an unpriced card must say ${AWAITING}`);
  if (card.preliminary !== ("price.preliminary" in got)) e.push(card.preliminary ? "a preliminary price without its tag" : "a preliminary tag on a verified price");
  const verified = card.priced && !card.preliminary && !card.samplePrice;
  if (verified !== ("price.verified" in got)) e.push(verified ? "a verified price without its tag" : "a verified tag without a verified real price");
  if (card.samplePrice !== text.includes(SAMPLE_PRICE_RIBBON)) e.push("sample price ribbon mismatch");
  if (card.testData !== text.includes(TEST_RIBBON)) e.push("test ribbon mismatch");
  return e;
}

/** Layout problems in a real browser: any clipped or off-canvas cell, overlapping blocks, a page overflow. */
export async function bbmV3LayoutErrors(browser, cards, { width = 1080 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const clipped = [...document.querySelectorAll("[data-cell]")].filter((e) => { const r = e.getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 1 || r.right > 1080 - 20 || r.left < 20 || r.bottom > 1350 - 10; }).map((e) => `${e.dataset.cell}=${e.textContent}`);
      const boxes = [".top", ".v3-title", ".v3-goal", ".v3-lane", ".v3-mid", ".money3", ".social", ".disclosure"].map((s) => document.querySelector(s)).filter(Boolean).map((e) => ({ s: e.className, r: e.getBoundingClientRect() }));
      const overlaps = []; for (let i = 1; i < boxes.length; i += 1) if (boxes[i].r.top < boxes[i - 1].r.bottom - 1) overlaps.push(`${boxes[i - 1].s} / ${boxes[i].s}`);
      const rows = [...document.querySelectorAll(".lg3")]; const area = document.querySelector(".legs3")?.getBoundingClientRect();
      const spill = area ? rows.filter((e) => { const r = e.getBoundingClientRect(); return r.top < area.top - 1 || r.bottom > area.bottom + 1; }).length : 0;
      const small = [...document.querySelectorAll("[data-cell]")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 11).map((e) => e.dataset.cell);
      return { clipped, overlaps, spill, small, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    });
    const n = c.name ?? c.laneId;
    if (m.clipped.length) errs.push(`${n}: clipped ${m.clipped.join(" | ")}`);
    if (m.overlaps.length) errs.push(`${n}: overlap ${m.overlaps.join(", ")}`);
    if (m.spill) errs.push(`${n}: ${m.spill} leg row(s) spill`);
    if (m.small.length) errs.push(`${n}: text under 11px ${m.small.join(", ")}`);
    if (m.fit.length || m.page) errs.push(`${n}: does not fit ${m.fit.join(" | ")}`);
  }
  await page.close();
  void width;
  return errs;
}
