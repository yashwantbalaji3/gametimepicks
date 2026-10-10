/**
 * WHAT HAPPENED TO EVERY FROZEN PAIRING? (UFC-001 · U4 / founder decision D3 — PROPOSAL, NOT APPLIED)
 *
 * The model-vs-market grader freezes a pairing the first time a pre-start snapshot holds it, and
 * then waits for an official result keyed by that exact pairing. A pairing that stops being a fight
 * — Mickey Gall was replaced by Luis Hernandez against Sedriques Dumas on 2026-09-26 — never gets a
 * result under its own key, so it reads "pending 1" forever. Nothing in the pipeline can tell
 * "waiting on the provider" from "this fight is not going to happen".
 *
 * This module is the general rule, as a pure classification. Every frozen pairing of a card lands in
 * EXACTLY ONE status:
 *
 *   GRADED_WIN / GRADED_LOSS   the pairing fought and an official result names a winner.
 *   VOID_DRAW / VOID_NO_CONTEST the pairing fought and produced no winner; the source said which.
 *   VOID_NO_WINNER_UNSPECIFIED the pairing fought, no winner, and the source cannot say draw vs NC
 *                               (the ESPN capture is winner-only — settlement-contract.mjs refuses
 *                               to guess between them, and so does this).
 *   WITHDRAWN_BEFORE_START     the pairing is in an EARLIER pre-start snapshot, is NOT in the card's
 *                               FINAL pre-start snapshot (neither as a row nor as a skipped provider
 *                               bout id), the card has started, the provider has reported the card,
 *                               and the provider never reported this pairing as fought. Never graded,
 *                               never void, never in a hit-rate denominator. Its record is kept with
 *                               the snapshot evidence and the replacement pairing, if one shares a
 *                               fighter or the provider bout id.
 *   AWAITING_RESULT            everything that is not yet decidable: in the final pre-start snapshot
 *                               with no official result, or any case whose evidence is ambiguous.
 *
 * Bouts in the final snapshot that were NEVER frozen (the snapshot skipped them) are listed apart,
 * outside the frozen population, as UNPRICED_EXCLUDED or NO_READ_EXCLUDED. A missing price is never a
 * loss and never a pending forecast — there was no forecast.
 *
 * WHY THE RULE IS CONSERVATIVE. Withdrawn is only reached on positive evidence that the pairing left
 * the card BEFORE it froze for the last time. Anything that disappears after the final snapshot
 * (a late replacement, a provider that drops the bout) stays AWAITING_RESULT and is flagged — those
 * are different facts and this rule does not cover them.
 *
 * WHAT IT NEVER DOES. It writes nothing, reads nothing, and never changes a frozen forecast: the
 * forecast it returns is a frozen deep copy of the row in the latest pre-start snapshot that held the
 * pairing — the same row the grader scores. An overturned or contradicted result is FLAGGED and the
 * earliest official record is kept: corrections need lineage (settlement-contract.mjs) and are out of
 * scope here.
 *
 * Inputs: snapshots (parsed snapshot-*.json docs, optionally with `file`), official results (an
 * array of { boutId, winner, loser, void, resultStatus?, source?, recordedAt?, overturned? }), now.
 */

import { foldName } from "./model-vs-market.mjs";

export const PAIRING_STATUS = Object.freeze({
  GRADED_WIN: "GRADED_WIN",
  GRADED_LOSS: "GRADED_LOSS",
  VOID_DRAW: "VOID_DRAW",
  VOID_NO_CONTEST: "VOID_NO_CONTEST",
  VOID_NO_WINNER_UNSPECIFIED: "VOID_NO_WINNER_UNSPECIFIED",
  WITHDRAWN_BEFORE_START: "WITHDRAWN_BEFORE_START",
  AWAITING_RESULT: "AWAITING_RESULT",
});

/** Statuses for bouts that were never frozen (outside the frozen population). */
export const EXCLUDED_STATUS = Object.freeze({
  UNPRICED_EXCLUDED: "UNPRICED_EXCLUDED",
  NO_READ_EXCLUDED: "NO_READ_EXCLUDED",
});

