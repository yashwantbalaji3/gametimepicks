/* global document, window, getComputedStyle -- bbmV6LayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER & MOONSHOT GRAPHICS V6 (founder acceptance target: the 2026-11-04 reference composition; V5 plus the PD's
 * contrast pass: near-black base, small bright spotlights with lens flare, saturated neon with a tight core and a wide
 * halo, banded chrome, a big flame with billowing smoke, a glowing court arc and basketball, solid team panels, a STEP n
 * PLAN box, and the payout as the brightest object). Original
 * GameTimePicks art drawn in code, 1080x1350, every number and word code-rendered from the model:
 *   scene    arena spotlights with light cones, a crowd bokeh band, a polished court floor with reflections and a
 *            basketball, a fine noise grain (all procedural SVG; no third-party marks; the official GTP logo only)
 *   meter    Bank Builder: a large chrome battery (cap, cylindrical body with reflections, neon green glow, 5 glass
 *            compartments). Moonshot: a tall chrome rocket (nosecone, neon purple outline, orange rim light, lit fins,
 *            engine flame and purple smoke, 5 body segments, step 5 at the nose). Left third, full height.
 *   right    logo · NBA date chip · gold italic title · "$100 → $10,000 challenge" · LANE and STEP pills · up to two
 *            neon leg panels (moneyline or prop) · combined odds (leg product) bar, check badge only when verified ·
 *            tracked stake / potential payout (largest, gold) / potential profit
 * Template mode keeps every placeholder and gate of V4 (ribbon, never VERIFIED, never a payout, never packaged).
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, sourceTextProblems, statLabelProblems, teamOf } from "./game-day-cards.mjs";
import { logoDataUri, visibleText } from "./nba-line-cards.mjs";
import { american, cents, chipText, tipText, TEST_RIBBON, SAMPLE_PRICE_RIBBON } from "./bbm-cards.mjs";
import { RULES_V2, TEMPLATE_RIBBON } from "./bbm-cards-v4.mjs";
import { BADGE, RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export { RULES_V2, TEMPLATE_RIBBON };
export const BBM_V6_DESIGN_VERSION = "bbm-v6";
export const V6_FOOTER = "21+ · Gamble responsibly";
export const V6_PLACEHOLDER = Object.freeze({ leg: "Awaiting qualified selection", price: "Price pending", payout: "Pending" });
/** Prop legs: Level A carries the model's probability; Level B is research evidence, never a probability. */
export const PROP_LEVEL = Object.freeze({ A: "Model value (Level A)", B: "Research (Level B)" });
export const V6_REMOVED = Object.freeze([/NO REAL WAGER/i, /\bCAPTURED\b/i, /NEXT MILESTONE/i, /BELOW PACE|ON PACE|BEHIND PACE/i, /FOUNDER REVIEW ONLY/i, /NOT A SPORTSBOOK OFFER/i, /must land/i, /betting advice/i, /\bACTIVE\b/]);
const STATUS_WORD = Object.freeze({ [BADGE.WON]: "Won", [BADGE.LOST]: "Lost", [BADGE.HELD]: "Held", [BADGE.COMPLETED]: "Completed", [BADGE.FINISHED_SHORT]: "Finished short" });
const PRODUCT = Object.freeze({
  "bank-builder": { name: "Bank Builder", cls: "bb", neon: "#39FF14", neon2: "#B6FF3D", mag: "#39FF14", core: "#EAFFE0", arc: "#FF9A2E", tint: "#0B3A12", gold1: "#FFF6B0", gold2: "#FFC400", gold3: "#B85C00" },
  moonshot: { name: "Moonshot", cls: "ms", neon: "#C13BFF", neon2: "#FF7A00", mag: "#FF2BD6", core: "#F6E6FF", arc: "#C13BFF", tint: "#3A0A66", gold1: "#FFE89A", gold2: "#FF9500", gold3: "#B83200" },
});

