/**
 * THE NFL PLAYER-PROP SETTLEMENT LEDGER (Phase D) — the durable record, downstream of the live loop.
 *
 * The live artifacts under `public/data/nfl/live-props/<eventId>.json` are the CURRENT state: the
 * producer rewrites each one on every poll, and it stops writing entirely once a game leaves the
 * live window. Nothing there is a record. This fold turns those rewritten files into an append-only
 * ledger that outlives them, so the evaluation surface has one thing to read and a correction that
 * arrives hours later has somewhere to land.
 *
 * ── WHY IT IS A SEPARATE FOLD AND NOT A BRANCH OF THE PRODUCER ──────────────────────────────────
 *
 * The producer's own reconciliation window is SHORT and closes on the clock — that is what stops a
 * finished game being polled forever. An official stat correction can arrive long after it closes,
 * and by then the producer is not running for that game at all. Keeping the ledger downstream means
 * a correction is applied by re-reading committed evidence, outside the polling loop, exactly as the
 * roadmap's A4 requires. It also means the ledger cannot be damaged by a bad poll: it only ever
 * learns from an artifact that has already been written and committed.
 *
 * ── WHAT NEVER CHANGES ONCE WRITTEN ─────────────────────────────────────────────────────────────
 *
 *   frozen      the pregame sportsbook line, its prices, its capture instant, and our projection
 *   settledAt   the instant this row FIRST reached a terminal answer
 *   original    the answer published at that instant
 *
 * A later disagreement does not overwrite any of them. It appends to `corrections`, and the row's
 * current values move while `original` stays put — so "what did GameTimePicks claim at the time"
 * and "what is true now" are both answerable, which is the whole point of keeping a record.
 *
 * ── WHAT IS NOT DECIDED HERE ────────────────────────────────────────────────────────────────────
 *
 * Nothing is graded in this file. Every result is copied from the settlement the producer already
 * wrote, because a ledger that re-derived an outcome would be a second opinion about a settled
 * result. `NO_MEASUREMENT` is carried as itself and never becomes a loss; `bookRuleUnknown` travels
 * with it, because which absences a sportsbook voids rather than settles is its rule and not ours.
 */

/**
 * A game's slate is its ET date, not its UTC one. A Sunday-night kickoff at 00:15Z belongs to the
 * previous ET day, and dating it by UTC would file one slate under two days and disagree with the
 * ledger file that holds it.
 */
