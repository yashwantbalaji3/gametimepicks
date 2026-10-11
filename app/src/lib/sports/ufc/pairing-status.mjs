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
 *   GRADED_WIN / GRADED_LOSS   DECIDED: the pairing fought and an official result names a winner. When the
 *                               provider's per-judge cards exist, their majority must agree with the winner
 *                               flag, or the bout is RESULT_INCONSISTENT instead.
 *   OFFICIAL_DRAW              the pairing fought to a draw, on EVIDENCE: the provider's three judge cards
 *                               give no fighter two cards AND both fighters' post-fight records show draws
 *                               +1 over the pregame card (W and L unchanged) — or an official source says
 *                               "draw" in its own words (the ufcstats corpus resultStatus). Void for winner
 *                               grading: never a hit, never a miss. Its evidence is recorded.
 *   NO_CONTEST                 only on an official source's explicit "no_contest". The provider's NC shape
 *                               has not been observed, so it is NOT inferred from the provider (see below).
 *   FINAL_NO_WINNER_UNVERIFIED final, no winner, and less than the full draw evidence (one signal, none, a
 *                               winner-only capture row, or a no-winner stoppage that may be an NC). Not
 *                               missing data and not pending: awaiting verification by a human or an
 *                               official source. Never graded, never in a denominator.
 *   RESULT_INCONSISTENT        the provider contradicts itself (judge-card majority vs winner flag, two
 *                               winners, partial cards on a decided bout). Never graded; review.
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
 * A FALSE WINNER FLAG IS NOT EVIDENCE. ESPN carries `winner: false` for BOTH sides in every state —
 * scheduled, in progress, end of round, end of fight, and a final draw alike. Only `winner: true` says
 * anything. A final with no winner is a draw only when the judges and the records both say so; on
 * 2026-10-10 the records of the Gatto v Kareckaite majority draw updated one fighter at a time over
 * twelve minutes after STATUS_FINAL, so an early capture is UNVERIFIED and a later one is a DRAW.
 *
 * Inputs (all pure data): snapshots (parsed snapshot-*.json docs, optionally with `file`); official
 * results (an array of { boutId, winner, loser, void, resultStatus?, source?, recordedAt?, overturned? });
 * providerCompetitions (raw ESPN scoreboard competition objects, or { competition, capturedAt }); pregame
 * cards (card docs whose bouts carry red/blue { name, record "W-L-D" }, keyed by provider bout id); now.
 */

import { foldName } from "./model-vs-market.mjs";

export const PAIRING_STATUS = Object.freeze({
  GRADED_WIN: "GRADED_WIN",
  GRADED_LOSS: "GRADED_LOSS",
  OFFICIAL_DRAW: "OFFICIAL_DRAW",
  NO_CONTEST: "NO_CONTEST",
  FINAL_NO_WINNER_UNVERIFIED: "FINAL_NO_WINNER_UNVERIFIED",
  RESULT_INCONSISTENT: "RESULT_INCONSISTENT",
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
  /** The provider contradicts itself (see RESULT_INCONSISTENT). */
  RESULT_INCONSISTENT: "RESULT_INCONSISTENT",
  /** The provider competition under this pairing's provider bout id names different fighters. */
  PROVIDER_PAIRING_MISMATCH: "PROVIDER_PAIRING_MISMATCH",
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
      if (specific) base = { ...base, resultStatus: specific.resultStatus, evidence: specific.evidence ?? base.evidence ?? null };
    }
  }
  if (notApplied.length > 0) flags.push(PAIRING_FLAG.RESULT_CHANGED_NOT_APPLIED);
  return { base, flags, notApplied: notApplied.map(frozenCopy) };
}

/* ── PROVIDER OUTCOME: what one ESPN competition object proves, and nothing more ─────────────────── */

export const PROVIDER_OUTCOME = Object.freeze({
  DECIDED: "DECIDED",
  OFFICIAL_DRAW: "OFFICIAL_DRAW",
  FINAL_NO_WINNER_UNVERIFIED: "FINAL_NO_WINNER_UNVERIFIED",
  RESULT_INCONSISTENT: "RESULT_INCONSISTENT",
  AWAITING_RESULT: "AWAITING_RESULT",
});

