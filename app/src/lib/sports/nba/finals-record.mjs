/**
 * NBA finals record (Session 6 · NBA foundation) — the DURABLE owner of "what was the final".
 *
 * WHY THIS EXISTS. `public/data/nba/results/latest.json` is a ROLLING 9-day scoreboard window: a final
 * is in it for nine days and then gone. Nothing downstream — a Results page, a future NBA grader, Ask —
 * could answer "what was the final of game X" for anything older, and nothing pinned a final once it was
 * seen. This module turns each accepted final from that window into ONE write-once row of a per-season
 * record, so the canonical settlement path exists before any NBA forecast is public.
 *
 * WHAT IT IS NOT. It grades nothing and writes no ledger of picks — the settlement contract
 * (`settlement-contract.mjs`) grades, and the repo's settlement writer stays nightly-settle. This is the
 * FINAL-RESULT owner the grader will read.
 *
 * RULES
 *   - Only finals that `loadCurrentNbaResults` ACCEPTED enter (schedule lineage by provider event id,
 *     integer non-tied points, seasonType agreeing with the schedule). Its quarantines stay out.
 *   - Identity is the ESPN TEAM ID, never a name or a bare abbreviation: the canonical tricode comes from
 *     `espnTeamById`, and the row's ESPN abbreviation must agree with that id's registered abbreviation —
 *     a disagreement quarantines the row instead of trusting either side.
 *   - Exhibition opponents (international clubs in the preseason) have no NBA team id. Their rows are kept
 *     and labelled `exhibition: true` with a null tricode — counted, never dropped, never given a tricode.
 *   - WRITE-ONCE. A recorded final is never rewritten. A later observation that disagrees (a corrected
 *     score, a status change) is appended to `conflicts` for review and the recorded row stands.
 *   - Pending is not a result: `finalFor` answers PENDING for any event the record does not hold — never a
 *     loss, never zero.
 */
import { espnTeamById } from "./roster-contract.mjs";

export const NBA_FINALS_RECORD_VERSION = "nba-finals-record-v1";

const PHASES = Object.freeze({ 1: "PRESEASON", 2: "REGULAR", 3: "POSTSEASON", 5: "PLAY_IN" });

/** The NBA season a game belongs to, from its ET date: August starts a new season ("2026-27"). */
export function nbaSeasonLabel(dateEt) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateEt ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const start = mo >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function etDateOf(iso) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/**
 * One side's identity. `{ ok: true, side }` or `{ ok: false, reason }`. An exhibition club (no ESPN NBA
 * team id) is ok with a null tricode; an NBA team id whose abbreviation disagrees is not ok.
 */
export function sideIdentity(raw) {
  if (!raw) return { ok: false, reason: "side missing" };
  const id = raw.providerTeamId != null ? String(raw.providerTeamId) : null;
  const team = id ? espnTeamById(id) : null;
  if (!team) {
    return { ok: true, side: { tricode: null, providerTeamId: id, espnAbbr: raw.abbr ?? null, name: raw.name ?? null, exhibition: true } };
  }
  if (raw.abbr != null && String(raw.abbr).toUpperCase() !== team.espnAbbr) {
    return { ok: false, reason: `team id ${id} is ${team.espnAbbr} but the row says ${raw.abbr} — identity disagrees, not recorded` };
  }
  return { ok: true, side: { tricode: team.canonicalTricode, providerTeamId: id, espnAbbr: team.espnAbbr, name: raw.name ?? null, exhibition: false } };
}

/** Build a record row from a raw capture row (already accepted by loadCurrentNbaResults). */
export function finalRow(raw, recordedAt) {
  const home = sideIdentity(raw.home), away = sideIdentity(raw.away);
  if (!home.ok) return { ok: false, reason: `home: ${home.reason}` };
  if (!away.ok) return { ok: false, reason: `away: ${away.reason}` };
  const dateEt = etDateOf(raw.dateUtc);
  if (!dateEt) return { ok: false, reason: "no parseable start time" };
  return {
    ok: true,
    row: {
      canonicalEventId: `nba:nba:${dateEt}:${raw.providerEventId}`,
      providerEventId: String(raw.providerEventId),
      dateUtc: raw.dateUtc,
      dateEt,
      season: nbaSeasonLabel(dateEt),
      seasonType: raw.seasonType ?? null,
      phase: PHASES[raw.seasonType] ?? "OTHER",
      neutralSite: raw.neutralSite ?? null,
      exhibition: home.side.exhibition || away.side.exhibition,
      home: home.side,
      away: away.side,
      ftHome: raw.ftHome,
      ftAway: raw.ftAway,
      winnerSide: raw.ftHome > raw.ftAway ? "home" : "away",
      statusRaw: raw.statusRaw,
      firstRecordedAt: recordedAt,
      source: "espn_scoreboard",
    },
  };
}

