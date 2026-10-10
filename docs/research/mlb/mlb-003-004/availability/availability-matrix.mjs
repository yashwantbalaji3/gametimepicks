/**
 * MLB-003 / MLB-004 · point-in-time availability matrix of the pregame captures (research only; read-only).
 *
 *   node docs/research/mlb/mlb-003-004/availability/availability-matrix.mjs
 *
 * For every family under data/internal/mlb/pregame-archive/pregame-features/, against the 2026 box scores of the same
 * dates (the games that actually happened):
 *   - game coverage: share of completed games with at least one capture of the family;
 *   - timing: minutes from the EARLIEST and the LATEST capture to the scheduled start (eventStartTime); share captured
 *     after the start (those may never be used as pregame inputs);
 *   - family-specific content: posted lineups (9 per side), batting-order slot known, starter hand known, splits present.
 * Writes availability-matrix.json beside this file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const F = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features");
const BOX = path.join(REPO, "data/internal/mlb/boxscore-outcomes");
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// Completed games (and their starting batters / starters) per date, from the box scores.
const games = new Map(); // date -> Map(gamePk -> { starters:Set(batter ids), sp:Set(pitcher ids) })
for (const f of fs.readdirSync(BOX).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
  const d = JSON.parse(fs.readFileSync(path.join(BOX, f), "utf8"));
  const m = new Map();
  for (const r of d.rows) {
    const g = m.get(r.gamePk) ?? { starters: new Set(), sp: new Set() };
    if (r.batting && typeof r.battingOrder === "string" && r.battingOrder.endsWith("00")) g.starters.add(r.playerId);
    if (r.pitching?.started) g.sp.add(r.playerId);
    m.set(r.gamePk, g);
  }
  games.set(d.date, m);
}

const families = fs.readdirSync(F).filter((x) => fs.statSync(path.join(F, x)).isDirectory()).sort();
const lineupPostedLead = new Map(); // `${date}|${gamePk}` -> minutes before start of the first capture with both lineups posted
const out = { generatedAt: new Date().toISOString(), source: path.relative(REPO, F), families: {} };
for (const fam of families) {
  const dates = fs.readdirSync(path.join(F, fam)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  let gamesTotal = 0; let gamesCovered = 0; const firstLead = []; const lastLead = []; let docs = 0; let afterStart = 0;
  const extra = { lineupBoth9: 0, lineupDocs: 0, slotKnown: 0, slotDocs: 0, handKnown: 0, handDocs: 0, splitsWithPa: 0, splitDocs: 0, startersWithSplits: 0, starterRows: 0, matchupBatters: 0, matchupDocs: 0 };
  for (const d of dates) {
    const box = games.get(d); if (!box) continue;
    const byGame = new Map();
    const playersWithDoc = new Set();
    for (const f of fs.readdirSync(path.join(F, fam, d)).filter((x) => x.endsWith(".json"))) {
      let doc; try { doc = JSON.parse(fs.readFileSync(path.join(F, fam, d, f), "utf8")); } catch { continue; }
      docs += 1;
      const start = Date.parse(doc.eventStartTime); const at = Date.parse(doc.capturedAt);
      if (Number.isFinite(start) && Number.isFinite(at) && at >= start) afterStart += 1;
      const a = byGame.get(doc.gamePk) ?? []; a.push((start - at) / 60000); byGame.set(doc.gamePk, a);
      if (doc.playerId != null) playersWithDoc.add(`${doc.gamePk}|${doc.playerId}`);
      if (fam === "lineup") {
        extra.lineupDocs += 1;
        if ((doc.home?.count ?? 0) >= 9 && (doc.away?.count ?? 0) >= 9) {
          extra.lineupBoth9 += 1;
          // Earliest pre-start capture with both lineups posted, per game.
          if (Number.isFinite(start) && Number.isFinite(at) && at < start) { const lead = (start - at) / 60000; const prev = lineupPostedLead.get(`${d}|${doc.gamePk}`); if (prev == null || lead > prev) lineupPostedLead.set(`${d}|${doc.gamePk}`, lead); }
        }
      }
      if (fam === "pa-opportunity") { extra.slotDocs += 1; if (doc.battingOrderSlot != null) extra.slotKnown += 1; }
      if (fam === "matchup") { extra.handDocs += 1; if (doc.homeStartingPitcher?.pitchHand && doc.awayStartingPitcher?.pitchHand) extra.handKnown += 1; extra.matchupDocs += 1; if ((doc.homeBatters?.length ?? 0) + (doc.awayBatters?.length ?? 0) > 0) extra.matchupBatters += 1; }
      if (fam === "batter-splits") { extra.splitDocs += 1; if ((doc.seasonSplits?.vsRHP?.pa ?? 0) + (doc.seasonSplits?.vsLHP?.pa ?? 0) > 0) extra.splitsWithPa += 1; }
    }
    for (const [pk, g] of box) {
      gamesTotal += 1;
      const leads = byGame.get(pk);
      if (leads?.length) { gamesCovered += 1; firstLead.push(Math.max(...leads)); lastLead.push(Math.min(...leads)); }
      if (fam === "batter-splits") for (const id of g.starters) { extra.starterRows += 1; if (playersWithDoc.has(`${pk}|${id}`)) extra.startersWithSplits += 1; }
    }
  }
  const r = (a, b) => (b ? Number((a / b).toFixed(4)) : null);
  out.families[fam] = {
    dates: dates.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, documents: docs,
    gameCoverage: r(gamesCovered, gamesTotal), gamesCovered, gamesTotal,
    minutesBeforeStart: { earliestCapture: { p10: q(firstLead, 0.1), median: q(firstLead, 0.5), p90: q(firstLead, 0.9) }, latestCapture: { p10: q(lastLead, 0.1), median: q(lastLead, 0.5), p90: q(lastLead, 0.9) } },
    capturedAtOrAfterStart: r(afterStart, docs),
    ...(fam === "lineup" ? (() => { const leads = [...lineupPostedLead.values()]; return { docsWithBothLineupsPosted: r(extra.lineupBoth9, extra.lineupDocs), gamesWithBothLineupsPostedBeforeStart: r(leads.length, gamesTotal), minutesBeforeStartWhenFirstPosted: { p10: q(leads, 0.1), median: q(leads, 0.5), p90: q(leads, 0.9) } }; })() : {}),
    ...(fam === "pa-opportunity" ? { docsWithBattingSlot: r(extra.slotKnown, extra.slotDocs) } : {}),
    ...(fam === "matchup" ? { docsWithBothStarterHands: r(extra.handKnown, extra.handDocs), docsWithBatters: r(extra.matchupBatters, extra.matchupDocs) } : {}),
    ...(fam === "batter-splits" ? { docsWithSeasonPa: r(extra.splitsWithPa, extra.splitDocs), startingBattersWithASplitsDoc: r(extra.startersWithSplits, extra.starterRows) } : {}),
  };
}
fs.writeFileSync(path.join(HERE, "availability-matrix.json"), JSON.stringify(out, null, 1) + "\n");
for (const [fam, o] of Object.entries(out.families)) console.log(`${fam.padEnd(20)} ${o.from}..${o.to} games ${o.gamesCovered}/${o.gamesTotal} (${o.gameCoverage}) first-capture median ${o.minutesBeforeStart.earliestCapture.median?.toFixed(0)} min, last ${o.minutesBeforeStart.latestCapture.median?.toFixed(0)} min before start; after-start ${o.capturedAtOrAfterStart}` + Object.entries(o).filter(([k]) => /docsWith|startingBatters|gamesWith|WhenFirst/.test(k)).map(([k, v]) => ` ${k}=${v}`).join(""));