export function slateDateEtOf(kickoffUtc) {
  const t = Date.parse(String(kickoffUtc ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** Terminal answers a row may hold. PENDING is not one — a pending row never enters the ledger. */
const TERMINAL_STATES = new Set(["SETTLED", "NO_MEASUREMENT"]);

/** One row per canonical `(event, player, family)`. The producer's predictionId is already that. */
export function settlementIdOf(row) {
  return row?.predictionId ?? null;
}

/**
 * The fields a correction may move. Deliberately short: a correction is a statement about the
 * MEASUREMENT and what follows from it, never about the frozen line or the frozen forecast.
 */
const CORRECTABLE = ["measurementState", "finalStat", "lineResult", "forecastResult", "finality"];

function currentOf(row, finality) {
  const s = row?.settlement ?? {};
  return {
    measurementState: s.state === "NO_MEASUREMENT" ? "NO_MEASUREMENT" : "OBSERVED",
    finalStat: s.finalStat ?? null,
    lineResult: s.lineResult ?? null,
    forecastResult: s.forecastResult ?? null,
    finality: finality ?? "PROVISIONAL",
  };
}

/** The differences between two answers, as `{field: {from, to}}`. Empty when they agree. */
function diff(before, after) {
  const out = {};
  for (const k of CORRECTABLE) if (before[k] !== after[k]) out[k] = { from: before[k], to: after[k] };
  return out;
}

/**
 * Fold one event's live artifact into the ledger.
 *
 * @param {object[]} priorRows   the ledger as committed (append-only; never reordered here)
 * @param {object}   artifact    one `live-props/<eventId>.json`
 * @param {string}   nowIso      the fold instant — used only for a correction's own timestamp
 * @returns {{rows: object[], added: number, corrected: number, promoted: number, unchanged: number, skipped: number}}
 */
export function foldEventIntoLedger(priorRows, artifact, nowIso) {
  const byId = new Map((priorRows ?? []).map((r) => [r.settlementId, r]));
  const order = (priorRows ?? []).map((r) => r.settlementId);
  let added = 0, corrected = 0, promoted = 0, unchanged = 0, skipped = 0;

  for (const row of artifact?.rows ?? []) {
    const id = settlementIdOf(row);
    const state = row?.settlement?.state ?? null;

    /*
     * ⚠ PENDING NEVER ENTERS THE LEDGER, AND NEVER BECOMES A LOSS.
     *
     * A row is admitted only once the producer has given it a terminal answer against a FINAL game.
     * Admitting a pending row would mean the ledger held a result for a game still being played, and
     * the only way back out would be to delete it — which an append-only record cannot do.
     */
    if (!id || !TERMINAL_STATES.has(state)) { skipped += 1; continue; }

    /*
     * A row with no frozen block is not a settlement we can stand behind: there is no line it landed
     * against and no forecast to score. The producer already refuses to mint one from post-kickoff
     * evidence, and that refusal must not be laundered into a record by this fold.
     */
    if (!row.frozen) { skipped += 1; continue; }

    const now = currentOf(row, artifact?.finality);
    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, {
        settlementId: id,
        eventId: artifact.providerEventId ?? null,
        matchup: artifact.matchup ?? null,
        kickoffUtc: artifact.kickoffUtc ?? null,
        slateDateEt: slateDateEtOf(artifact.kickoffUtc),
        playerId: row.playerId ?? null,
        playerName: row.name ?? null,
        teamAbbr: row.team ?? null,
        family: row.family ?? null,
        /* The family's publication state at settlement, carried so the publication boundary below
           reads the record rather than re-deriving it from a board it may no longer have. */
        familyState: row.familyState ?? null,
        /* Copied wholesale and never recomputed — the line, the prices, the capture instant, the
           projection and the board instant that produced it. */
        frozen: row.frozen,
        frozenIdentity: row.frozenIdentity ?? null,
        ...now,
        bookRuleUnknown: row.settlement?.bookRuleUnknown === true,
        noMeasurementReason: row.settlement?.reason ?? null,
        /** The answer published at `settledAt`, kept whatever happens afterwards. */
        original: { ...now, at: row.settlement?.settledAt ?? nowIso },
        settledAt: row.settlement?.settledAt ?? nowIso,
        source: row.settlement?.source ?? null,
        corrections: [],
      });
      order.push(id);
      added += 1;
      continue;
    }

    /*
     * ⚠ IDEMPOTENCY IS THE POINT. A repeated FINAL read must add no row, move no timestamp and
     * re-grade nothing. Only a genuine change of answer is recorded, and it is recorded as an
     * APPENDED correction rather than as an edit.
     */
    const changes = diff(existing, now);
    const changed = Object.keys(changes);
    if (changed.length === 0) { unchanged += 1; continue; }

    /*
     * ⚠ A PROMOTION IS NOT A CORRECTION. `PROVISIONAL → CANONICAL` is the documented terminus of the
     * lifecycle — the reconciliation window closing on the clock — and no answer moves with it. Folded
     * as a correction it appended one to all fifty-seven rows of the first completed game and reported
     * `corrected: 57`, which would have told a reader the entire slate had been re-graded. A correction
     * count that fires on the ordinary happy path is a correction count nobody can use.
     *
     * A REGRESSION IS. `CANONICAL → PROVISIONAL` means a closed window reopened, which is an integrity
     * event, so it deliberately falls through to the correction path below.
     */
    if (changed.length === 1 && changed[0] === "finality" && changes.finality.from === "PROVISIONAL" && changes.finality.to === "CANONICAL") {
      existing.finality = "CANONICAL";
      promoted += 1;
      continue;
    }

    existing.corrections = [
      ...(existing.corrections ?? []),
      {
        at: nowIso,
        changes,
        source: row.settlement?.source ?? null,
        /* The producer states plainly when its own live window saw the provider revise a stat. */
        note: row.reconciliation
          ? "the provider revised the final stat after the original settlement"
          : "the settlement answer changed on a later read of committed evidence",
      },
    ];
    Object.assign(existing, now);
    existing.bookRuleUnknown = row.settlement?.bookRuleUnknown === true;
    existing.noMeasurementReason = row.settlement?.reason ?? null;
    corrected += 1;
  }

  // Insertion order is preserved: an append-only record must read the same way twice.
  return { rows: order.map((id) => byId.get(id)), added, corrected, promoted, unchanged, skipped };
}

/** Fold a whole slate. Events are taken in a deterministic order so two runs agree byte for byte. */
export function buildLedger({ prior = null, artifacts = [], nowIso }) {
  let rows = prior?.rows ?? [];
  const totals = { added: 0, corrected: 0, promoted: 0, unchanged: 0, skipped: 0 };
  for (const a of [...artifacts].sort((x, y) => String(x?.providerEventId).localeCompare(String(y?.providerEventId)))) {
    const r = foldEventIntoLedger(rows, a, nowIso);
    rows = r.rows;
    for (const k of Object.keys(totals)) totals[k] += r[k];
  }
  return { rows, ...totals, counts: countsOf(rows) };
}

/**
 * What the ledger holds, counted the way the record actually works.
 *
 * ⚠ `noMeasurement` is reported beside the decided rows and NEVER inside them. A row with no
 * measurement has no forecast result, so counting it as a miss would turn an absence of evidence
 * into evidence of a wrong forecast — the exact arithmetic the roadmap forbids.
 */
export function countsOf(rows) {
  const r = rows ?? [];
  const decided = r.filter((x) => x.forecastResult === "WIN" || x.forecastResult === "LOSS");
  return {
    rows: r.length,
    observed: r.filter((x) => x.measurementState === "OBSERVED").length,
    noMeasurement: r.filter((x) => x.measurementState === "NO_MEASUREMENT").length,
    canonical: r.filter((x) => x.finality === "CANONICAL").length,
    provisional: r.filter((x) => x.finality === "PROVISIONAL").length,
    decided: decided.length,
    forecastWins: decided.filter((x) => x.forecastResult === "WIN").length,
    forecastLosses: decided.filter((x) => x.forecastResult === "LOSS").length,
    push: r.filter((x) => x.lineResult === "PUSH").length,
    notApplicable: r.filter((x) => x.forecastResult === "NOT_APPLICABLE").length,
    corrected: r.filter((x) => (x.corrections ?? []).length > 0).length,
    bookRuleUnknown: r.filter((x) => x.bookRuleUnknown === true).length,
  };
}

/**
 * The ledger as graded-picks rows — a TRANSLATION, not a second grading.
 *
 * `hit` is our forecast's result and nothing else. A push, a no-measurement and a one-sided market
 * with no published side are all `null`, which keeps every one of them out of the denominator.
 *
 * ⚠ THE PUBLICATION BOUNDARY, AND IT FAILS CLOSED.
 *
 * The ledger deliberately records every family the producer tracks, including ESTIMATE ones —
 * `player_pass_yds` is ESTIMATE because P318 is STOP. Keeping that internally is research; putting
 * its record on a public surface is a claim about a model that failed its own preregistered bar.
 * Only a family the board itself declared PUBLISHED is translated, and a row whose state is unknown
 * is dropped rather than assumed publishable — an unrecognised state must not read as permission.
 */
export function toGradedPicks(rows) {
  return (rows ?? []).filter((r) => r.familyState === "PUBLISHED").map((r) => {
    const line = r.frozen?.market?.line ?? null;
    const book = r.frozen?.market?.sportsbook ?? null;
    return {
      eventId: `nfl-${r.eventId}`,
      when: r.slateDateEt ?? slateDateEtOf(r.kickoffUtc),
      eventName: r.matchup ?? null,
      subject: `${r.playerName} · ${r.teamAbbr}`,
      market: line != null ? `${labelFor(r.family)} ${line}${book ? ` (${book})` : ""}` : labelFor(r.family),
      /* Rounded the way the board renders it — a projection shown to four decimals is a precision
         the model does not have and did not publish. */
      predicted: r.frozen?.projection?.median != null ? String(Math.round(r.frozen.projection.median)) : null,
      actual: r.finalStat != null ? String(r.finalStat) : null,
      modelProbability: null,
      probabilityOfActual: null,
      marketProbabilityOfActual: null,
      hit: r.forecastResult === "WIN" ? true : r.forecastResult === "LOSS" ? false : null,
    };
  });
}

const FAMILY_LABEL = Object.freeze({
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
  player_rush_yds: "Rushing yards",
  player_pass_yds: "Passing yards",
  anytime_td: "Anytime TD",
});
function labelFor(family) {
  return FAMILY_LABEL[family] ?? family ?? "";
}