export const PAIRING_FLAG = Object.freeze({
  /** Before start the "final" snapshot is only the latest so far; nothing can be withdrawn yet. */
  CARD_NOT_STARTED: "CARD_NOT_STARTED",
  /** Absent from the final snapshot, but the provider has reported nothing for the card yet. */
  CARD_UNREPORTED: "CARD_UNREPORTED",
  /** Absent from the final snapshot's rows, but its provider bout id is in that snapshot's skipped list. */
  ON_FINAL_CARD_WITHOUT_FORECAST: "ON_FINAL_CARD_WITHOUT_FORECAST",
  /** An official result exists for a pairing that the final snapshot no longer held. */
  FOUGHT_THOUGH_ABSENT_FROM_FINAL: "FOUGHT_THOUGH_ABSENT_FROM_FINAL",
  /** In the final snapshot, no result, and the provider reports another pairing with one of its fighters. */
  POSSIBLE_LATE_REPLACEMENT: "POSSIBLE_LATE_REPLACEMENT",
  /** More than one agreeing official record for the pairing. Classified once. */
  DUPLICATE_RESULT: "DUPLICATE_RESULT",
  /** A later or marked-overturned record disagrees with the first. Flagged; NOT applied. */
  RESULT_CHANGED_NOT_APPLIED: "RESULT_CHANGED_NOT_APPLIED",
  /** Only overturn-marked records exist: nothing to stand on. */
  NO_BASE_RESULT: "NO_BASE_RESULT",
  /** No result under the exact key; one joined on the looser name identity (see looseName). */
  RESULT_JOINED_BY_LOOSE_NAME: "RESULT_JOINED_BY_LOOSE_NAME",
  /** The result's winner is neither fighter in the pairing key. */
  RESULT_NAMES_MISMATCH: "RESULT_NAMES_MISMATCH",
});

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };
const fightersOf = (boutId) => String(boutId ?? "").slice(11).split("|").filter(Boolean);
const dateOf = (boutId) => String(boutId ?? "").slice(0, 10);
/**
 * Re-key a result to the snapshot's canonical form. The ufcstats corpus ships its own boutId with
 * punctuation intact ("…|raul rosas jr.") where the snapshot folded it ("…|raul rosas jr"); 69 corpus
 * ids on main are non-canonical. Folding each side is idempotent on an already-canonical key.
 */
export const canonicalBoutId = (boutId) => {
  const id = String(boutId ?? "");
  return `${id.slice(0, 10)}:${id.slice(11).split("|").map(foldName).sort().join("|")}`;
};
/**
 * A LOOSER name identity, used only to decide whether two records name the same fighter. foldName
 * turns letters NFD cannot decompose into spaces ("Syguła" → "sygu a", which never meets the corpus's
 * "sygula") and keeps word order ("jingnan xiong" vs "xiong jingnan"). Both happened on main: the
 * 2026-08-29 and 2026-09-05 cards each hold one ledger-graded bout whose exact key no longer joins any
 * result on disk. Without this a withdrawn verdict could rest on a spelling.
 */
const LATIN_EXTRA = { "ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ı": "i", "þ": "th", "ð": "d" };
export const looseName = (s) => foldName(String(s ?? "").replace(/[łŁøØđĐßæÆœŒıþð]/g, (c) => LATIN_EXTRA[c] ?? c)).split(" ").filter(Boolean).sort().join(" ");
const looseKey = (date, names) => `${date}:${names.map(looseName).sort().join("|")}`;
/** Display names of a frozen row (the row keeps the unfolded spelling; the boutId does not). */
const rowNames = (r) => [r?.pick, r?.opponent].filter(Boolean);
/** Names a result record carries: its winner/loser, else the parts of its own key. */
const resultNames = (r) => (r?.winner && r?.loser ? [r.winner, r.loser] : fightersOf(r?.boutId));
const frozenCopy = (o) => deepFreeze(JSON.parse(JSON.stringify(o)));
function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Normalise a result's no-winner kind from the source's own words. Never inferred from anything else. */
function voidKind(r) {
  const s = String(r?.resultStatus ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "draw") return "DRAW";
  if (s === "nocontest" || s === "nc") return "NO_CONTEST";
  return "UNSPECIFIED";
}
const isVoid = (r) => r?.void === true || !r?.winner || !r?.loser;
const isOverturnRecord = (r) => r?.overturned === true || /overturn/i.test(String(r?.resultStatus ?? ""));