/** "W-L-D" (anything after the three numbers is ignored, never guessed at). */
export function parseRecord(s) {
  const m = /^\s*(\d+)-(\d+)-(\d+)/.exec(String(s ?? ""));
  return m ? { w: Number(m[1]), l: Number(m[2]), d: Number(m[3]) } : null;
}
const overallRecord = (c) => {
  const recs = c?.records ?? [];
  return (recs.find((r) => r?.type === "total" || r?.name === "overall") ?? recs[0])?.summary ?? null;
};
/** Per-judge scores: competitors[].linescores[0].linescores[].value. The top-level total is never used. */
const judgeScores = (c) => (c?.linescores?.[0]?.linescores ?? []).map((j) => j?.value);

/**
 * Classify one provider competition. Pure and total.
 *
 * @param {object} competition  raw ESPN competition ({ status.type, competitors[] })
 * @param {object|null} pregame { red:{name,record}, blue:{name,record} } from the pregame card, or null
 */
export function classifyProviderOutcome(competition, pregame = null) {
  const st = competition?.status?.type ?? {};
  const statusName = st.name ?? null;
  const base = { providerBoutId: competition?.id != null ? String(competition.id) : null, statusName, completed: st.completed === true };
  if (!(statusName === "STATUS_FINAL" && st.completed === true)) {
    // Scheduled, pre-fight, walking, in progress, END_OF_ROUND, END_OF_FIGHT, …: not a result yet.
    return { ...base, outcome: PROVIDER_OUTCOME.AWAITING_RESULT, reason: `not final (${statusName ?? "no status"}, completed ${st.completed === true})` };
  }
  const sides = (competition?.competitors ?? []).map((c) => ({
    name: c?.athlete?.displayName ?? c?.athlete?.fullName ?? null,
    winner: c?.winner === true,
    cards: judgeScores(c),
    record: overallRecord(c),
  }));
  if (sides.length !== 2 || !sides.every((x) => x.name)) {
    return { ...base, outcome: PROVIDER_OUTCOME.RESULT_INCONSISTENT, reason: "a final without exactly two named competitors" };
  }

  /* Signal (a): the judge cards, judge by judge. */
  const anyCards = sides.some((x) => x.cards.length > 0);
  const completeCards = sides.every((x) => x.cards.length === 3 && x.cards.every((v) => typeof v === "number" && Number.isFinite(v)));
  const perJudge = completeCards ? [0, 1, 2].map((i) => (sides[0].cards[i] > sides[1].cards[i] ? 0 : sides[1].cards[i] > sides[0].cards[i] ? 1 : null)) : null;
  const cardsWon = perJudge ? [perJudge.filter((x) => x === 0).length, perJudge.filter((x) => x === 1).length] : null;
  const cardMajority = cardsWon ? (cardsWon[0] >= 2 ? 0 : cardsWon[1] >= 2 ? 1 : null) : null;
  const judgeCards = {
    present: anyCards,
    complete: completeCards,
    scores: Object.fromEntries(sides.map((x) => [x.name, x.cards])),
    perJudge: perJudge ? perJudge.map((x) => (x == null ? "EVEN" : sides[x].name)) : null,
    majority: cardMajority == null ? null : sides[cardMajority].name,
    isDraw: completeCards && cardMajority == null,
  };

  /* Signal (b): records versus the pregame card — draws +1, wins and losses unchanged. */
  const pre = (name) => {
    const k = looseName(name);
    const hit = [pregame?.red, pregame?.blue].find((x) => x && looseName(x.name) === k);
    return hit ? parseRecord(hit.record) : null;
  };
  const recordDeltas = sides.map((x) => {
    const before = pre(x.name), after = parseRecord(x.record);
    return { name: x.name, pregame: before, post: after, delta: before && after ? { w: after.w - before.w, l: after.l - before.l, d: after.d - before.d } : null };
  });
  const recordsDrawPlusOne = recordDeltas.every((r) => r.delta && r.delta.w === 0 && r.delta.l === 0 && r.delta.d === 1);
  const signals = { judgeCards, records: { recordsDrawPlusOne, deltas: recordDeltas } };

  const winners = sides.map((x, i) => (x.winner ? i : null)).filter((i) => i != null);
  if (winners.length > 1) return { ...base, outcome: PROVIDER_OUTCOME.RESULT_INCONSISTENT, reason: "both competitors flagged winner", signals };
  if (winners.length === 1) {
    const w = winners[0];
    if (anyCards && !completeCards) return { ...base, outcome: PROVIDER_OUTCOME.RESULT_INCONSISTENT, reason: "judge cards present but not three per side", signals };
    if (completeCards && cardMajority !== w) {
      return { ...base, outcome: PROVIDER_OUTCOME.RESULT_INCONSISTENT, reason: `winner flag ${sides[w].name}, judge-card majority ${judgeCards.majority ?? "none (a draw on the cards)"}`, signals };
    }
    return { ...base, outcome: PROVIDER_OUTCOME.DECIDED, winner: sides[w].name, loser: sides[1 - w].name, reason: completeCards ? "winner flag, judge-card majority agrees" : "winner flag (no judge cards: a stoppage)", signals };
  }
  if (judgeCards.isDraw && recordsDrawPlusOne) {
    return { ...base, outcome: PROVIDER_OUTCOME.OFFICIAL_DRAW, reason: "no winner flag; three judge cards with no fighter winning two; both records draws +1 over the pregame card", signals };
  }
  const missing = [
    !judgeCards.isDraw ? (completeCards ? `judge cards name a majority (${judgeCards.majority})` : "no complete judge cards") : null,
    !recordsDrawPlusOne ? "records do not both show draws +1 over the pregame card" : null,
  ].filter(Boolean);
  // A no-winner stoppage lands here too: it may be a no-contest, whose provider shape is unobserved.
  return { ...base, outcome: PROVIDER_OUTCOME.FINAL_NO_WINNER_UNVERIFIED, reason: `final without a winner flag; unverified: ${missing.join("; ")}`, signals };
}