/** A deterministic pseudo-random sequence (no clock, no Math.random), so a re-render is byte-identical. */
function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** The arena plate: near-black base, small bright spotlights with lens flare and beams, crowd, a polished floor with reflections, a glowing court arc and basketball, grain. */
function scene(P) {
  const r = seeded(P.cls === "bb" ? 7 : 11);
  const bokeh = Array.from({ length: 140 }, () => {
    const x = r() * 1080; const y = 120 + r() * 330; const rad = 1 + r() * 4.5; const warm = r() < 0.5;
    const col = warm ? ["#FFC857", "#FF8A1F", "#FFE9B8"][Math.floor(r() * 3)] : [P.neon, P.mag, "#8FC8FF"][Math.floor(r() * 3)];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${col}" opacity="${(0.2 + r() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const lamp = ([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="#7FB8FF" opacity=".55" filter="url(#b8)"/><circle cx="${x}" cy="${y}" r="7" fill="#FFFFFF"/><ellipse cx="${x}" cy="${y}" rx="60" ry="1.6" fill="#E8F4FF" opacity=".7"/><ellipse cx="${x}" cy="${y}" rx="1.4" ry="26" fill="#E8F4FF" opacity=".45"/>`;
  const lamps = [[34, 34], [74, 26], [114, 18], [52, 70], [92, 62], [132, 54], [1046, 34], [1006, 26], [966, 18], [1028, 70], [988, 62], [948, 54]].map(lamp).join("");
  return `<svg class="plate" viewBox="0 0 1080 1350" preserveAspectRatio="none" aria-hidden="true"><defs>
<filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="b3"><feGaussianBlur stdDeviation="1.8"/></filter>
<filter id="b30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="glow2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="a"/><feGaussianBlur stdDeviation="16" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .06"/></feComponentTransfer></filter>
<radialGradient id="sky" cx=".5" cy=".25" r=".8"><stop offset="0" stop-color="${P.tint}" stop-opacity=".55"/><stop offset=".6" stop-color="#020304" stop-opacity="0"/></radialGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE6FF" stop-opacity=".5"/><stop offset="1" stop-color="#CFE6FF" stop-opacity="0"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070403"/><stop offset=".4" stop-color="#1c0f06"/><stop offset="1" stop-color="#050302"/></linearGradient>
<radialGradient id="ball" cx=".45" cy=".22" r=".8"><stop offset="0" stop-color="#FFC27A"/><stop offset=".35" stop-color="#E5701F"/><stop offset=".8" stop-color="#5A1E06"/><stop offset="1" stop-color="#1E0802"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
<rect width="1080" height="1350" fill="#020304"/><rect width="1080" height="1350" fill="url(#sky)"/>
<ellipse cx="-40" cy="600" rx="260" ry="640" fill="${P.neon}" opacity=".13" filter="url(#b30)"/><ellipse cx="1120" cy="560" rx="240" ry="600" fill="${P.mag}" opacity=".1" filter="url(#b30)"/>
<g filter="url(#b8)"><polygon points="90,40 150,40 470,1000 250,1000" fill="url(#beam)" opacity=".22"/><polygon points="930,40 990,40 830,1000 610,1000" fill="url(#beam)" opacity=".22"/><polygon points="60,40 90,40 120,900 20,900" fill="url(#beam)" opacity=".14"/><polygon points="990,40 1020,40 1060,900 960,900" fill="url(#beam)" opacity=".14"/></g>
<g fill="#000" opacity=".85">${Array.from({ length: 80 }, (_, i) => { const x = (i * 1080) / 80 + 5; const y = 300 + Math.sin(i * 1.7) * 14 + (i % 3) * 7; return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="6" ry="8"/><rect x="${(x - 8).toFixed(0)}" y="${(y + 7).toFixed(0)}" width="16" height="44" rx="6"/>`; }).join("")}<rect y="345" width="1080" height="140"/></g>
<g filter="url(#b3)">${bokeh}</g>${lamps}
<polygon points="-200,1350 1280,1350 1080,1060 0,1060" fill="url(#floor)"/>
${Array.from({ length: 14 }, (_, i) => `<line x1="${-200 + i * 106}" y1="1350" x2="${i * 77}" y2="1060" stroke="#000" stroke-opacity=".45" stroke-width="2"/>`).join("")}
<g filter="url(#b8)" opacity=".55"><rect x="60" y="1150" width="240" height="200" fill="${P.neon}" opacity=".35"/><rect x="560" y="1170" width="220" height="180" fill="#FFC21A" opacity=".3"/><rect x="380" y="1170" width="140" height="180" fill="${P.mag}" opacity=".18"/></g>
<path d="M-60 1300 Q 540 1110 1140 1300" fill="none" stroke="${P.arc}" stroke-width="5" filter="url(#glow2)"/>
<g transform="translate(540 1520)"><circle r="300" fill="#FF7A1A" opacity=".55" filter="url(#b30)"/><circle r="262" fill="url(#ball)"/><path d="M-262 0 H262 M0 -262 V262 M-185 -185 Q 0 0 -185 185 M185 -185 Q 0 0 185 185" stroke="#140602" stroke-width="7" fill="none"/><circle r="262" fill="none" stroke="#FFC070" stroke-width="3" opacity=".9" filter="url(#glow2)"/></g>
<rect y="1210" width="1080" height="140" fill="url(#fade)"/>
<rect width="1080" height="1350" filter="url(#grain)"/></svg>`;
}

const NEON2X = (id, sd = 3, halo = 14) => `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${sd}" result="a"/><feGaussianBlur stdDeviation="${halo}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
/** Hard-banded chrome (specular stripes between dark bands), tinted per product. */
const CHROME = (id, t = "#") => `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#07090a"/><stop offset=".05" stop-color="#4c555b"/><stop offset=".1" stop-color="#ffffff"/><stop offset=".13" stop-color="#b7c0c6"/><stop offset=".2" stop-color="#2a3035"/><stop offset=".4" stop-color="#0c0e10"/><stop offset=".52" stop-color="#5d666c"/><stop offset=".6" stop-color="#eef3f5"/><stop offset=".62" stop-color="#8b959b"/><stop offset=".78" stop-color="#15181b"/><stop offset=".9" stop-color="#aab3b9"/><stop offset=".94" stop-color="#ffffff"/><stop offset="1" stop-color="#22272b"/></linearGradient>`;

/** The chrome battery, left third: banded chrome cap and base, a glass tube with a double neon glow, 5 compartments. */
function battery(cells, rungs, P) {
  const svg = `<svg class="mv" viewBox="0 0 330 1020" preserveAspectRatio="none" aria-hidden="true"><defs>${CHROME("chrome")}
<linearGradient id="capV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
<linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="${P.neon}" stop-opacity=".22"/><stop offset=".12" stop-color="#020403" stop-opacity=".88"/><stop offset=".88" stop-color="#020403" stop-opacity=".88"/><stop offset="1" stop-color="${P.neon}" stop-opacity=".22"/></linearGradient>
${NEON2X("neonB", 3, 16)}</defs>
<rect x="112" y="2" width="106" height="40" rx="10" fill="url(#chrome)"/><rect x="112" y="2" width="106" height="40" rx="10" fill="url(#capV)"/><ellipse cx="165" cy="5" rx="50" ry="5" fill="#fff"/>
<rect x="44" y="34" width="242" height="62" rx="18" fill="url(#chrome)"/><rect x="44" y="34" width="242" height="62" rx="18" fill="url(#capV)"/>${[48, 60, 72, 84].map((y) => `<rect x="48" y="${y}" width="234" height="3" fill="#000" opacity=".55"/><rect x="48" y="${y + 3}" width="234" height="1.5" fill="#fff" opacity=".35"/>`).join("")}
<rect x="26" y="88" width="278" height="834" rx="38" fill="url(#glass)"/>
<rect x="26" y="88" width="278" height="834" rx="38" fill="none" stroke="${P.neon}" stroke-width="11" filter="url(#neonB)"/>
<rect x="26" y="88" width="278" height="834" rx="38" fill="none" stroke="${P.core}" stroke-width="3"/>
<rect x="40" y="104" width="10" height="800" rx="5" fill="#fff" opacity=".35"/><rect x="284" y="104" width="5" height="800" rx="2.5" fill="#fff" opacity=".2"/>
<rect x="8" y="912" width="314" height="84" rx="24" fill="url(#chrome)"/><rect x="8" y="912" width="314" height="84" rx="24" fill="url(#capV)"/>${[928, 948, 968].map((y) => `<rect x="14" y="${y}" width="302" height="3" fill="#000" opacity=".5"/><rect x="14" y="${y + 3}" width="302" height="1.5" fill="#fff" opacity=".35"/>`).join("")}
<rect x="8" y="912" width="314" height="84" rx="24" fill="none" stroke="${P.neon}" stroke-width="4" filter="url(#neonB)"/></svg>`;
  return `<div class="mtr5 bat" data-meter="battery">${svg}<div class="cells">${rungs.map((r) => compartment(cells, r, rungs.length)).join("")}</div></div>`;
}

/** The chrome rocket, left third: banded chrome nosecone and fins, double neon outline, a strong orange rim light, a big flame and billowing smoke. */
function rocket(cells, rungs, P) {
  const hull = "M165 4 C 245 80 290 200 290 330 L 290 840 L 40 840 L 40 330 C 40 200 85 80 165 4 Z";
  const r = seeded(23);
  const smoke = Array.from({ length: 26 }, () => { const x = -90 + r() * 510; const y = 960 + r() * 110; const rad = 28 + r() * 46; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(0)}" fill="${["#5A189A", "#9D4EDD", "#C13BFF", "#FF4FD8", "#7B2CBF"][Math.floor(r() * 5)]}" opacity="${(0.45 + r() * 0.4).toFixed(2)}"/>`; }).join("");
  const svg = `<svg class="mv" viewBox="0 0 330 1020" preserveAspectRatio="none" aria-hidden="true"><defs>${CHROME("hullm")}
<linearGradient id="win" x1="0" x2="1"><stop offset="0" stop-color="${P.neon}" stop-opacity=".25"/><stop offset=".14" stop-color="#05020a" stop-opacity=".9"/><stop offset=".86" stop-color="#05020a" stop-opacity=".9"/><stop offset="1" stop-color="${P.neon}" stop-opacity=".25"/></linearGradient>
<radialGradient id="flame" cx=".5" cy=".08" r=".95"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".22" stop-color="#FFF6C8"/><stop offset=".45" stop-color="#FFC83A"/><stop offset=".7" stop-color="#FF6A00" stop-opacity=".8"/><stop offset="1" stop-color="#FF2BD6" stop-opacity="0"/></radialGradient>
<linearGradient id="finG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0c26"/><stop offset=".35" stop-color="#cfc6dc"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".5" stop-color="#4a2a5e"/><stop offset=".85" stop-color="#FF7A00"/><stop offset="1" stop-color="#FFD27A"/></linearGradient>
${NEON2X("neonM", 3, 16)}<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter><filter id="soft6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<ellipse cx="165" cy="1000" rx="135" ry="230" fill="url(#flame)" filter="url(#soft)"/>
<g filter="url(#soft)">${smoke}</g>
<ellipse cx="165" cy="960" rx="74" ry="150" fill="url(#flame)" filter="url(#soft6)"/><ellipse cx="165" cy="925" rx="36" ry="90" fill="#FFF8DC" filter="url(#soft6)"/><ellipse cx="165" cy="905" rx="18" ry="48" fill="#FFFFFF"/>
<path d="M40 560 L 2 760 L 2 905 L 40 840 Z M290 560 L 328 760 L 328 905 L 290 840 Z" fill="url(#finG)"/>
<path d="M40 560 L 2 760 L 2 905 L 40 840 Z M290 560 L 328 760 L 328 905 L 290 840 Z" fill="none" stroke="${P.neon2}" stroke-width="6" filter="url(#neonM)"/>
<path d="${hull}" fill="url(#hullm)"/>
<path d="${hull}" fill="none" stroke="${P.neon}" stroke-width="11" filter="url(#neonM)"/><path d="${hull}" fill="none" stroke="${P.core}" stroke-width="2.5"/>
<path d="M50 840 L 50 330 C 50 210 92 96 165 18" fill="none" stroke="${P.neon2}" stroke-width="7" filter="url(#neonM)"/><path d="M280 330 L 280 840" stroke="${P.neon2}" stroke-width="5" filter="url(#neonM)"/>
<rect x="104" y="840" width="122" height="46" rx="6" fill="url(#hullm)"/><rect x="104" y="878" width="122" height="8" fill="#FF7A00" filter="url(#soft6)"/>
<path d="M165 70 C 228 130 262 220 264 330 L 264 826 L 66 826 L 66 330 C 68 220 102 130 165 70 Z" fill="url(#win)" stroke="${P.neon}" stroke-width="3"/>
<circle cx="165" cy="138" r="34" fill="url(#hullm)"/><circle cx="165" cy="138" r="24" fill="#12061f" stroke="${P.neon}" stroke-width="5" filter="url(#neonM)"/><circle cx="157" cy="130" r="7" fill="#fff" opacity=".85"/></svg>`;
  return `<div class="mtr5 rk" data-meter="rocket">${svg}<div class="cells">${rungs.map((r) => compartment(cells, r, rungs.length)).join("")}</div></div>`;
}

function compartment(cells, r, steps) {
  const top = r.step === steps;
  const mark = r.state === RUNG.COMPLETED ? "✓ " : r.state === RUNG.FAILED ? "✕ " : "";
  return `<div class="cp ${r.state}" data-rung="${r.state}"><span class="k">${esc(mark)}Step ${r.step}</span>${cell(cells, `ladder.m${r.step}`, `${top ? "" : "~"}${cents(r.milestoneCents)}`, "m")}<span class="t">(${top ? "Goal" : "Target"})</span></div>`;
}

function legPanel(cells, l, i, ctx) {
  const k = `leg${i + 1}`;
  if (l.placeholder) {
    return `<div class="leg ph" data-slot="${l.placeholder}"><div class="n">${i + 1}</div><div class="who">${cell(cells, `${k}.name`, V6_PLACEHOLDER.leg, "nm ph")}<div class="mt">${cell(cells, `${k}.odds`, V6_PLACEHOLDER.price, "chip dim")}${l.placeholder === "optional" ? `<span class="opt">${cell(cells, `${k}.optional`, "Optional")}</span>` : ""}</div></div><div class="rt"><span class="pk">Model win<br>probability</span>${cell(cells, `${k}.proj`, "Pending", "pv dim")}</div></div>`;
  }
  const t = teamOf(l.team.abbr, l.team.name);
  const odds = ctx.price && ctx.price.oddsFormat === "american" && american(ctx.price.price) ? cell(cells, `${k}.odds`, american(ctx.price.price), "chip odds") : l.oddsText ? cell(cells, `${k}.odds`, l.oddsText, "chip odds") : "";
  const oc = ctx.outcome ? cell(cells, `${k}.outcome`, { WIN: "Landed", LOSS: "Missed" }[ctx.outcome] ?? ctx.outcome, `oc ${ctx.outcome}`) : "";
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag>${cell(cells, `${k}.flag`, `⚑ ${l.flagText.join(" · ")}`)}</div>` : "";
  if (l.kind === "PROP") {
    // Level A: the model's probability. Level B: research evidence (hit counts), never shown as a probability.
    // Evidence: the engine's line ("Hit 8/10 L10 · 14/20 L20") or the template's windows; none when the line is not shown.
    const evText = l.evidenceText ?? (l.evidence ? `Hit ${l.evidence.l10} L10 · ${l.evidence.l20} L20` : null);
    const evBig = l.evidenceBig ?? l.evidence?.l10 ?? null;
    const right = l.level === "A" ? `<span class="pk">${cell(cells, `${k}.level`, PROP_LEVEL.A)}</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}` : `<span class="pk">${cell(cells, `${k}.level`, PROP_LEVEL.B)}</span>${evBig ? `${cell(cells, `${k}.evidenceBig`, evBig, "pv ev")}<span class="pk sm">last 10</span>` : cell(cells, `${k}.evidenceBig`, "Hit-rate research", "pv ev sm")}`;
    return `<div class="leg prop" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, l.player.name)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}</div>${l.lineText || odds || oc ? `<div class="mt">${l.lineText ? cell(cells, `${k}.line`, l.lineText, "chip line") : ""}${odds}${oc}</div>` : ""}${evText ? `<div class="evl">${cell(cells, `${k}.evidence`, evText)}</div>` : ""}${flag}</div><div class="rt">${right}</div></div>`;
  }
  return `<div class="leg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, t.name)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}${odds}${oc}</div>${flag}</div><div class="rt"><span class="pk">Model win<br>probability</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}</div></div>`;
}

const CSS = (P) => `<style>
.stage,.top{display:none!important}
.content .social{position:relative;z-index:3;margin-top:auto}
.content .disclosure{position:relative;z-index:3;font:700 19px/1.2 var(--display);letter-spacing:3px;color:rgba(247,247,242,.72);text-transform:uppercase}
.v5{position:absolute;left:-64px;top:-64px;width:1080px;height:1350px;--neon:${P.neon};--neon2:${P.neon2};--core:${P.core};--g1:${P.gold1};--g2:${P.gold2};--g3:${P.gold3};--n2x:0 0 0 1px var(--core),0 0 6px var(--neon),0 0 18px var(--neon),0 0 46px color-mix(in srgb,var(--neon) 70%,transparent)}
.plate{position:absolute;inset:0;width:1080px;height:1350px}
.mtr5{position:absolute;left:16px;top:170px;width:330px;height:1020px}
.mtr5.rk{left:4px;top:96px;width:352px;height:1100px}
.mtr5 .mv{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.bat .cells{position:absolute;left:40px;right:40px;top:104px;bottom:112px;display:flex;flex-direction:column-reverse;gap:10px}
.rk .cells{position:absolute;left:74px;right:74px;top:178px;bottom:236px;display:flex;flex-direction:column-reverse;gap:10px}
.cp{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:18px;border:3px solid var(--neon);background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,.03) 32%,rgba(0,0,0,.5));box-shadow:inset 0 2px 0 rgba(255,255,255,.4),inset 0 0 20px color-mix(in srgb,var(--neon) 30%,transparent),0 0 4px var(--neon),0 0 18px color-mix(in srgb,var(--neon) 70%,transparent);color:#EAF7EE;text-align:center;min-height:0}
.cp .k{font:900 30px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:#F5F7F2}
.cp .m{margin-top:6px;font:900 54px/1 var(--display);white-space:nowrap;background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent}
.cp .t{margin-top:6px;font:800 21px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:rgba(245,247,242,.78)}
.rk .cp .k{font-size:25px}.rk .cp .m{font-size:44px}.rk .cp .t{font-size:17px}.rk .cp:last-child{flex:1.35;border-radius:100px 100px 16px 16px;padding-top:30px}
.cp.active{border:4px solid #FFD54A;background:radial-gradient(120% 120% at 50% 35%,rgba(255,226,120,.85),rgba(230,140,0,.55) 50%,rgba(70,30,0,.85));box-shadow:0 0 0 2px #FFF3C0,0 0 10px #FFC400,0 0 40px #FFB000,0 0 80px rgba(255,170,0,.6),inset 0 0 26px rgba(255,240,170,.7)}
.cp.active .m{background:linear-gradient(180deg,#FFFFFF,#FFF0A0 45%,#FFC400);-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 2px 0 rgba(90,40,0,.8))}
.cp.active .k,.cp.active .t{color:#FFFFFF;text-shadow:0 2px 4px rgba(60,25,0,.9)}
.cp.completed{border-color:var(--neon);background:linear-gradient(180deg,color-mix(in srgb,var(--neon) 70%,#fff),color-mix(in srgb,var(--neon) 85%,#000));box-shadow:0 0 24px color-mix(in srgb,var(--neon) 80%,transparent)}
.cp.completed .k,.cp.completed .t{color:#04140a}.cp.completed .m{background:none;color:#04140a;-webkit-background-clip:initial;background-clip:initial}
.cp.failed{border-color:#FF4D5E;background:linear-gradient(180deg,rgba(255,77,94,.45),rgba(90,0,10,.55));box-shadow:0 0 22px rgba(255,77,94,.7)}
.cp.failed .m{background:none;color:#FFD0D5;-webkit-background-clip:initial;background-clip:initial}
.cp.upcoming{opacity:.95}
.rt5{position:absolute;left:366px;right:22px;top:36px;bottom:448px;display:flex;flex-direction:column;align-items:stretch}
.logo5{display:block;margin:0 auto;height:84px;filter:drop-shadow(0 0 10px rgba(57,255,20,.8)) drop-shadow(0 0 26px rgba(57,255,20,.45))}
.chip5{margin:10px auto 0;padding:10px 26px 8px;border-radius:999px;border:3px solid var(--neon);box-shadow:var(--n2x),inset 0 0 12px color-mix(in srgb,var(--neon) 35%,transparent);background:rgba(0,0,0,.82);font:800 26px/1 var(--display);letter-spacing:5px;text-transform:uppercase;color:#FFFFFF;white-space:nowrap}
.title5{margin-top:12px;text-align:center;font:900 italic 104px/.92 var(--headline);-webkit-text-stroke:2.5px #6B3000;text-transform:uppercase;white-space:nowrap;background:linear-gradient(180deg,#FFFDE8 0%,var(--g1) 18%,var(--g2) 55%,var(--g3) 92%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #A85400) drop-shadow(0 3px 0 #6B3000) drop-shadow(0 4px 0 #3A1800) drop-shadow(0 0 14px color-mix(in srgb,var(--g2) 85%,transparent)) drop-shadow(0 0 34px color-mix(in srgb,var(--g2) 55%,transparent))}
.goal5{margin-top:10px;text-align:center;font:900 italic 44px/1 var(--headline);letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;white-space:nowrap;text-shadow:0 3px 0 rgba(0,0,0,.9),0 0 18px rgba(255,255,255,.35)}
.pills5>b,.pills5>span{display:inline-block}.pills5{margin:14px auto 0;display:flex;align-items:center;border-radius:999px;border:3px solid var(--neon);box-shadow:var(--n2x);background:rgba(0,0,0,.85);overflow:hidden;white-space:nowrap}
.pills5>b{padding:12px 26px 9px;font:900 italic 36px/1 var(--headline);letter-spacing:1px;text-transform:uppercase;color:#2a1200;background:linear-gradient(180deg,#FFFBD0,#FFD23A 45%,var(--g2) 80%,var(--g3));border-radius:999px;box-shadow:0 0 10px #FFC400,0 0 26px rgba(255,190,0,.7),inset 0 2px 0 rgba(255,255,255,.8)}
.pills5>span{padding:12px 26px 9px;font:900 30px/1 var(--display);letter-spacing:3px;text-transform:uppercase;color:#F5F7F2}
.pills5>.st{border-left:2px solid rgba(255,255,255,.2)}.pills5>.st.LOST{color:#FF6B7A}.pills5 .st.HELD{color:#FFC14D}.pills5 .st.WON,.pills5 .st.COMPLETED{color:var(--neon)}.pills5 .st.FINISHED{color:#D7DEE5}
.pills5.three>b,.pills5.three>span{font-size:24px;padding:10px 14px 8px;letter-spacing:1px}
.legs5:has(>.leg:only-child){justify-content:center}
.legs5{flex:1;min-height:0;margin-top:24px;display:flex;flex-direction:column;justify-content:flex-start;gap:14px}
.leg{position:relative;display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:6px 16px;flex:none;min-height:132px;padding:14px 22px 12px;border-radius:22px;border:4px solid color-mix(in srgb,var(--c) 45%,#fff);background:linear-gradient(100deg,color-mix(in srgb,var(--c) 92%,#fff 8%) 0%,var(--c) 38%,color-mix(in srgb,var(--c) 55%,#000) 72%,color-mix(in srgb,var(--c) 30%,#000) 100%);box-shadow:0 0 0 1px rgba(255,255,255,.6),0 0 8px color-mix(in srgb,var(--c) 90%,#fff),0 0 26px var(--c),0 0 54px color-mix(in srgb,var(--c) 60%,transparent),inset 0 3px 0 rgba(255,255,255,.35),inset 0 -14px 24px rgba(0,0,0,.35);min-width:0}
.leg .n{font:900 italic 76px/1 var(--headline);background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent;text-align:center;padding-right:8px;border-right:2px solid rgba(255,255,255,.18)}
.leg .who{min-width:0;display:flex;flex-direction:column;gap:7px}
.leg .nm{display:block;font:900 48px/1 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;color:#FFFFFF;text-shadow:0 2px 0 rgba(0,0,0,.75),0 0 10px rgba(0,0,0,.5)}
.leg .nm.ph{font-size:28px;line-height:1.08;white-space:normal;color:rgba(247,247,242,.92)}
.leg .mt{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;font:800 22px/1 var(--display);color:#FFFFFF;text-shadow:0 1px 3px rgba(0,0,0,.8);white-space:nowrap;min-width:0}
.leg .tg{font:900 21px/1 var(--headline);padding:5px 8px 3px;border-radius:7px;background:var(--cink);color:var(--c);text-shadow:none;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.leg .chip{font:900 22px/1 var(--display);padding:6px 10px 4px;border-radius:8px;white-space:nowrap}
.leg .chip.odds{background:#F5F7F2;color:#050706}.leg .chip.line{background:#000;color:#FFFFFF;box-shadow:0 0 0 2px var(--neon),0 0 10px var(--neon);text-shadow:none}.leg .chip.dim{background:rgba(255,255,255,.12);color:rgba(247,247,242,.8);border:1px dashed rgba(255,255,255,.35)}
.leg .opt{font:800 15px/1 var(--display);letter-spacing:2px;text-transform:uppercase;color:rgba(247,247,242,.6)}
.leg .evl{font:800 19px/1.1 var(--display);letter-spacing:1px;color:#E6F6FF;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap}
.leg .fl{font:800 16px/1.12 var(--display);color:#FFE27A;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:normal;max-height:2.4em;overflow:hidden}
.leg .rt{text-align:center;padding-left:16px;border-left:2px solid rgba(255,255,255,.35);min-width:150px}
.leg .pk{display:block;font:900 18px/1.15 var(--display);letter-spacing:1px;text-transform:uppercase;color:#FFE27A;text-shadow:0 1px 3px rgba(0,0,0,.9)}.leg .pk.sm{font-size:13px;color:rgba(255,255,255,.8)}
.leg .pv{display:block;margin-top:4px;font:900 72px/1 var(--display);color:#FFFFFF;white-space:nowrap;text-shadow:0 3px 0 rgba(0,0,0,.6),0 0 16px rgba(255,255,255,.45)}
.leg .pv.ev.sm{font-size:24px;white-space:normal;line-height:1.1}
.leg .pv.dim{font-size:28px;color:rgba(247,247,242,.6)}.leg .pv.ev{font-size:46px;color:#BFE7FF}
.leg .oc{font:900 18px/1 var(--headline);padding:5px 8px 3px;border-radius:6px;text-transform:uppercase}.leg .oc.WIN{background:var(--neon);color:#04140a}.leg .oc.LOSS{background:#FF4D5E;color:#1a0004}
.leg.prop .who{gap:4px}.leg.prop .nm{font-size:42px}.leg.prop .chip{padding:4px 9px 3px}.leg.prop .mt{font-size:20px}
.leg.ph{border-style:dashed;border-color:var(--neon);--c:color-mix(in srgb,var(--neon) 30%,#06080a);background:linear-gradient(100deg,color-mix(in srgb,var(--neon) 26%,rgba(0,0,0,.85)),rgba(0,0,0,.85));box-shadow:var(--n2x)}
.plan5{position:relative;margin-top:26px;height:84px;flex:none;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:22px;border:3px solid var(--neon);background:rgba(0,0,0,.86);box-shadow:var(--n2x);white-space:nowrap}
.plan5 .lb{position:absolute;top:-19px;left:50%;transform:translateX(-50%);padding:6px 20px 4px;border-radius:999px;border:3px solid var(--neon);background:#000;box-shadow:var(--n2x);font:900 22px/1 var(--display);letter-spacing:2px;text-transform:uppercase;color:#FFFFFF}
.plan5 .f,.plan5 .to{font:900 46px/1 var(--display);color:#FFFFFF;text-shadow:0 0 12px rgba(255,255,255,.4)}.plan5 .ar{font:900 40px/1 var(--display);color:#FFC400;text-shadow:0 0 10px #FFB000}.plan5 .x{font:800 26px/1 var(--display);color:rgba(255,255,255,.88)}
.held5{flex:1;min-height:0;margin-top:28px;margin-bottom:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:26px 30px;text-align:center;border-radius:26px;border:4px solid #FFC400;background:radial-gradient(120% 90% at 50% 0%,rgba(255,196,0,.22),rgba(0,0,0,.9) 60%);box-shadow:0 0 0 1px #FFF3C0,0 0 10px #FFC400,0 0 34px rgba(255,180,0,.7),0 0 70px rgba(255,160,0,.35),inset 0 0 30px rgba(255,196,0,.18)}
.held5 .hk{font:900 italic 78px/1 var(--headline);text-transform:uppercase;background:linear-gradient(180deg,#FFFDE8,var(--g1) 25%,#FFC400 60%,#B85C00);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #6B3000) drop-shadow(0 0 16px rgba(255,190,0,.7))}
.held5 .hs{font:900 36px/1 var(--display);letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;text-shadow:0 0 12px rgba(255,255,255,.35)}
.held5 .hr{max-width:560px;font:700 28px/1.3 var(--display);color:rgba(255,255,255,.92)}
.held5 .hn{font:800 22px/1.2 var(--display);letter-spacing:1px;text-transform:uppercase;color:var(--neon);text-shadow:0 0 10px var(--neon)}
.held5 .hx{margin-top:4px;padding:8px 18px 6px;border-radius:999px;border:2px solid rgba(255,255,255,.5);font:800 20px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:#FFFFFF}
.comb5.held .k{font:900 28px/1 var(--display);letter-spacing:2px;color:#FFFFFF}
.money5 .pay.hold .v{font-size:56px}
.stat5{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;text-align:center}
.stat5 .k{font:900 italic 66px/1 var(--headline);text-transform:uppercase;background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat5 .c{font:700 28px/1.3 var(--display);color:rgba(247,247,242,.86)}
.comb5{position:absolute;left:366px;right:22px;top:912px;height:80px;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:999px;border:3px solid var(--neon);background:rgba(0,0,0,.88);box-shadow:var(--n2x),inset 0 0 18px color-mix(in srgb,var(--neon) 30%,transparent);white-space:nowrap}
.comb5 .k{font:800 25px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:#F5F7F2}
.comb5 .v{font:900 54px/1 var(--display);text-transform:uppercase;color:var(--neon);text-shadow:0 0 6px var(--neon),0 0 20px var(--neon)}
.comb5 .chk{display:flex;align-items:center;gap:8px;font:900 16px/1.1 var(--display);letter-spacing:2px;text-transform:uppercase;color:var(--neon)}
.comb5 .pre{font:900 16px/1 var(--display);letter-spacing:2px;text-transform:uppercase;color:#FFC14D;padding:6px 10px 4px;border:2px solid currentColor;border-radius:999px}
.money5{position:absolute;left:366px;right:22px;top:1006px;height:160px;display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:12px}
.money5>div{display:flex;flex-direction:column;justify-content:center;border-radius:20px;padding:10px 8px;text-align:center;border:3px solid rgba(255,255,255,.55);background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(0,0,0,.9) 45%);box-shadow:0 0 14px rgba(255,255,255,.18),inset 0 2px 0 rgba(255,255,255,.3)}
.money5 .k{font:800 23px/1.05 var(--display);letter-spacing:1px;text-transform:uppercase;color:rgba(247,247,242,.9)}
.money5 .v{display:block;margin-top:8px;font:900 52px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.money5 .pay{border:4px solid #FFE066;background:radial-gradient(130% 120% at 50% 20%,rgba(255,215,80,.6),rgba(150,80,0,.55) 55%,rgba(25,12,0,.95));box-shadow:0 0 0 2px #FFF6C8,0 0 14px #FFC400,0 0 44px #FFB000,0 0 90px rgba(255,170,0,.7),inset 0 0 30px rgba(255,230,140,.55)}
.money5 .pay .k{color:#FFFFFF;text-shadow:0 2px 0 rgba(80,35,0,.9),0 0 10px rgba(255,200,60,.8)}.money5 .pay .v{font-size:64px;background:linear-gradient(180deg,#FFFFFF 10%,#FFF3B0 45%,#FFC400);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #7A3A00) drop-shadow(0 0 12px rgba(255,210,60,.95)) drop-shadow(0 0 26px rgba(255,180,0,.7))}
.money5 .pro .v{color:var(--neon);text-shadow:0 0 6px var(--neon),0 0 18px color-mix(in srgb,var(--neon) 70%,transparent)}
.money5 .v.pend{font-size:34px;text-transform:uppercase;color:rgba(247,247,242,.72)}
.money5 .pay .v.pend{font-size:36px;color:#FFFFFF;background:none;-webkit-background-clip:initial;background-clip:initial;filter:drop-shadow(0 0 10px rgba(255,200,60,.9))}
.money5 .sub{margin-top:6px;font:700 16px/1.1 var(--display);letter-spacing:2px;text-transform:uppercase;color:rgba(247,247,242,.6)}
.content{justify-content:flex-end}
.content .social{margin-top:0;padding-top:0}
.rib5{position:absolute;top:0;left:0;right:0;z-index:9;text-align:center;font:900 22px/36px var(--headline);letter-spacing:.12em;color:#1a0f00;background:#FFC14D;text-transform:uppercase}
.rib5.t{background:#FF3B6B;color:#fff}
</style>`;

const TARGET_ICON = `<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="20" fill="#E8332A"/><circle cx="23" cy="23" r="14" fill="#FFFFFF"/><circle cx="23" cy="23" r="8" fill="#E8332A"/><path d="M23 23 L42 4 M36 4 H42 V10" stroke="#FFC400" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
const PAUSE_ICON = `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="#FFC400" stroke-width="5"/><rect x="21" y="18" width="8" height="28" rx="2" fill="#FFC400"/><rect x="35" y="18" width="8" height="28" rx="2" fill="#FFC400"/></svg>`;
/** The engine's held reason in plain words: known codes map to a sentence; prose passes through (dashes become dots); none falls back to the rule. */
const HELD_REASON = Object.freeze({ NO_ELIGIBLE_CARD: "No card met the qualification rules today.", NO_QUALIFIED_CARD: "No card met the qualification rules today.", NO_SLATE: "There are no eligible games on today's slate.", PRICE_UNAVAILABLE: "Prices for the qualifying card could not be verified in time.", BELOW_EDGE: "No card cleared the minimum model edge today." });
export function heldReasonText(reason) {
  if (!reason) return HELD_REASON.NO_ELIGIBLE_CARD;
  const r = String(reason).trim();
  if (HELD_REASON[r]) return HELD_REASON[r];
  if (/^[A-Z0-9_]+$/.test(r)) return HELD_REASON.NO_ELIGIBLE_CARD;
  const t = r.replace(/\s*[—–]\s*/g, " · ").replace(/\s+/g, " ");
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
const CHECK = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 15.5 L13 20 L22 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** One V6 card. `model` as bbmCardV4; legs may also be props: { kind: "PROP", player, team, opponent, home, tipUtc, lineText, oddsText?, level: "A"|"B", projectionText?, evidence: { l10, l20 } }. */
export function bbmCardV6(model, { testData = false } = {}) {
  const P = PRODUCT[model.product];
  if (!P) throw new Error(`no V6 design for ${model.product}`);
  if ((model.legs ?? []).length > RULES_V2.maxLegs) throw new Error(`${model.legs.length} legs: rules v2 take at most ${RULES_V2.maxLegs}`);
  if (!Object.values(BADGE).includes(model.badge)) throw new Error(`status ${model.badge} is not in the public vocabulary`);
  for (const l of model.legs ?? []) if (l.kind === "PROP" && l.level === "B" && l.projectionText) throw new Error("a Level B prop never carries a probability");
  const cells = {};
  const tpl = model.template === true;
  const stepWord = model.view === VIEW.COMPLETE || model.view === VIEW.FINISHED_SHORT ? `${model.rungs.filter((r) => r.state === RUNG.COMPLETED).length} of ${model.steps} won` : `Step ${model.step} of ${model.steps}`;
  const status = model.badge === BADGE.ACTIVE ? "" : `<span class="st ${String(model.badge).split(" ")[0]}">${cell(cells, "status", STATUS_WORD[model.badge] ?? model.badge)}</span>`;
  const head = `<img class="logo5" src="${logoDataUri()}" alt=""><div style="text-align:center"><span class="chip5" style="display:inline-block">${cell(cells, "chip", chipText(model.date))}</span></div><div class="title5">${esc(P.name)}</div><div class="goal5">${cell(cells, "goal", `${cents(model.baseCents)} → ${cents(model.targetCents)} challenge`)}</div><div style="text-align:center"><span class="pills5${status ? " three" : ""}" style="display:inline-flex"><b>${cell(cells, "lane", `Lane ${model.letter}`)}</b><span>${cell(cells, "step", stepWord)}</span>${status}</span></div>`;
  const meter = model.product === "moonshot" ? rocket(cells, model.rungs, P) : battery(cells, model.rungs, P);
  const outs = Object.fromEntries((model.legResults ?? []).map((r) => [r.legId, r.outcome]));
  let mid; let bottom = "";
  if ([VIEW.CARD, VIEW.WON, VIEW.BUSTED].includes(model.view) && (model.legs ?? []).length) {
    mid = `<div class="legs5">${model.legs.map((l, i) => legPanel(cells, l, i, { price: model.view === VIEW.CARD ? model.payout?.legs?.[l.legId] : null, outcome: model.view === VIEW.CARD || l.placeholder ? null : outs[l.legId] ?? "PENDING" })).join("")}</div>`;
    const target = model.rungs[model.step - 1]?.milestoneCents;
    // STEP n PLAN: the lane's tracked bankroll to this step's milestone (approximate except the goal), from the engine record.
    if (model.view === VIEW.CARD && model.bankrollCents > 0 && target) mid += `<div class="plan5" data-plan><span class="lb">${cell(cells, "plan.label", `Step ${model.step} plan`)}</span>${TARGET_ICON}${cell(cells, "plan.from", cents(model.bankrollCents), "f")}<span class="ar">→</span>${cell(cells, "plan.to", `${model.step === model.steps ? "" : "~"}${cents(target)}`, "to")}${cell(cells, "plan.mult", `(≈${(target / model.bankrollCents).toFixed(1)}×)`, "x")}</div>`;
    if (model.view === VIEW.CARD) {
      const stepTarget = model.rungs[model.step - 1]?.milestoneCents;
      const am = model.payout ? american(model.payout.combinedAmerican) : null;
      const verified = !tpl && model.payout && !model.payout.preliminary && !model.payout.fixture;
      const tag = verified ? `<span class="chk">${CHECK}${cell(cells, "price.verified", "Verified odds")}</span>` : model.payout?.preliminary ? `<span class="pre">${cell(cells, "price.preliminary", "Preliminary odds")}</span>` : "";
      bottom += `<div class="comb5"><span class="k">${esc(model.payout?.estimate ? "Combined odds (estimate)" : "Combined odds (leg product)")}</span>${cell(cells, "price.combined", am ?? V6_PLACEHOLDER.price, "v")}${tag}</div>`;
      const stake = `<div><div class="k">Tracked stake</div>${cell(cells, "money.wager", model.bankrollCents == null ? "Withheld" : cents(model.bankrollCents), "v")}</div>`;
      if (tpl || !model.payout) bottom += `<div class="money5">${stake}<div class="pay"><div class="k">Potential payout</div>${cell(cells, "money.payoutPending", V6_PLACEHOLDER.payout, "v pend")}<div class="sub">${cell(cells, "money.targetNote", `Step ${model.step} target ~${cents(stepTarget)}`)}</div></div><div><div class="k">Potential profit</div>${cell(cells, "money.profitPending", V6_PLACEHOLDER.payout, "v pend")}</div></div>`;
      else bottom += `<div class="money5">${stake}<div class="pay" data-money="payout"><div class="k">Potential payout</div>${cell(cells, "money.payout", cents(model.payout.grossCents), "v")}</div><div class="pro"><div class="k">Potential profit</div>${cell(cells, "money.profit", cents(model.payout.profitCents), "v")}</div></div>`;
    }
  } else {
    if (model.view === VIEW.NO_ELIGIBLE_CARD) {
      // PD 2026-11-04: the held state is a designed card. No picks, no prices, never VERIFIED; the engine's reason in plain words.
      const target = model.rungs[model.step - 1]?.milestoneCents;
      mid = `<div class="held5" data-held><div class="hi">${PAUSE_ICON}</div><div class="hk">${cell(cells, "held.title", "Lane held")}</div><div class="hs">${cell(cells, "held.sub", "No qualified card")}</div><div class="hr">${cell(cells, "held.reason", heldReasonText(model.heldReason))}</div><div class="hn">${cell(cells, "held.rule", `Step ${model.step} carries to the next slate`)}</div>${model.researchLine ? `<div class="hx">${cell(cells, "held.research", "Research analysis on gametimepicks.com")}</div>` : ""}</div>`;
      bottom += `<div class="comb5 held">${cell(cells, "held.bar", "No picks today · bankroll held", "k")}</div>`;
      bottom += `<div class="money5"><div><div class="k">Tracked bankroll</div>${model.bankrollCents == null ? cell(cells, "money.wager", "Withheld", "v") : cell(cells, "money.wager", cents(model.bankrollCents), "v")}</div><div class="pay hold"><div class="k">Step ${model.step} target</div>${cell(cells, "held.target", `${model.step === model.steps ? "" : "~"}${cents(target)}`, "v")}</div><div><div class="k">Challenge goal</div>${cell(cells, "held.goal", cents(model.targetCents), "v")}</div></div>`;
    } else {
      const note = model.view === VIEW.COMPLETE ? ["Goal reached", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : model.view === VIEW.FINISHED_SHORT ? ["Finished short", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : ["Lane busted", ""];
      mid = `<div class="stat5"><div class="k">${cell(cells, "status.note", note[0])}</div>${note[1] ? `<div class="c">${cell(cells, "status.rule", note[1])}</div>` : ""}</div>`;
    }
  }
  const rib = [tpl ? TEMPLATE_RIBBON : null, testData ? TEST_RIBBON : null, model.payout?.fixture ? SAMPLE_PRICE_RIBBON : null].filter(Boolean);
  const ribbon = rib.length ? `<div class="rib5 ${testData && !tpl ? "t" : ""}">${esc(rib.join(" · "))}</div>` : "";
  const body = `${CSS(P)}<div class="v5 ${P.cls}">${scene(P)}${meter}<div class="rt5">${head}${mid}</div>${bottom}${ribbon}</div>`;
  const html = shell({ chip: "", body, review: false, disclosure: V6_FOOTER }).replace(/<div class="rg">[^<]*<\/div>/g, "");
  return { html, cells, laneId: model.laneId, view: model.view, badge: model.badge, template: tpl, preliminary: model.payout?.preliminary === true, testData, samplePrice: model.payout?.fixture === true, priced: model.payout != null, disclosure: V6_FOOTER, design: BBM_V6_DESIGN_VERSION };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")]));
const PRICE_TEXT = /[+−-]\d{3}\b|\bparlay\b|\bunder\b|×/i;
/** [] when a V6 card is clean. */
export function verifyBbmCardV6(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " "));
  for (const r of V6_REMOVED) if (r.test(text)) e.push(`removed item on image: ${text.match(r)[0]}`);
  if (!text.includes(V6_FOOTER)) e.push("the 21+ line is missing");
  if ((text.match(/\bStep \d+ of \d+\b/gi) ?? []).length > 1) e.push("the lane step is stated twice");
  if (card.template) {
    if (!text.toLowerCase().includes(TEMPLATE_RIBBON.toLowerCase())) e.push("a template without its TEMPLATE ribbon");
    if ("price.verified" in got || /verified odds/i.test(text)) e.push("a template carries VERIFIED");
    if ("money.payout" in got || "money.profit" in got) e.push("a template carries a payout or profit");
    if (card.priced) e.push("a template carries a price");
  } else if (/template preview/i.test(text)) e.push("TEMPLATE ribbon on a real card");
  if (!card.priced && "price.verified" in got) e.push("VERIFIED on unpriced content");
  // A held card shows no picks and no prices, and is never VERIFIED.
  if (card.view === VIEW.NO_ELIGIBLE_CARD && Object.keys(got).some((k) => /^price\.|^money\.(payout|profit)|^leg\d|^plan\./.test(k))) e.push("a held card carries a pick or a price");
  // A hit rate is research evidence, never a probability: no "%" in any evidence cell.
  for (const [k, v] of Object.entries(got)) if (/\.(evidence|evidenceBig)$/.test(k) && /%/.test(v)) e.push(`${k}: a hit rate shown as a percentage`);
  const priceCells = Object.entries(got).filter(([k]) => /\.(odds|line)$|^price\.|^plan\.mult$/.test(k));
  let shown = text; for (const [, v] of priceCells) shown = shown.split(v).join(" ");
  shown = shown.replace(/Combined odds \((leg product|estimate)\)/gi, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (PRICE_TEXT.test(shown)) e.push(`price text outside its cells: ${shown.match(PRICE_TEXT)[0]}`);
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(shown), ...statLabelProblems(shown));
  if (!card.template) {
    const verified = card.priced && !card.preliminary && !card.samplePrice;
    if (verified !== ("price.verified" in got)) e.push(verified ? "a verified price without its badge" : "a verified badge without a verified real price");
  }
  return e;
}

/** Layout problems in a real browser (same rules as V4, over V6 blocks). */
export async function bbmV6LayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const clipped = [...document.querySelectorAll("[data-cell]")].filter((e) => { const r = e.getBoundingClientRect(); const block = getComputedStyle(e).display !== "inline"; return (block && e.scrollWidth > e.clientWidth + 1) || r.right > 1080 - 10 || r.left < 10 || r.bottom > 1350 - 6; }).map((e) => `${e.dataset.cell}=${e.textContent}`);
      const rt = document.querySelector(".rt5").getBoundingClientRect();
      const blocks = [".logo5", ".chip5", ".title5", ".goal5", ".pills5", ".legs5,.stat5,.held5"].map((s) => document.querySelector(s)).filter(Boolean).map((e) => ({ s: e.className, r: e.getBoundingClientRect() }));
      const overlaps = []; for (let i = 1; i < blocks.length; i += 1) if (blocks[i].r.top < blocks[i - 1].r.bottom - 1) overlaps.push(`${blocks[i - 1].s} / ${blocks[i].s}`);
      const legs = document.querySelector(".legs5")?.getBoundingClientRect();
      const comb = document.querySelector(".comb5")?.getBoundingClientRect(); const money = document.querySelector(".money5")?.getBoundingClientRect(); const social = document.querySelector(".social")?.getBoundingClientRect();
      if (legs && comb && legs.bottom > comb.top - 6) overlaps.push("legs / combined bar");
      const plan = document.querySelector(".plan5")?.getBoundingClientRect();
      if (plan && legs && plan.top < legs.bottom + 18) overlaps.push("legs / plan");
      if (plan && comb && plan.bottom > comb.top - 6) overlaps.push("plan / combined bar");
      if (rt && comb && rt.bottom > comb.top + 2 && !legs) overlaps.push("status / combined bar");
      if (comb && money && comb.bottom > money.top - 2) overlaps.push("combined bar / money");
      if (money && social && money.bottom > social.top - 2) overlaps.push("money / footer");
      const spill = legs ? [...document.querySelectorAll(".leg")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < legs.top - 1 || r.bottom > legs.bottom + 1; }).length : 0;
      const cpOut = [...document.querySelectorAll(".cp,.leg")].filter((e) => e.scrollHeight > e.clientHeight + 2).length + [...document.querySelectorAll("[data-flag]")].filter((e) => e.scrollHeight > e.clientHeight + 2).length;
      const small = [...document.querySelectorAll("[data-cell]")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.dataset.cell);
      return { clipped, overlaps, spill, cpOut, small, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    });
    const n = c.name ?? c.laneId;
    if (m.clipped.length) errs.push(`${n}: clipped ${m.clipped.join(" | ")}`);
    if (m.overlaps.length) errs.push(`${n}: overlap ${m.overlaps.join(", ")}`);
    if (m.spill) errs.push(`${n}: ${m.spill} leg panel(s) spill`);
    if (m.cpOut) errs.push(`${n}: ${m.cpOut} compartment(s) or flag line(s) overflow`);
    if (m.small.length) errs.push(`${n}: text under 13px ${m.small.join(", ")}`);
    if (m.fit.length || m.page) errs.push(`${n}: does not fit ${m.fit.join(" | ")}`);
  }
  await page.close();
  return errs;
}
