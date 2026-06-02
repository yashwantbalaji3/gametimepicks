/**
 * Shadow compare — public VOLUME DISCIPLINE vs today, on settled slates.
 * Offline, read-only, no wiring. Applies PUBLIC_VOLUME_CAPS to each settled
 * slate's published `publicRiskSections[*].all` (the default Parlay Lab
 * Suggested view) and reports before/after volume, repetition, and the
 * historical hit rate of the kept vs dropped cards.
 *
 * Hit rate is HISTORICAL SHADOW EVIDENCE ONLY — this is an anti-
 * overpublishing policy, not a performance claim. No same-slate leakage
 * (each slip judged against its own graded result). May 25/26 excluded.
 *
 * Run: cd app && npx tsx scripts/shadow-volume-discipline.mjs
 */
import { readFileSync } from "node:fs";
import { applyVolumeDiscipline, PUBLIC_VOLUME_CAPS } from "../src/lib/parlay-volume-discipline.ts";

const DATES = ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"];
const SECTIONS = ["low", "medium", "high", "longshot"];

function publishedAllView(g) {
  const prs = g.publicRiskSections ?? {};
  const out = {};
  for (const sec of SECTIONS) out[sec] = (prs[sec]?.all ?? []);
  return out;
}
function stats(sections) {
  let total = 0, w = 0, legN = 0, legW = 0;
  const player = new Map(), market = new Map(), game = new Map();
  for (const sec of SECTIONS) for (const s of sections[sec]) {
    total++;
    if (s.status === "win") w++;
    const seenP = new Set(), seenM = new Set(), seenG = new Set();
    for (const l of s.legs) {
      const r = l.result; if (r === "win" || r === "loss") { legN++; if (r === "win") legW++; }
      const pk = l.playerId ?? l.playerName, gk = l.gameId ?? l.gameKey;
      if (pk != null) seenP.add(pk); if (l.market) seenM.add(l.market); if (gk != null) seenG.add(gk);
    }
    for (const p of seenP) player.set(p, (player.get(p) ?? 0) + 1);
    for (const m of seenM) market.set(m, (market.get(m) ?? 0) + 1);
    for (const gg of seenG) game.set(gg, (game.get(gg) ?? 0) + 1);
  }
  const maxOf = (m) => (m.size ? Math.max(...m.values()) : 0);
  return { total, slipHit: total ? w / total : 0, legN, legHit: legN ? legW / legN : 0,
    maxPlayer: maxOf(player), maxMarket: maxOf(market), maxGame: maxOf(game) };
}
const pc = (x) => `${Math.round(x * 100)}%`;

let aT = 0, aTk = 0, aW = 0, aWk = 0, aLn = 0, aLw = 0, aLnk = 0, aLwk = 0;
console.log("Shadow: public volume discipline vs today (settled, 'all' view)\n");
console.log("date        before→after  bySection(before→after)            maxPlayer  maxMarket  maxGame   slipHit(b→a)  legHit(b→a)");
for (const date of DATES) {
  let g;
  try { g = JSON.parse(readFileSync(`public/data/parlays/optimizer-graded/${date}.json`, "utf8")); }
  catch { console.log(`${date}  (no file)`); continue; }
  const before = publishedAllView(g);
  const after = applyVolumeDiscipline(before, PUBLIC_VOLUME_CAPS).sections;
  const sb = stats(before), sa = stats(after);
  const bySec = SECTIONS.map((k) => `${k[0].toUpperCase()}${before[k].length}→${after[k].length}`).join(" ");
  console.log(
    `${date}  ${String(sb.total).padStart(6)}→${String(sa.total).padEnd(5)} ${bySec.padEnd(34)} ` +
    `${sb.maxPlayer}→${sa.maxPlayer}      ${sb.maxMarket}→${sa.maxMarket}      ${sb.maxGame}→${sa.maxGame}     ` +
    `${pc(sb.slipHit)}→${pc(sa.slipHit)}    ${pc(sb.legHit)}→${pc(sa.legHit)}`,
  );
  aT += sb.total; aTk += sa.total; aW += Math.round(sb.slipHit * sb.total); aWk += Math.round(sa.slipHit * sa.total);
  aLn += sb.legN; aLw += Math.round(sb.legHit * sb.legN); aLnk += sa.legN; aLwk += Math.round(sa.legHit * sa.legN);
}
console.log("\n=== AGGREGATE ===");
console.log(`Published cards: ${aT} → ${aTk}  (${pc(aTk / aT)} of today; ${aT - aTk} fewer)`);
console.log(`Slip hit (historical shadow only): ${pc(aW / aT)} → ${pc(aWk / aTk)}`);
console.log(`Leg hit  (historical shadow only): ${pc(aLw / aLn)} → ${pc(aLwk / aLnk)}`);
console.log("\nThis is anti-overpublishing only. No performance claim. No same-slate leakage.");