const frozen0Ids = (snaps) => snaps.flatMap((s) => (s.rows ?? []).map((r) => String(r.providerBoutId)));

function snapshotRef(s) {
  return { file: s.file ?? null, capturedAt: s.capturedAt ?? null };
}

/**
 * Classify every frozen pairing of every card in `snapshots`.
 *
 * @param {object} o
 * @param {Array<object>} o.snapshots  parsed snapshot docs ({ capturedAt, event:{slateDate,name,startUtc}, rows, skipped, file? })
 * @param {Array<object>} o.results    official result records (see header)
 * @param {Array<object>} [o.providerCompetitions] raw ESPN competitions, or { competition, capturedAt }
 * @param {Array<object>} [o.pregameCards]         card docs ({ bouts:[{ boutId, red:{name,record}, blue:{name,record} }] })
 * @param {string} o.now               ISO instant; snapshots captured after it are not yet known
 */
export function classifyPairings({ snapshots = [], results = [], providerCompetitions = [], pregameCards = [], now } = {}) {
  const nowMs = ms(now);
  if (nowMs == null) throw new Error("classifyPairings: `now` must be an ISO instant");

  /* The newest capture of each provider competition known at `now`. */
  const compById = new Map();
  for (const [i, x] of (providerCompetitions ?? []).entries()) {
    const comp = x?.competition ?? x;
    if (comp?.id == null) continue;
    const t = ms(x?.capturedAt);
    if (t != null && t > nowMs) continue;
    const prev = compById.get(String(comp.id));
    if (!prev || (t ?? -Infinity) > (prev.t ?? -Infinity) || ((t ?? -Infinity) === (prev.t ?? -Infinity) && i > prev.i)) compById.set(String(comp.id), { comp, t, i });
  }
  const pregameById = new Map();
  for (const card of pregameCards ?? []) for (const b of card?.bouts ?? []) if (b?.boutId != null) pregameById.set(String(b.boutId), { red: b.red ?? null, blue: b.blue ?? null });

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
    const providerFinalOnCard = [...frozen0Ids(eligible), ...(finalSnap?.skipped ?? []).map((k) => String(k.boutId))]
      .some((id) => compById.get(id)?.comp?.status?.type?.completed === true);
    const cardReported = cardResults.length > 0 || providerFinalOnCard;

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
      /* The provider's own competition, by provider bout id — used only if it names THIS pairing. */
      let providerOutcome = null;
      const pc = compById.get(String(f.row.providerBoutId));
      if (pc) {
        const names = (pc.comp.competitors ?? []).map((c) => looseName(c?.athlete?.displayName ?? c?.athlete?.fullName));
        const mine = rowNames(f.row).map(looseName);
        if (names.length === 2 && mine.every((n) => names.includes(n))) {
          providerOutcome = classifyProviderOutcome(pc.comp, pregameById.get(String(f.row.providerBoutId)) ?? null);
        } else {
          flags.push(PAIRING_FLAG.PROVIDER_PAIRING_MISMATCH);
        }
      }
      const providerRecord = !providerOutcome ? null
        : providerOutcome.outcome === PROVIDER_OUTCOME.DECIDED
          ? { boutId, winner: providerOutcome.winner, loser: providerOutcome.loser, void: false, source: "espn_competition", evidence: providerOutcome }
          : providerOutcome.outcome === PROVIDER_OUTCOME.OFFICIAL_DRAW
            ? { boutId, winner: null, loser: null, void: true, resultStatus: "draw", source: "espn_competition", evidence: providerOutcome }
            : providerOutcome.outcome === PROVIDER_OUTCOME.FINAL_NO_WINNER_UNVERIFIED
              ? { boutId, winner: null, loser: null, void: true, resultStatus: null, source: "espn_competition", evidence: providerOutcome }
              : null;
      const inconsistent = providerOutcome?.outcome === PROVIDER_OUTCOME.RESULT_INCONSISTENT;
      if (providerRecord) records = [...(records ?? []), providerRecord];

      const { base, flags: rFlags, notApplied } = resolveResult(records);
      flags.push(...rFlags);
      let status;
      let result = null;

      if (inconsistent) {
        flags.push(PAIRING_FLAG.RESULT_INCONSISTENT);
        status = PAIRING_STATUS.RESULT_INCONSISTENT;
        result = base ? frozenCopy(base) : null;
      } else if (base) {
        result = frozenCopy(base);
        if (!inFinal) flags.push(PAIRING_FLAG.FOUGHT_THOUGH_ABSENT_FROM_FINAL);
        if (isVoid(base)) {
          const k = voidKind(base);
          status = k === "DRAW" ? PAIRING_STATUS.OFFICIAL_DRAW : k === "NO_CONTEST" ? PAIRING_STATUS.NO_CONTEST : PAIRING_STATUS.FINAL_NO_WINNER_UNVERIFIED;
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
        providerOutcome: providerOutcome ? frozenCopy(providerOutcome) : null,
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
    const officialDraw = n(PAIRING_STATUS.OFFICIAL_DRAW), noContest = n(PAIRING_STATUS.NO_CONTEST);
    const voids = officialDraw + noContest;
    const unverified = n(PAIRING_STATUS.FINAL_NO_WINNER_UNVERIFIED), inconsistentN = n(PAIRING_STATUS.RESULT_INCONSISTENT);
    const withdrawn = n(PAIRING_STATUS.WITHDRAWN_BEFORE_START), pending = n(PAIRING_STATUS.AWAITING_RESULT);
    const counts = {
      frozen: pairings.length,
      graded: wins + losses, wins, losses,
      void: voids, officialDraw, noContest, unverified, inconsistent: inconsistentN, withdrawn, pending,
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
      reconciles: counts.frozen === counts.graded + counts.void + counts.unverified + counts.inconsistent + counts.withdrawn + counts.pending,
      pairings,
      excluded,
    }));
  }
  return { now, cards };
}
