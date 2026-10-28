/**
 * SOCIAL GRAPHICS V2 RENDERER — view-model (recap/social-v2.mjs) → 1080×1350 PNG. PROTOTYPE (v2.1, founder review 2).
 *
 * Reuses the existing pipeline (render-png.mjs: offline Chromium, every request aborted, logo inlined from
 * app/public/brand). Photo-free until licensed photography exists: no player images, no league or club logos, no jersey
 * numbers — team identity is the verified name, abbreviation and colours. A deterministic fit pass shrinks long names;
 * the render FAILS if any text still overflows. Same inputs and fonts → same bytes on one machine.
 *
 * PUBLIC TERMS (founder 2026-10-28) are a presentation mapping only: TERMS below is the single place social wording
 * lives. Internal names (OFFICIAL_FORECAST, forecast-of-record, frozen snapshots) are untouched; a "Prediction" here is
 * the published Official Forecast for that game, never a product pick.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { escapeHtml as esc, loadChromium, pngSize } from "./render-png.mjs";

export const SOCIAL_TEMPLATE = "gtp-social@2.1";
const DIR = path.join(CC_ROOT, "render/templates/social-v2");
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");

/** Social terminology → the canonical concept it presents (presentation layer only). */
export const TERMS = Object.freeze({
  prediction: "GameTimePicks Prediction",     // OFFICIAL_FORECAST of the game winner
  predictedWinner: "Predicted Winner",          // the published side
  winProbability: "Win Probability",            // the published side's probability
  topTd: "Top 3 TD Predictions",                // anytime_td forecasts of record / latest published
  vsFinal: "Prediction vs. Final",
  correct: "Prediction Correct",
  missed: "Prediction Missed",
  top5Td: "Top 5 TD Predictions",
  top5Proj: "Top 5 Projections",
});
/** Short disclosures kept on every graphic. */
export const DISCLOSURE = { NFL: "Model prediction · not betting advice · not affiliated with the NFL or its clubs", NBA: "Model prediction · not betting advice · not affiliated with the NBA or its teams" };

const slab = (t) => `<div class="slab" style="--c:${esc(t.color)};--a:${esc(t.accent)};--cink:${esc(t.ink)}">
  <div class="city" data-fit>${esc(t.city)}</div><div class="nick" data-fit>${esc(t.nickname)}</div></div>`;
const tag = (team, color, ink) => `<span class="tag" style="--c:${esc(color)};--cink:${esc(ink)}">${esc(team)}</span>`;
const pctNum = (d) => String(d).replace("%", "");
const ring = (p) => {
  const r = 230, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, Number(p)));
  return `<svg viewBox="0 0 520 520" width="520" height="520"><circle cx="260" cy="260" r="${r}" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.1)" stroke-width="26"/>
    <circle cx="260" cy="260" r="${r}" fill="none" stroke="#39FF88" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 260 260)"/></svg>`;
};

function postgameBody(m) {
  const hit = m.result === "WIN";
  const tie = m.result === "TIE";
  const td = m.td && m.td.complete ? m.td : null; // only a completely graded cohort is shown (founder 2026-10-28)
  const tdHtml = td ? `<div class="panel tds">
      <div class="head"><div class="label">${esc(TERMS.topTd)}</div><div class="count">${td.hits} of ${td.shown} scored</div></div>
      <div class="row">${td.candidates.map((c) => `<div class="td ${c.outcome}"><div class="m">${c.outcome === "hit" ? "✓" : "✗"}</div>
        <div style="min-width:0"><div class="n" data-fit>${esc(c.last)}</div><div class="p">${esc(c.team)} · ${esc(c.probabilityDisplay)}</div></div></div>`).join("")}</div></div>` : "";
  return `<div class="kicker">${esc(TERMS.vsFinal)}</div>
    <div class="hero">
      <div class="side"><div class="score ${m.winner === "away" ? "" : "lose"}">${esc(m.finalAway)}</div>${slab(m.away)}</div>
      <div class="mid"><span>FINAL</span></div>
      <div class="side"><div class="score ${m.winner === "home" ? "" : "lose"}">${esc(m.finalHome)}</div>${slab(m.home)}</div>
    </div>
    <div class="banner ${hit ? "hit" : "miss"}"><div class="mark">${hit ? "✓" : "✗"}</div><div class="t">${tie ? "Game tied" : hit ? esc(TERMS.correct) : esc(TERMS.missed)}</div></div>
    <div class="recall"><span class="k">${esc(TERMS.predictedWinner)}</span><span class="w">${esc(m.favouredTeam.nickname)}</span><span class="v">${esc(m.winProbabilityDisplay)}</span><span class="k">${esc(TERMS.winProbability)}</span></div>
    ${tdHtml}
    <div class="foot">Prediction frozen before kickoff <b>${esc(m.frozenLine)}</b><br>${esc(DISCLOSURE.NFL)}</div>`;
}

