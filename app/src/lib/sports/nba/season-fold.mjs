/**
 * THE 2026-27 SEASON FOLD (Stage 12-S1b, founder decision N3) — what the v0.2 challenger reads that v0 / v0.1 never
 * do. PURE, no I/O.
 *
 * v0 and v0.1 fold only `corpus-v1.json` (last game 2026-06-14) and the corpus box scores, so from Oct 20 every
 * regular-season forecast uses frozen end-of-2025-26 ratings and minutes (Session 10 audit G3). The challenger adds:
 *   - FINALS: the write-once finals record (`app/public/data/nba/results/finals-<season>.json`) as corpus-shaped
 *     rows, so `buildTeamRatings` folds them into the same two Elo streams (preseason stays preseason).
 *   - BOX SCORES: the box scores the nightly grader already fetches (`experimental*\/boxscores/`), with the season
 *     label the minutes model groups by (a fetched doc carries `season: null`).
 *
 * LEAKAGE: the forecast instant is the cutoff for both. A final first recorded after `now`, or a box score captured
 * after `now`, is not something this forecast could have had and is not folded (the rating / minutes builders also
 * keep their own "game strictly before now" rule). A final under review (in `conflicts`) is never folded, and an
 * exhibition against a non-NBA club is never folded. A game the corpus already holds is never folded twice.
 */

const PHASE_CODE = Object.freeze({ PRESEASON: 1, REGULAR: 2, POSTSEASON: 3, PLAY_IN: 5 });

/** "2026-27" → 2027, the corpus convention (a season is labelled by the year it ends in). */
export function corpusSeasonOf(label) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(label ?? ""));
  return m ? Number(m[1]) + 1 : null;
}

/** Corpus season for a UTC date: Sept→June seasons are labelled by the year they end in (team-rating.mjs rule). */
function seasonOfDateUtc(dateUtc) {
  const d = new Date(dateUtc);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

/**
 * @param record     a finals record (nba-finals-record-v1)
 * @param corpusIds  Set of providerEventIds the corpus already holds
 * @param now        forecast instant (ISO)
 * @returns {{ rows: object[], skipped: Record<string, number> }}
 */
export function finalsAsCorpusRows(record, { corpusIds = new Set(), now }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("finalsAsCorpusRows: now (ISO) is required");
  const conflicted = new Set((record?.conflicts ?? []).map((c) => String(c.providerEventId)));
  const skipped = { inCorpus: 0, underReview: 0, exhibition: 0, recordedAfterNow: 0, unknownPhase: 0, malformed: 0 };
  const rows = [];
  for (const f of record?.finals ?? []) {
    const id = String(f?.providerEventId ?? "");
    const phase = PHASE_CODE[f?.phase];
    const season = corpusSeasonOf(f?.season);
    const recMs = Date.parse(f?.firstRecordedAt ?? "");
    if (!id || !Number.isInteger(f?.ftHome) || !Number.isInteger(f?.ftAway) || !f?.home?.name || !f?.away?.name || !season || !Number.isFinite(recMs)) { skipped.malformed += 1; continue; }
    if (corpusIds.has(id)) { skipped.inCorpus += 1; continue; }
    if (conflicted.has(id)) { skipped.underReview += 1; continue; }
    if (f.exhibition === true || f.home.exhibition === true || f.away.exhibition === true) { skipped.exhibition += 1; continue; }
    if (phase == null) { skipped.unknownPhase += 1; continue; }
    if (!(recMs <= nowMs)) { skipped.recordedAfterNow += 1; continue; }
    rows.push({
      providerEventId: id, season, phase, dateUtc: f.dateUtc,
      home: f.home.name, away: f.away.name, ftHome: f.ftHome, ftAway: f.ftAway,
      neutralSite: f.neutralSite === true, statusRaw: f.statusRaw ?? "STATUS_FINAL", sourceFile: `finals-${f.season}.json`,
    });
  }
  return { rows, skipped };
}

/**
 * Corpus box scores plus fetched ones, one doc per event (the corpus copy wins), each with a season label.
 * @returns {{ docs: object[], added: number, skipped: Record<string, number> }}
 */
export function foldBoxscores(corpusDocs, fetchedDocs, { now }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("foldBoxscores: now (ISO) is required");
  const seen = new Set((corpusDocs ?? []).map((d) => String(d?.providerEventId)));
  const docs = [...(corpusDocs ?? [])];
  const skipped = { duplicate: 0, capturedAfterNow: 0, noSeason: 0 };
  let added = 0;
  for (const d of fetchedDocs ?? []) {
    const id = String(d?.providerEventId ?? "");
    if (!id || seen.has(id)) { skipped.duplicate += 1; continue; }
    const capMs = Date.parse(d?.capturedAt ?? "");
    if (!(Number.isFinite(capMs) && capMs <= nowMs)) { skipped.capturedAfterNow += 1; continue; }
    const season = Number.isInteger(d.season) ? d.season : seasonOfDateUtc(d.dateUtc);
    if (!season) { skipped.noSeason += 1; continue; }
    seen.add(id);
    docs.push({ ...d, season });
    added += 1;
  }
  return { docs, added, skipped };
}