export function emptyRecord(season) {
  return {
    schemaVersion: 1,
    sport: "nba",
    dataClass: "FINALS_RECORD",
    contract: NBA_FINALS_RECORD_VERSION,
    season,
    note: "Write-once official NBA finals (ESPN scoreboard, accepted by the current-results adapter). A recorded final is never rewritten; disagreeing later observations go to `conflicts`. Holds finals only — a game absent here is pending, never a loss.",
    updatedAt: null,
    counts: null,
    finals: [],
    conflicts: [],
    refused: [],
  };
}

function countsOf(finals, conflicts, refused) {
  const by = (p) => finals.filter((f) => f.phase === p).length;
  return {
    finals: finals.length,
    preseason: by("PRESEASON"), regular: by("REGULAR"), postseason: by("POSTSEASON"), playIn: by("PLAY_IN"), other: by("OTHER"),
    exhibition: finals.filter((f) => f.exhibition).length,
    conflicts: conflicts.length,
    refused: refused.length,
  };
}

const sameFinal = (a, b) => a.ftHome === b.ftHome && a.ftAway === b.ftAway && a.home.providerTeamId === b.home.providerTeamId && a.away.providerTeamId === b.away.providerTeamId;

/**
 * Merge accepted finals into one season's record. Pure. Returns `{ record, changed, added }`; `changed`
 * is false when nothing new was learned, so a caller never rewrites a file just to move a timestamp.
 *
 * @param {object|null} existing  the committed record for `season` (or null)
 * @param {Array<object>} rawRows raw capture rows for finals that loadCurrentNbaResults accepted
 */
export function mergeFinals(existing, rawRows, { season, nowIso }) {
  const base = existing ?? emptyRecord(season);
  const finals = [...(base.finals ?? [])];
  const conflicts = [...(base.conflicts ?? [])];
  const refused = [...(base.refused ?? [])];
  const byId = new Map(finals.map((f) => [f.providerEventId, f]));
  let added = 0, changed = false;
  for (const raw of rawRows) {
    const built = finalRow(raw, nowIso);
    if (!built.ok) {
      const id = String(raw?.providerEventId ?? "?");
      if (!refused.some((r) => r.providerEventId === id && r.reason === built.reason)) {
        refused.push({ providerEventId: id, reason: built.reason, observedAt: nowIso });
        changed = true;
      }
      continue;
    }
    const row = built.row;
    if (row.season !== season) continue; // another season's record owns it
    const prior = byId.get(row.providerEventId);
    if (!prior) {
      finals.push(row); byId.set(row.providerEventId, row); added++; changed = true;
      continue;
    }
    if (sameFinal(prior, row)) continue;
    const observed = { ftHome: row.ftHome, ftAway: row.ftAway, homeTeamId: row.home.providerTeamId, awayTeamId: row.away.providerTeamId };
    if (!conflicts.some((c) => c.providerEventId === row.providerEventId && JSON.stringify(c.observed) === JSON.stringify(observed))) {
      conflicts.push({
        providerEventId: row.providerEventId,
        recorded: { ftHome: prior.ftHome, ftAway: prior.ftAway, homeTeamId: prior.home.providerTeamId, awayTeamId: prior.away.providerTeamId },
        observed,
        observedAt: nowIso,
        note: "the recorded final stands; review before any correction",
      });
      changed = true;
    }
  }
  finals.sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));
  const record = { ...base, season, finals, conflicts, refused, counts: countsOf(finals, conflicts, refused), updatedAt: changed ? nowIso : base.updatedAt };
  return { record, changed, added };
}

/**
 * The settlement-facing lookup. `FINAL` with the recorded score, or `PENDING` — an event the record does
 * not hold has not been settled, and nothing may read that as a loss or a zero.
 */
export function finalFor(record, providerEventId) {
  const row = (record?.finals ?? []).find((f) => f.providerEventId === String(providerEventId));
  if (!row) return { state: "PENDING", providerEventId: String(providerEventId) };
  const conflicted = (record.conflicts ?? []).some((c) => c.providerEventId === row.providerEventId);
  return { state: conflicted ? "FINAL_UNDER_REVIEW" : "FINAL", providerEventId: row.providerEventId, ftHome: row.ftHome, ftAway: row.ftAway, winnerSide: row.winnerSide, home: row.home.tricode, away: row.away.tricode, phase: row.phase };
}