/** Do two records describe the same outcome? An UNSPECIFIED void agrees with either void kind. */
function sameOutcome(a, b) {
  if (isVoid(a) !== isVoid(b)) return false;
  if (!isVoid(a)) return looseName(a.winner) === looseName(b.winner);
  const ka = voidKind(a), kb = voidKind(b);
  return ka === kb || ka === "UNSPECIFIED" || kb === "UNSPECIFIED";
}

/**
 * One base result per pairing. The EARLIEST record that is not itself marked as an overturn is the
 * base — the one an append-only ledger would already hold. Any disagreeing record is reported, never
 * applied.
 */
function resolveResult(records) {
  if (!records?.length) return { base: null, flags: [], notApplied: [] };
  const ordered = records
    .map((r, i) => ({ r, i, t: ms(r.recordedAt) }))
    .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
  const candidates = ordered.filter((r) => !isOverturnRecord(r));
  if (candidates.length === 0) {
    return { base: null, flags: [PAIRING_FLAG.NO_BASE_RESULT, PAIRING_FLAG.RESULT_CHANGED_NOT_APPLIED], notApplied: ordered.map(frozenCopy) };
  }
  let base = candidates[0];
  const flags = [];
  const notApplied = ordered.filter((r) => r !== base && (isOverturnRecord(r) || !sameOutcome(base, r)));
  const agreeing = ordered.filter((r) => r !== base && !notApplied.includes(r));
  if (agreeing.length > 0) {
    flags.push(PAIRING_FLAG.DUPLICATE_RESULT);
    // An agreeing duplicate may be the more specific one (draw vs unspecified); take its words.
    if (isVoid(base) && voidKind(base) === "UNSPECIFIED") {
      const specific = agreeing.find((r) => voidKind(r) !== "UNSPECIFIED");
      if (specific) base = { ...base, resultStatus: specific.resultStatus };
    }
  }
  if (notApplied.length > 0) flags.push(PAIRING_FLAG.RESULT_CHANGED_NOT_APPLIED);
  return { base, flags, notApplied: notApplied.map(frozenCopy) };
}

function snapshotRef(s) {
  return { file: s.file ?? null, capturedAt: s.capturedAt ?? null };
}

/**
 * Classify every frozen pairing of every card in `snapshots`.
 *
 * @param {object} o
 * @param {Array<object>} o.snapshots  parsed snapshot docs ({ capturedAt, event:{slateDate,name,startUtc}, rows, skipped, file? })
 * @param {Array<object>} o.results    official result records (see header)
 * @param {string} o.now               ISO instant; snapshots captured after it are not yet known
 */