function pregameBody(m) {
  const pct = pctNum(m.winProbabilityDisplay);
  return `<div class="kicker">${esc(TERMS.prediction)}</div>
    <div class="hero pre"><div class="side">${slab(m.away)}</div><div class="mid"><span>@</span></div><div class="side">${slab(m.home)}</div></div>
    <div class="ringwrap">${ring(m.winProbability)}<div class="in"><div class="k">${esc(TERMS.winProbability)}</div><div class="num">${esc(pct)}<small>%</small></div></div></div>
    <div class="winner"><div class="k">${esc(TERMS.predictedWinner)}</div>${slab(m.favouredTeam)}</div>
    <div class="strip"><div><b data-fit>${esc(m.kickoffDay)}</b><span>Kickoff ${esc(m.kickoffTime)}</span></div>${m.venue ? `<div><b data-fit>${esc(m.venue)}</b><span>Venue</span></div>` : ""}<div><b data-fit>${esc(m.frozenShort)}</b><span>${esc(m.stampShort)}</span></div></div>
    <div class="legal">${esc(DISCLOSURE.NFL)}</div>`;
}

function touchdownsBody(m) {
  const graded = Boolean(m.showResults);
  // columns 2 · 1 · 3 so the top prediction sits in the centre
  const order = [m.candidates[1], m.candidates[0], m.candidates[2]].filter(Boolean);
  return `<div class="kicker">${esc(TERMS.topTd)}</div>
    <div class="sub" data-fit>${esc(m.away.abbr)} @ ${esc(m.home.abbr)} · ${esc(m.kickoffLine)}</div>
    <div class="feat" style="grid-template-columns:${order.map((c) => (c.rank === 1 ? "1.16fr" : "1fr")).join(" ")}">${order.map((c) => `<div class="pcol r${c.rank}" style="--c:${esc(c.accent)}">
        <div class="bign">${c.rank}</div>
        <div class="rk">#${c.rank}</div>
        <div class="first" data-fit>${esc(c.first)}</div><div class="last" data-fit>${esc(c.last)}</div>
        <div class="tm">${tag(c.team, c.color, c.ink)}</div>
        <div class="pv">${esc(c.probabilityDisplay)}</div><div class="pl">TD PROBABILITY</div>
        ${String(c.participation).toUpperCase() === "QUESTIONABLE" ? `<div class="fl"><span class="flag" style="font:700 20px/1 var(--display);letter-spacing:3px;padding:7px 10px 4px;border-radius:6px;border:1px solid rgba(255,178,63,.7);color:var(--miss)">QUESTIONABLE</span></div>` : ""}
        ${graded ? `<div class="rs ${c.outcome}">${c.outcome === "hit" ? "✓ SCORED" : c.outcome === "miss" ? "✗ NO TD" : "NOT GRADED"}</div>` : ""}
      </div>`).join("")}</div>
    <div class="foot">Predicted chance to score a TD if he plays · passing TDs don't count · not a guarantee<br>
      ${m.mode === "record" ? "Published before kickoff" : "Latest published"} <b>${esc(m.frozenLine)}</b> · not betting advice · not affiliated with the NFL or its clubs</div>`;
}

function top5Body(m) {
  return `<div class="kicker">${esc(m.isTd ? TERMS.top5Td : TERMS.top5Proj)}</div>
    <div class="title" style="font-size:84px;margin-top:14px">${esc(m.title)}</div>
    <div class="t5">${m.rows.map((r) => `<div class="t5row r${r.rank}" style="--c:${esc(r.accent)}">
        <div class="n">${r.rank}</div>
        <div style="min-width:0"><div class="nm" data-fit>${esc(r.name)}</div><div class="sb">${tag(r.team, r.color, r.ink)}<span>vs ${esc(r.opponent)} · ${esc(r.kickoffShort)}</span></div></div>
        <div class="v"><b>${esc(r.valueDisplay)}</b><span>${esc(r.unit)}</span></div></div>`).join("")}</div>
    <div class="foot">${esc(m.note)}<br>Frozen before the first kickoff <b>${esc(m.frozenLine)}</b> · not betting advice · not affiliated with the NFL or its clubs</div>`;
}

