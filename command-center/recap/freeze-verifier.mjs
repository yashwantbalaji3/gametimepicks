/**
 * FREEZE-TIME VERIFIER — a pregame post may quote a number only when it IS the frozen forecast, and is re-checked
 * against the forecast of record once the game starts.
 *
 * The site's own rule (app/src/lib/results/forecast-of-record.mjs §2): "The forecast of record is the last valid
 * version published strictly before the ONE canonical start of the event." NFL versions are the per-day receipts
 * (data/internal/nfl/forecast-receipts/<date>/<eventId>.json, each with sideDecision.frozenAt) and they re-freeze
 * until kickoff — CAR @ GB was 63.66% on Oct 26 ET and 63.76% on Oct 27 ET — so before kickoff nobody can know the
 * record for certain. The verifier therefore checks in two phases and never claims more than it can see:
 *
 *   BEFORE KICKOFF  verifyPregame → READY only when (1) a version is frozen, (2) the site's public forecast file shows
 *                   that same version, (3) every number the post states equals that version, (4) the data commit is
 *                   fresh enough to have seen a newer version, and (5) kickoff hasn't passed. A changed number is
 *                   BLOCKED (redraft); anything unconfirmable is NEEDS_VERIFICATION with the reason.
 *   AFTER KICKOFF   confirmAfterStart → the post's numbers against the forecast of record: the ledger row
 *                   (data/internal/forecast-ledger/v1/nfl.jsonl, entered after start, names its receipt) or, until it
 *                   enters, the last version frozen before kickoff. CONFIRMED, or SUPERSEDED with both numbers so
 *                   the founder can decide on a correction.
 *
 * Pure reads through a data source (recap/multisport-facts.mjs gitDataSource at a pinned commit); no clock of its
 * own (`now` is passed in) and no network.
 */
import { createHash } from "node:crypto";

export const RECEIPTS_DIR = "data/internal/nfl/forecast-receipts";
export const SITE_DIR = "app/public/data/nfl/forecasts";
const LEDGER = "data/internal/forecast-ledger/v1/nfl.jsonl";
/**
 * How old the data commit may be when a pregame post is marked READY. Operational, not a methodology constant: the
 * NFL forecast jobs run several times a day (.github/workflows/nfl-event-window.yml), so a commit older than this
 * may not contain the latest version. Overridable with GTP_CC_MAX_DATA_AGE_MIN.
 */
export const DEFAULT_MAX_DATA_AGE_MIN = 60;

const sha = (s) => createHash("sha256").update(s).digest("hex");
/** The site's own formatter (app/src/app/nfl/game/[eventId]/page.tsx and friends): a post shows what the site shows. */
const pct = (p) => `${(p * 100).toFixed(1)}%`;
const parse = (src, p) => {
  const raw = src.read(p);
  return raw == null ? null : { json: JSON.parse(raw), sha256: sha(raw), path: p };
};

/** The numbers a pregame post may state for one version (the published side's probability and the projected score). */
export function versionNumbers(r) {
  const side = String(r.sideDecision?.publishedSide ?? "").toUpperCase() === "AWAY" ? "away" : String(r.sideDecision?.publishedSide ?? "").toUpperCase() === "HOME" ? "home" : null;
  const wp = r.forecastSummary?.winProbability;
  return {
    side,
    sideTeam: side ? r[side].abbr : null,
    sideProbability: side && wp ? wp[side] : null,
    sideProbabilityDisplay: side && wp ? pct(wp[side]) : null,
    projected: { home: r.forecastSummary?.projectedScore?.home ?? null, away: r.forecastSummary?.projectedScore?.away ?? null },
    abstention: r.sideDecision?.abstention ?? null,
  };
}
/** Same numbers AS A POST STATES THEM: side, the probability to one decimal, and the projected score. 63.66% and 63.68% are
 *  both "63.7%" — not a change a reader could see, so never a redraft or a correction. */
const sameNumbers = (a, b) => a.side === b.side && a.sideProbabilityDisplay === b.sideProbabilityDisplay && a.projected.home === b.projected.home && a.projected.away === b.projected.away;
const describe = (n, r) => n.side ? `${r[n.side].abbr} ${n.sideProbabilityDisplay} to win, projected ${r.away.abbr} ${n.projected.away}–${r.home.abbr} ${n.projected.home}` : "no published side";