export function classifyPairings({ snapshots = [], results = [], now } = {}) {
  const nowMs = ms(now);
  if (nowMs == null) throw new Error("classifyPairings: `now` must be an ISO instant");

  const resultsByBout = new Map();
  const resultsByLoose = new Map();
  const push = (m, k, r) => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); };
  for (const r of results ?? []) {
    if (!r?.boutId) continue;
    const key = canonicalBoutId(r.boutId);
    push(resultsByBout, key, r);
    push(resultsByLoose, looseKey(dateOf(key), resultNames(r)), r);
  }

  /* Group by card. The card's start is the latest snapshot's own start — the freshest knowledge. */
  const byCard = new Map();
  for (const s of snapshots ?? []) {
    const key = s?.event?.slateDate;
    if (!key) continue;
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key).push(s);
  }

  const cards = [];
  for (const [slateDate, list] of [...byCard.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = list
      .map((s, i) => ({ s, i, t: ms(s.capturedAt) }))
      .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || String(a.s.file ?? "").localeCompare(String(b.s.file ?? "")) || a.i - b.i);
    const knownNow = ordered.filter((x) => x.t != null && x.t <= nowMs);
    const latestKnown = knownNow.at(-1)?.s ?? null;
    const startUtc = latestKnown?.event?.startUtc ?? ordered.at(-1)?.s?.event?.startUtc ?? null;
    const startMs = ms(startUtc);

    const ignoredSnapshots = [];
    const eligible = [];
    for (const x of ordered) {
      if (x.t == null) ignoredSnapshots.push({ ...snapshotRef(x.s), reason: "no parseable capturedAt" });
      else if (x.t > nowMs) ignoredSnapshots.push({ ...snapshotRef(x.s), reason: "captured after `now` — not yet known" });
      else if (startMs == null) ignoredSnapshots.push({ ...snapshotRef(x.s), reason: "card has no parseable startUtc" });
      else if (x.t >= startMs) ignoredSnapshots.push({ ...snapshotRef(x.s), reason: "captured at or after the card start — not pre-start" });
      else eligible.push(x.s);
    }

    const started = startMs != null && nowMs >= startMs;
    const finalSnap = eligible.at(-1) ?? null;
    const finalBoutIds = new Set((finalSnap?.rows ?? []).map((r) => r.boutId));
    const finalProviderIds = new Set((finalSnap?.rows ?? []).map((r) => String(r.providerBoutId)));
    const finalSkipped = new Map((finalSnap?.skipped ?? []).map((k) => [String(k.boutId), k]));

    /* Official results on this card's date: has the provider reported the card at all? */
    const cardResults = [];
    for (const [id, recs] of resultsByBout) if (dateOf(id) === slateDate) cardResults.push({ boutId: id, recs, names: resultNames(recs[0]) });
    const cardReported = cardResults.length > 0;

    /* The frozen population: every pairing any eligible snapshot held. Latest row wins as the record. */
    const frozen = new Map();
    for (const s of eligible) {
      for (const r of s.rows ?? []) {
        if (!r?.boutId) continue;
        const prev = frozen.get(r.boutId);
        frozen.set(r.boutId, {
          row: r,
          first: prev?.first ?? snapshotRef(s),
          last: snapshotRef(s),
          snapshotCount: (prev?.snapshotCount ?? 0) + 1,
        });
      }
    }
    const frozenProviderIds = new Set([...frozen.values()].map((f) => String(f.row.providerBoutId)));

    /** A pairing that shares a fighter (or the provider bout id) with `boutId`, preferring the final snapshot. */
    const replacementFor = (row, { fromSnapshot = true, fromResults = true } = {}) => {
      const mine = new Set(rowNames(row).map(looseName));
      const myKey = looseKey(slateDate, rowNames(row));
      if (fromSnapshot) {
        for (const r of finalSnap?.rows ?? []) {
          if (r.boutId === row.boutId || looseKey(slateDate, rowNames(r)) === myKey) continue;
          const shared = rowNames(r).filter((n) => mine.has(looseName(n)));
          if (shared.length > 0 || String(r.providerBoutId) === String(row.providerBoutId)) {
            return { boutId: r.boutId, providerBoutId: String(r.providerBoutId), sharedFighters: shared, source: "final_snapshot" };
          }
        }
      }
      if (fromResults) {
        for (const { boutId: id, names } of cardResults) {
          if (id === row.boutId || looseKey(slateDate, names) === myKey) continue;
          const shared = names.filter((n) => mine.has(looseName(n)));
          if (shared.length > 0) return { boutId: id, providerBoutId: null, sharedFighters: shared, source: "official_results" };
        }
      }
      return null;
    };

    const pairings = [];
    for (const [boutId, f] of [...frozen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const forecast = frozenCopy({ ...f.row, capturedAt: f.last.capturedAt, sourceFile: f.last.file });
      const inFinal = finalBoutIds.has(boutId);
      const evidence = {
        firstSnapshot: f.first,
        lastSnapshot: f.last,
        finalSnapshot: finalSnap ? snapshotRef(finalSnap) : null,
        snapshotsContaining: f.snapshotCount,
        inFinalSnapshot: inFinal,
        replacement: null,
      };
      const flags = [];
      // Exact key first; the loose identity only when the exact key finds nothing, and then flagged.
      let records = resultsByBout.get(boutId);
      if (!records?.length) {
        records = resultsByLoose.get(looseKey(slateDate, rowNames(f.row)));
        if (records?.length) flags.push(PAIRING_FLAG.RESULT_JOINED_BY_LOOSE_NAME);
      }
      const { base, flags: rFlags, notApplied } = resolveResult(records);
      flags.push(...rFlags);
      let status;
      let result = null;

      if (base) {
        result = frozenCopy(base);
        if (!inFinal) flags.push(PAIRING_FLAG.FOUGHT_THOUGH_ABSENT_FROM_FINAL);
        if (isVoid(base)) {
          const k = voidKind(base);
          status = k === "DRAW" ? PAIRING_STATUS.VOID_DRAW : k === "NO_CONTEST" ? PAIRING_STATUS.VOID_NO_CONTEST : PAIRING_STATUS.VOID_NO_WINNER_UNSPECIFIED;
        } else if (![...rowNames(f.row), ...fightersOf(boutId)].map(looseName).includes(looseName(base.winner))) {
          flags.push(PAIRING_FLAG.RESULT_NAMES_MISMATCH);
          status = PAIRING_STATUS.AWAITING_RESULT;
        } else {
          status = looseName(base.winner) === looseName(f.row.pick) ? PAIRING_STATUS.GRADED_WIN : PAIRING_STATUS.GRADED_LOSS;
        }
      } else if (inFinal) {
        status = PAIRING_STATUS.AWAITING_RESULT;
        if (!started) flags.push(PAIRING_FLAG.CARD_NOT_STARTED);
        else {
          const late = replacementFor(f.row, { fromSnapshot: false, fromResults: true });
          if (late) { flags.push(PAIRING_FLAG.POSSIBLE_LATE_REPLACEMENT); evidence.replacement = late; }
        }
      } else if (!started) {
        status = PAIRING_STATUS.AWAITING_RESULT;
        flags.push(PAIRING_FLAG.CARD_NOT_STARTED);
      } else if (finalSkipped.has(String(f.row.providerBoutId))) {
        // Still on the card at the final freeze, just without a usable price or read. Not withdrawn.
        status = PAIRING_STATUS.AWAITING_RESULT;
        flags.push(PAIRING_FLAG.ON_FINAL_CARD_WITHOUT_FORECAST);
      } else if (!cardReported) {
        status = PAIRING_STATUS.AWAITING_RESULT;
        flags.push(PAIRING_FLAG.CARD_UNREPORTED);
      } else {
        status = PAIRING_STATUS.WITHDRAWN_BEFORE_START;
        evidence.replacement = replacementFor(f.row);
      }

      pairings.push(deepFreeze({
        boutId,
        providerBoutId: String(f.row.providerBoutId ?? ""),
        status,
        forecast,
        result,
        resultsNotApplied: notApplied,
        evidence,
        flags: [...new Set(flags)],
      }));
    }

    /* Never frozen: final-snapshot skips whose provider bout id never had a frozen row. */
    const excluded = [];
    for (const [pid, k] of finalSkipped) {
      if (frozenProviderIds.has(pid) || finalProviderIds.has(pid)) continue;
      const unpriced = /price/i.test(String(k.reason ?? ""));
      excluded.push(deepFreeze({
        providerBoutId: pid,
        status: unpriced ? EXCLUDED_STATUS.UNPRICED_EXCLUDED : EXCLUDED_STATUS.NO_READ_EXCLUDED,
        reason: k.reason ?? null,
      }));
    }

    const n = (st) => pairings.filter((p) => p.status === st).length;
    const wins = n(PAIRING_STATUS.GRADED_WIN), losses = n(PAIRING_STATUS.GRADED_LOSS);
    const voids = n(PAIRING_STATUS.VOID_DRAW) + n(PAIRING_STATUS.VOID_NO_CONTEST) + n(PAIRING_STATUS.VOID_NO_WINNER_UNSPECIFIED);
    const withdrawn = n(PAIRING_STATUS.WITHDRAWN_BEFORE_START), pending = n(PAIRING_STATUS.AWAITING_RESULT);
    const counts = {
      frozen: pairings.length,
      graded: wins + losses, wins, losses,
      void: voids, withdrawn, pending,
      hitRateDenominator: wins + losses,
      unpricedExcluded: excluded.filter((e) => e.status === EXCLUDED_STATUS.UNPRICED_EXCLUDED).length,
      noReadExcluded: excluded.filter((e) => e.status === EXCLUDED_STATUS.NO_READ_EXCLUDED).length,
    };

    cards.push(deepFreeze({
      slateDate,
      eventName: latestKnown?.event?.name ?? ordered.at(-1)?.s?.event?.name ?? null,
      startUtc,
      started,
      finalSnapshotDetermined: started && finalSnap != null,
      finalSnapshot: finalSnap ? snapshotRef(finalSnap) : null,
      snapshotsConsidered: eligible.length,
      ignoredSnapshots,
      cardReported,
      counts,
      reconciles: counts.frozen === counts.graded + counts.void + counts.withdrawn + counts.pending,
      pairings,
      excluded,
    }));
  }
  return { now, cards };
}