function nbaPregameBody(m) {
  return `<div class="kicker">${esc(TERMS.prediction)}</div>
    <div class="hero pre"><div class="side">${slab(m.away)}</div><div class="mid"><span>@</span></div><div class="side">${slab(m.home)}</div></div>
    <div class="nbawin"><div class="k">${esc(TERMS.predictedWinner)}</div>${slab(m.favouredTeam)}<div class="abbr">${esc(m.favouredTeam.abbr)}</div></div>
    <div class="strip"><div><b data-fit>${esc(m.tipDay)}</b><span>Tip-off ${esc(m.tipTime)}</span></div><div><b data-fit>${esc(m.frozenShort)}</b><span>Frozen before tip-off</span></div></div>
    <div class="legal">${esc(DISCLOSURE.NBA)}</div>`;
}

function nbaFinalBody(m) {
  return `<div class="kicker">Final score</div>
    <div class="hero">
      <div class="side"><div class="score ${m.winner === "away" ? "" : "lose"}" style="font-size:250px">${esc(m.finalAway)}</div>${slab(m.away)}</div>
      <div class="mid"><span>FINAL</span></div>
      <div class="side"><div class="score ${m.winner === "home" ? "" : "lose"}" style="font-size:250px">${esc(m.finalHome)}</div>${slab(m.home)}</div>
    </div>
    <div class="sub" style="margin-top:34px">${esc(m.dateLine)}</div>
    <div class="foot">Official final from the NBA finals record · ${esc(DISCLOSURE.NBA)}</div>`;
}

const BODIES = { postgame: postgameBody, "pregame-winner": pregameBody, touchdowns: touchdownsBody, top5: top5Body, "nba-pregame": nbaPregameBody, "nba-final": nbaFinalBody };

function chipOf(m) {
  const lg = m.league ?? "NFL";
  if (m.format === "postgame" || m.format === "nba-final") return `${lg}${m.week ? ` · Week ${m.week}` : ""} · Final`;
  if (m.format === "top5") return `NFL${m.week ? ` · Week ${m.week}` : ""} · ${m.slateLine}`;
  return `${lg}${m.week ? ` · Week ${m.week}` : ""} · ${m.kickoffLine ?? m.tipLine}`;
}

export function socialHtml(m) {
  const body = BODIES[m.format];
  if (!body) throw new Error(`no social body for ${m.format}`);
  const css = fs.readFileSync(path.join(DIR, "social-v2.css"), "utf8");
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
  const res = m.format === "postgame" ? (m.result === "WIN" ? "res-hit" : m.result === "LOSS" ? "res-miss" : "") : "";
  const slots = {
    rawCss: css, rawVars: `--ca:${esc(m.away?.accent ?? "#12B865")};--cb:${esc(m.home?.accent ?? "#12B865")}`, ghostA: m.away?.abbr ?? "", ghostB: m.home?.abbr ?? "",
    logoDataUri: logo, chip: chipOf(m), rawBody: body(m), rawBodyClass: res,
  };
  return fs.readFileSync(path.join(DIR, "shell.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`slot {{${k}}} has no value`);
    return k.startsWith("raw") || k === "logoDataUri" ? slots[k] : esc(slots[k]);
  });
}

/** Render one view-model. Refuses (throws) when any text overflows after fitting. */
export async function renderSocial(m, { outFile }) {
  const html = socialHtml(m);
  const browser = await loadChromium().launch({ args: ["--disable-background-networking", "--no-first-run", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    const fit = await page.evaluate(() => window.__fit);
    const bad = fit.items.filter((i) => !i.fits);
    if (bad.length || fit.pageOverflow) throw new Error(`text does not fit: ${bad.map((b) => b.text).join(" | ") || "page overflow"}`);
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    return { template: SOCIAL_TEMPLATE, format: m.format, file: path.basename(outFile), ...pngSize(png), sha256: sha256(png), htmlSha256: sha256(html), fit: fit.items };
  } finally {
    await browser.close();
  }
}