/**
 * Every receipt version of one event, oldest first: each dated directory's `<eventId>.json` and its same-day
 * revisions `<eventId>-rev-<HHMM>Z.json` (written by the kickoff refresh), at the commit.
 */
export function nflVersions(src, eventId) {
  const dirs = src.list(RECEIPTS_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const name = new RegExp(`^${String(eventId).replace(/\D/g, "")}(-rev-\\d{4}Z)?\\.json$`);
  const out = [];
  for (const d of dirs) for (const f of src.list(`${RECEIPTS_DIR}/${d}`).filter((n) => name.test(n))) {
    const v = parse(src, `${RECEIPTS_DIR}/${d}/${f}`);
    if (!v) continue;
    const r = v.json;
    out.push({ path: v.path, sha256: v.sha256, frozenAt: r.sideDecision?.frozenAt ?? r.generatedAt, kickoffUtc: r.kickoffUtc, receipt: r, numbers: versionNumbers(r) });
  }
  return out.sort((a, b) => Date.parse(a.frozenAt) - Date.parse(b.frozenAt) || a.path.localeCompare(b.path));
}

/** What the site's public NFL forecast files show for the event: the newest dated file that carries it. */
export function siteForecast(src, eventId) {
  const files = src.list(SITE_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
  for (const f of files) {
    const v = parse(src, `${SITE_DIR}/${f}`);
    const entry = v?.json?.forecasts?.find((x) => String(x.providerEventId) === String(eventId));
    if (entry) return { path: v.path, sha256: v.sha256, entry, numbers: versionNumbers(entry), frozenAt: entry.sideDecision?.frozenAt ?? entry.generatedAt };
  }
  return null;
}

/**
 * @param {{ src: object, eventId: string, now: string, numbers?: object, dataCommitAt?: string|null, maxDataAgeMin?: number }} p
 *        numbers: what the post states (versionNumbers shape); omitted → only the version itself is checked
 * @returns {{ status: "READY"|"NEEDS_VERIFICATION"|"BLOCKED", code: string, reasons: string[], version: object|null, site: object|null, kickoffUtc: string|null, checkedAt: string, dataCommit: string|null }}
 */
export function verifyPregame({ src, eventId, now, numbers = null, dataCommitAt = null, maxDataAgeMin = DEFAULT_MAX_DATA_AGE_MIN }) {
  const all = nflVersions(src, eventId);
  const kickoffUtc = all.at(-1)?.kickoffUtc ?? null;
  const base = { checkedAt: now, dataCommit: src.commit ?? null, kickoffUtc };
  const t = Date.parse(now);
  const frozen = all.filter((v) => Date.parse(v.frozenAt) <= t && (!kickoffUtc || Date.parse(v.frozenAt) < Date.parse(kickoffUtc)));
  const version = frozen.at(-1) ?? null;
  const site = siteForecast(src, eventId);
  const ref = (v) => v && { path: v.path, sha256: v.sha256, frozenAt: v.frozenAt, numbers: v.numbers, display: describe(v.numbers, v.receipt ?? v.entry) };
  const out = (status, code, reasons) => ({ status, code, reasons, version: ref(version), site: site && { path: site.path, sha256: site.sha256, frozenAt: site.frozenAt, numbers: site.numbers }, ...base });

  if (kickoffUtc && t >= Date.parse(kickoffUtc)) return out("BLOCKED", "WINDOW_CLOSED", [`kickoff was ${kickoffUtc}: a pregame post can no longer go out`]);
  if (!version) return out("NEEDS_VERIFICATION", "NOT_FROZEN", ["no version of this forecast is frozen yet at the data commit"]);
  if (version.numbers.abstention || !version.numbers.side) return out("BLOCKED", "NO_PUBLISHED_SIDE", ["the frozen version publishes no side (abstention): nothing to quote"]);
  if (numbers && !sameNumbers(numbers, version.numbers)) {
    return out("BLOCKED", "NUMBER_CHANGED", [`the post says ${describe(numbers, version.receipt)}; the latest frozen version (${version.frozenAt}) says ${describe(version.numbers, version.receipt)} — redraft from the new version`]);
  }
  const reasons = [];
  let status = "READY";
  if (!site) { status = "NEEDS_VERIFICATION"; reasons.push("the site's public forecast files don't carry this game at the data commit"); }
  else if (!sameNumbers(site.numbers, version.numbers)) { status = "NEEDS_VERIFICATION"; reasons.push(`the site shows ${describe(site.numbers, site.entry)} (${site.path}), not the latest frozen version`); }
  if (!dataCommitAt || !Number.isFinite(Date.parse(dataCommitAt))) {
    status = "NEEDS_VERIFICATION";
    reasons.push("the data source has no commit time (a working tree, not a pinned commit): its freshness can't be shown, so a newer version may exist");
  } else if (t - Date.parse(dataCommitAt) > maxDataAgeMin * 60_000) {
    status = "NEEDS_VERIFICATION";
    reasons.push(`the data commit is ${Math.round((t - Date.parse(dataCommitAt)) / 60_000)} min old (limit ${maxDataAgeMin}): fetch the latest data and rebuild the queue, a newer version may exist`);
  }
  if (status === "READY") {
    const distinct = new Set(frozen.map((v) => JSON.stringify(v.numbers))).size;
    reasons.push(`${frozen.length} version(s) frozen so far with ${distinct} distinct set(s) of numbers: it can still change until kickoff, so posting closer to kickoff lowers the chance the record differs`);
    reasons.push(`matches the latest frozen version (${version.frozenAt}) and the site; by the site's rule the forecast of record is the last version before kickoff (${kickoffUtc}), so the post is re-checked automatically after kickoff`);
  }
  return out(status, status === "READY" ? "MATCHES_LATEST_FROZEN" : "UNCONFIRMED", reasons);
}

/**
 * After kickoff: did the post quote the forecast of record?
 * @returns {{ status: "CONFIRMED"|"SUPERSEDED"|"PENDING", basis: string, reasons: string[], record: object|null }}
 */
export function confirmAfterStart({ src, eventId, now, numbers }) {
  const all = nflVersions(src, eventId);
  const kickoffUtc = all.at(-1)?.kickoffUtc ?? null;
  if (!kickoffUtc || Date.parse(now) < Date.parse(kickoffUtc)) return { status: "PENDING", basis: "before kickoff", reasons: ["the game has not started"], record: null, checkedAt: now, dataCommit: src.commit ?? null };
  let record = null;
  let basis;
  const ledger = src.read(LEDGER);
  const row = ledger?.split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .find((r) => r.family === "nfl_game_winner" && String(r.eventId) === String(eventId) && r.publicationStatus === "PUBLISHED" && !r.withdrawal);
  if (row?.receiptId) {
    const v = parse(src, row.receiptId);
    if (v) { record = { path: v.path, sha256: v.sha256, frozenAt: v.json.sideDecision?.frozenAt ?? v.json.generatedAt, numbers: versionNumbers(v.json), receipt: v.json, forecastId: row.forecastId }; basis = `Forecast Ledger row ${row.forecastId}`; }
  }
  if (!record) {
    const last = all.filter((v) => Date.parse(v.frozenAt) < Date.parse(kickoffUtc)).at(-1);
    if (last) { record = last; basis = "last version frozen before kickoff (the ledger row has not entered yet)"; }
  }
  if (!record) return { status: "PENDING", basis: "no record", reasons: ["no version frozen before kickoff is visible at the data commit"], record: null, checkedAt: now, dataCommit: src.commit ?? null };
  const ok = sameNumbers(numbers, record.numbers);
  return {
    status: ok ? "CONFIRMED" : "SUPERSEDED",
    basis,
    reasons: [ok ? `the post quoted the forecast of record (${describe(record.numbers, record.receipt)})` : `the post said ${describe(numbers, record.receipt)}; the forecast of record is ${describe(record.numbers, record.receipt)} — decide whether to post a correction`],
    record: { path: record.path, sha256: record.sha256, frozenAt: record.frozenAt, numbers: record.numbers, forecastId: record.forecastId ?? null },
    checkedAt: now,
    dataCommit: src.commit ?? null,
  };
}
