/**
 * CLOSURE-PACKET SOURCES — the fs boundary for the completion control plane (P196 · Release A).
 *
 * Everything the packet builder consumes is read HERE, in one place, from each source's own
 * authority — the newest dated MLB board (the pointer file has been empty before; the dated file
 * is the artifact), the EPL public forecast set, the NFL index, the UFC current card, the NBA
 * schedule capture, the daily product receipt and the route inventory. The builder itself stays
 * pure so the determinism and contradiction tests can run on fixtures; this module is the only
 * part that touches disk, and every reader returns a TYPED absence — "we could not read it" and
 * "there is nothing" are different facts and only one of them is healthy.
 */
import fs from "node:fs";
import path from "node:path";

import { CURRENT_EVENT_STALE_HOURS } from "./closure-packets.mjs";

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
};

const hoursBetween = (aIso, bIso) => {
  const a = Date.parse(aIso ?? ""), b = Date.parse(bIso ?? "");
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 3_600_000 : null;
};

/** Freshness verdict from the artifact's OWN stamp — never a file mtime, which records git, not truth. */
function eventState({ sport, artifactStamp, nowIso, detail, eventUtc = null }) {
  if (!artifactStamp) return { state: "MISSING", detail, eventUtc, artifactStamp: null };
  const age = hoursBetween(artifactStamp, nowIso);
  const stale = age != null && age > CURRENT_EVENT_STALE_HOURS[sport];
  return { state: stale ? "STALE" : "CURRENT", detail, eventUtc, artifactStamp };
}

/**
 * @param {{appDir: string, nowIso: string}} opts  appDir = the Next app root (…/app)
 */
export function readCurrentEvents({ appDir, nowIso }) {
  const pub = (rel) => path.join(appDir, "public/data", rel);

  // MLB — newest dated board; latest.json has shipped empty before and is not trusted here.
  let mlb = { state: "MISSING", detail: "no dated board artifact on disk", eventUtc: null, artifactStamp: null };
  try {
    const dir = path.join(appDir, "public/data/mlb/boards");
    const dated = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
    if (dated) {
      const b = readJson(path.join(dir, dated));
      mlb = eventState({
        sport: "mlb", nowIso,
        artifactStamp: b?.generatedAt ?? null,
        detail: b ? `board ${b.date}: ${b.games?.length ?? 0} game(s), ${b.summary?.totalLeans ?? b.leans?.length ?? "?"} lean rows` : `board file ${dated} unreadable`,
        eventUtc: b?.date ?? null,
      });
    }
  } catch { /* MISSING stands */ }

  // EPL — the public forecast set; rows carry each fixture's own kickoff.
  const epl = (() => {
    const f = readJson(pub("soccer/epl/forecasts/latest.json"));
    if (!f) return { state: "MISSING", detail: "no public forecast artifact", eventUtc: null, artifactStamp: null };
    const upcoming = (f.rows ?? [])
      .map((r) => r.kickoffUtc).filter((k) => Date.parse(k ?? "") >= Date.parse(nowIso)).sort();
    return eventState({
      sport: "epl", nowIso, artifactStamp: f.generatedAt ?? null,
      detail: `${(f.rows ?? []).length} row(s); ${upcoming.length} kickoff(s) ahead`,
      eventUtc: upcoming[0] ?? null,
    });
  })();

  // NFL — the canonical index owns next kickoff.
  const nfl = (() => {
    const idx = readJson(pub("nfl/index.json"));
    if (!idx) return { state: "MISSING", detail: "no canonical index", eventUtc: null, artifactStamp: null };
    return eventState({
      sport: "nfl", nowIso, artifactStamp: idx.generatedAt ?? null,
      detail: idx.nextMatchup ? `next: ${idx.nextMatchup}` : "no next matchup named",
      eventUtc: idx.nextKickoffUtc ?? null,
    });
  })();

  // UFC — the current card artifact; a fought card must not be presented as next (P192 lesson),
  //       so the packet records whether the card is ahead of or behind the build clock.
  const ufc = (() => {
    const card = readJson(pub("ufc/card-latest.json"));
    if (!card) return { state: "MISSING", detail: "no current card artifact", eventUtc: null, artifactStamp: null };
    const start = card.event?.startUtc ?? null;
    const ahead = start ? Date.parse(start) >= Date.parse(nowIso) : null;
    return eventState({
      sport: "ufc", nowIso, artifactStamp: card.generatedAt ?? null,
      detail: `${card.event?.name ?? "unnamed card"} · ${card.bouts?.length ?? 0} bout(s) · ${ahead == null ? "start unknown" : ahead ? "card ahead" : "card fought"}`,
      eventUtc: start,
    });
  })();

  // NBA — the schedule capture is the only current artifact for a dormant lane.
  const nba = (() => {
    const s = readJson(pub("nba/schedule/latest.json"));
    if (!s) return { state: "MISSING", detail: "no schedule capture", eventUtc: null, artifactStamp: null };
    return eventState({
      sport: "nba", nowIso, artifactStamp: s.generatedAt ?? null,
      detail: `schedule capture: ${(s.rows ?? []).length} row(s) over ${s.windowDays ?? "?"} day window (off-season)`,
      eventUtc: null,
    });
  })();

  return { mlb, epl, nfl, ufc, nba };
}

/** The newest dated daily product receipt — quoted, never re-evaluated. */
export function readProductReceipt({ appDir }) {
  try {
    const dir = path.join(appDir, "..", "data/internal/products/receipts");
    const newest = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
    return newest ? readJson(path.join(dir, newest)) : null;
  } catch { return null; }
}

export function readRouteInventory({ appDir }) {
  return readJson(path.join(appDir, "..", "data/internal/audits/route-inventory-v1.json"));
}

/**
 * THE LIVE CALIBRATION-COUNT AUTHORITY for EPL (P196 · Release D): the nightly learning artifact,
 * read beside a fresh recount of the public graded ledger it summarises. The packet builder
 * REFUSES when they disagree — which is precisely how "0 of 30 paired" got quoted as current in
 * the 08-24 operating record while the artifact said 3: a dated string was read instead of the
 * artifact, and nothing failed. Now something fails.
 */
export function readEplCalibrationAuthority({ appDir }) {
  const artifact = readJson(path.join(appDir, "..", "data/internal/research/epl/learning/latest.json"));
  let graded = 0;
  let paired = 0;
  try {
    for (const line of fs.readFileSync(path.join(appDir, "public/data/soccer/epl/results/graded-forecasts.jsonl"), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r?.scores && Number.isFinite(r.scores.logLoss)) {
          graded += 1;
          if (r?.market?.scores && Number.isFinite(r.market.scores.logLoss)) paired += 1;
        }
      } catch { /* a malformed line is not a grade */ }
    }
  } catch { return { artifact, ledgerRecount: null }; }
  return { artifact, ledgerRecount: { graded, paired } };
}
