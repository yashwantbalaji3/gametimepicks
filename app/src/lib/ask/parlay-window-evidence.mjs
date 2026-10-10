/**
 * THE PARLAY WINDOW'S EVIDENCE — when an empty published-parlays window is a fact and when it is a fault.
 *
 * The published-parlays guard (ask-published.test.mjs) checks every candidate's sport against the capability
 * registry. With no candidate it would pass having checked nothing, so it demanded at least one candidate or
 * one card-leg withholding. On 2026-10-10 the window (10-08, 10-09, 10-10) held neither, and that was CORRECT:
 * 10-09 had no MLB game, and 10-08 / 10-10 were single-game slates on which the optimizer's own rules
 * (Low needs 2 low-eligible legs; Medium+ need 3+ legs at most 2 per game) admit no slip. The guard could not
 * tell that from an optimizer that had silently stopped producing — both are an empty array.
 *
 * This module tells them apart from PRODUCER evidence only. pipeline/snapshot_optimizer.py writes a
 * `generationReceipt` into every snapshot (what it read, the leg pool it built, and per public section the
 * counts its own filters left and the reason it is empty); the Ask projection carries a cross-checked digest
 * of that receipt per date (`evidence`) and a window audit (`windowAudit`). Nothing here re-derives an
 * eligibility rule, and nothing here can make a day look evidenced: an absent receipt is absent.
 *
 * The six cases the founder required to be distinct, and what each does to the guard:
 *
 *   EMPTY_EVIDENCED      a completed run whose receipt says NO_ELIGIBLE_SLIPS and names, for every public
 *                        section, a rule that empties it verifiably from the recorded counts.      ACCEPTED
 *   NO_QUALIFYING_GAMES  a completed run whose receipt says every board it read parsed and listed no
 *                        game.                                                                         ACCEPTED
 *   MISSING_OUTPUT       an upstream board exists for a date in the window and no snapshot does.       FAILS
 *   FAILED_RUN           the producer recorded a failed attempt newer than any snapshot for the date.  FAILS
 *   MISSING_EVIDENCE     an empty day without a receipt, or with a receipt whose reasons do not explain
 *                        the emptiness.                                                                FAILS*
 *   STALE_OR_INCOMPLETE  a receipt that disagrees with its own snapshot, a board regenerated after the
 *                        snapshot read it, inputs missing / unreadable / without props, or slips the
 *                        producer built that the projection does not carry.                            FAILS
 *
 *   INVALID_EVIDENCE     evidence that is fabricated, mis-bound or contradicted: a receipt without producer
 *                        provenance, a RECONSTRUCTED receipt claiming to be genuine, outside the allowlist,
 *                        bound to a different snapshot hash, or whose replay did not reproduce.        FAILS
 *
 *   RECONSTRUCTED receipts (decision B′) are accepted only through RECONSTRUCTED_RECEIPT_ALLOWLIST below.
 *
 *   * A receipt-less empty day that is OLDER than every receipt-bearing snapshot is a legacy day, written
 *     before the producer recorded receipts. It fails the guard only when the window is otherwise vacuous
 *     (nothing checked, nothing withheld) — the original F-1 rule, unchanged. A receipt-less snapshot NEWER
 *     than a receipt-bearing one is a producer regression and always fails.
 */

export const PARLAY_DAY_VERDICT = Object.freeze({
  HAS_SLIPS: "HAS_SLIPS",
  WITHHELD: "WITHHELD",
  EMPTY_EVIDENCED: "EMPTY_EVIDENCED",
  NO_QUALIFYING_GAMES: "NO_QUALIFYING_GAMES",
  MISSING_OUTPUT: "MISSING_OUTPUT",
  FAILED_RUN: "FAILED_RUN",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
  STALE_OR_INCOMPLETE: "STALE_OR_INCOMPLETE",
  INVALID_EVIDENCE: "INVALID_EVIDENCE",
});

/** The receipt version this reader understands. A different one is not evidence it can judge. */
export const OPTIMIZER_RECEIPT_VERSION = 1;

export const PUBLIC_SECTIONS = Object.freeze(["low", "medium", "high", "longshot"]);

/**
 * Section-empty reasons that are verifiable from the receipt's own counts. `no_priced_compatible_combination`
 * and `selector_dropped_all` are deliberately NOT here: enough legs survived and the search still produced
 * nothing, which is exactly what a broken optimizer looks like. Such a day fails and asks a human to look.
 */
export const VERIFIABLE_EMPTY_REASONS = Object.freeze(["no_leg_pool", "structurally_infeasible", "insufficient_eligible_legs"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Count published-section slips over the sport cuts. "all" is a view over them, never a separate pool. */
export function countSectionSlips(publicRiskSections) {
  let n = 0;
  for (const cuts of Object.values(publicRiskSections ?? {})) {
    for (const [cut, list] of Object.entries(cuts ?? {})) if (cut !== "all" && Array.isArray(list)) n += list.length;
  }
  return n;
}

/**
 * Verify one section's stated reason against its recorded counts. A reason that the numbers do not support
 * is not evidence, whatever it says.
 */
function reasonHolds(section, legPool) {
  const r = section?.emptyReason;
  const min = section?.minLegs;
  const cap = section?.maxLegsPerGame;
  const eligible = section?.eligibleLegs?.all;
  if (!Number.isInteger(min) || !Number.isInteger(cap) || !Number.isInteger(eligible)) return false;
  if (r === "no_leg_pool") return legPool.totalLegs === 0;
  if (r === "structurally_infeasible") return min > legPool.distinctGames * cap;
  if (r === "insufficient_eligible_legs") return eligible < min;
  return false;
}

/**
 * DECISION B′ — THE ONLY HISTORICAL COMPATIBILITY RULE. The snapshots below were written before the producer
 * recorded receipts. Each has a RECONSTRUCTED receipt (data/internal/parlays/optimizer-reconstruction/receipts/)
 * built by replaying the optimizer on its as-of inputs; pipeline/optimizer_reconstruction_test.py re-runs that
 * replay in the python job and requires it to reproduce the committed snapshot. A reconstruction is accepted
 * ONLY for a date listed here, ONLY when the committed snapshot's sha256 equals the hash listed here, and ONLY
 * where the snapshot has no genuine receipt. Nothing else in history is accepted this way, and future runs
 * must emit genuine producer receipts. Adding a date here is a founder decision, not a CI fix.
 */
export const RECONSTRUCTED_RECEIPT_ALLOWLIST = Object.freeze({
  "2026-10-08": "d0fab7bbd88dc4f153b2d423070589f804a4cfa89889396b418b004927670bb1",
  "2026-10-09": "76d19d18651de56a0fac395b635c8e53dfaf4f29a4dd6f2627d03f3a7df80f28",
  "2026-10-10": "45e7164fab8dc122125cdd689cda113e9169134868558c966440ef2de4078bac",
});

const PRODUCER = "pipeline.snapshot_optimizer";
const REPRODUCTION_FLAGS = ["publicRiskSectionsEqual", "legPoolLegsEqual", "bucketsEqual", "totalSlipsEqual", "sourcePoolsEqual", "reproduced"];

/** Digest a classification (a genuine receipt, or a reconstruction's replay classification) for the judge. */
function digest(c) {
  const legPool = { totalLegs: c?.legPool?.totalLegs ?? null, distinctGames: c?.legPool?.distinctGames ?? null };
  const inputs = Object.fromEntries(Object.entries(c?.inputs ?? {}).map(([sport, ev]) => [sport, {
    present: Boolean(ev?.present), parsed: Boolean(ev?.parsed), games: ev?.games ?? null, leansLoaded: ev?.leansLoaded ?? null,
    pendingReason: ev?.pendingReason ?? null, generatedAt: ev?.generatedAt ?? null,
  }]));
  const sections = Object.fromEntries(PUBLIC_SECTIONS.map((s) => {
    const sec = c?.publicSections?.[s] ?? {};
    return [s, {
      minLegs: sec.minLegs ?? null, maxLegsPerGame: sec.maxLegsPerGame ?? null, eligibleLegs: sec.eligibleLegs?.all ?? null,
      candidates: sec.candidates?.all ?? null, slips: sec.slips ?? null, emptyReason: sec.emptyReason ?? null,
      verified: sec.slips === 0 ? reasonHolds(sec, legPool) : null,
    }];
  }));
  return { outcome: c?.outcome ?? null, publicSlips: c?.publicSlips ?? null, legPool, inputs, sections };
}

/** Checks shared by both kinds: the classification must describe THIS snapshot and THESE boards. */
function crossCheck(c, { legs, sectionSlips, boardsNow }, out) {
  if (c?.receiptVersion !== OPTIMIZER_RECEIPT_VERSION) out.problems.push(`receipt version ${c?.receiptVersion} is not ${OPTIMIZER_RECEIPT_VERSION}`);
  if (c?.publicSlips !== sectionSlips) out.rejections.push(`evidence says ${c?.publicSlips} public slips; the snapshot holds ${sectionSlips}`);
  if (legs && c?.legPool?.totalLegs !== legs.length) out.rejections.push(`evidence says ${c?.legPool?.totalLegs} legs; the snapshot holds ${legs.length}`);
  for (const s of PUBLIC_SECTIONS) if (!c?.publicSections?.[s]) out.problems.push(`evidence has no ${s} section`);
  /* Lineage: the board the run read must still be the board on disk. */
  for (const [sport, ev] of Object.entries(c?.inputs ?? {})) {
    const now = boardsNow[sport] ?? null;
    if (ev?.present && !now) out.problems.push(`${sport} board the run read is no longer on disk`);
    if (!ev?.present && now) out.problems.push(`${sport} board exists now but did not when the run read it`);
    if (ev?.present && now && (now.generatedAt ?? null) !== (ev.generatedAt ?? null)) {
      out.problems.push(`${sport} board was regenerated (${now.generatedAt}) after the run read it (${ev.generatedAt})`);
    }
  }
}

/**
 * The projection-side digest of one snapshot: its evidence, cross-checked against the snapshot and the boards on
 * disk now. Pure — the caller reads the files. Two lists come back: `problems` (stale or incomplete) and
 * `rejections` (evidence that is fabricated, mis-bound or contradicted — never acceptable).
 *
 * @param {string} date the snapshot's date (its file name)
 * @param {object} doc the parsed optimizer snapshot
 * @param {Record<string, {generatedAt?: string|null, sha256?: string|null}|null>} boardsNow sport → the board on disk now
 * @param {{snapshotSha256?: string|null, reconstruction?: object|null}} [extra]
 */
export function snapshotEvidence(date, doc, boardsNow = {}, { snapshotSha256 = null, reconstruction = null } = {}) {
  const out = { problems: [], rejections: [] };
  const receipt = doc?.generationReceipt ?? null;
  const legs = Array.isArray(doc?.legPool?.legs) ? doc.legPool.legs : null;
  const sectionsPresent = PUBLIC_SECTIONS.every((s) => doc?.publicRiskSections && typeof doc.publicRiskSections[s] === "object");
  if (!doc?.generatedAt) out.problems.push("snapshot has no generatedAt");
  if (String(doc?.date ?? "") !== date) out.problems.push(`snapshot date ${doc?.date} is not its file date ${date}`);
  if (!legs) out.problems.push("snapshot has no legPool.legs");
  if (!sectionsPresent) out.problems.push("snapshot is missing a public risk section");
  const sectionSlips = countSectionSlips(doc?.publicRiskSections);
  const ctx = { legs, sectionSlips, boardsNow };

  if (receipt) {
    /* PROVENANCE: a genuine receipt is the producer's, written in the run it describes. */
    if (receipt.receiptKind !== "PRODUCER" || receipt.producer !== PRODUCER || receipt.genuineProducerReceipt === false) {
      out.rejections.push(`the snapshot's receipt has no producer provenance (receiptKind ${receipt.receiptKind ?? "none"}, producer ${receipt.producer ?? "none"})`);
    }
    if (reconstruction) out.rejections.push("a RECONSTRUCTED receipt exists for a date whose snapshot has a genuine receipt");
    if (receipt.status !== "completed") out.problems.push(`receipt status is ${receipt.status}, not completed`);
    if (receipt.date !== date) out.problems.push(`receipt date ${receipt.date} is not ${date}`);
    if (receipt.generatedAt !== doc.generatedAt) out.problems.push("receipt generatedAt differs from the snapshot's — the receipt is not this run's");
    crossCheck(receipt, ctx, out);
    return { receipt: "present", receiptVersion: receipt.receiptVersion ?? null, status: receipt.status ?? null, generatedAt: receipt.generatedAt ?? null, sectionSlips, ...digest(receipt), ...out };
  }

  if (reconstruction) {
    const r = reconstruction;
    if (r.receiptKind !== "RECONSTRUCTED" || r.genuineProducerReceipt !== false) {
      out.rejections.push("a reconstruction that does not declare itself RECONSTRUCTED with genuineProducerReceipt false");
    }
    if (!Object.prototype.hasOwnProperty.call(RECONSTRUCTED_RECEIPT_ALLOWLIST, date)) {
      out.rejections.push(`a RECONSTRUCTED receipt for ${date}, which is outside the pre-receipt allowlist`);
    } else if (RECONSTRUCTED_RECEIPT_ALLOWLIST[date] !== snapshotSha256) {
      out.rejections.push(`the committed ${date} snapshot (sha256 ${snapshotSha256}) is not the allowlisted one`);
    }
    if (r.snapshot?.sha256 !== snapshotSha256) out.rejections.push("the reconstruction is bound to a different snapshot (sha256 mismatch)");
    if (r.date !== date) out.rejections.push(`the reconstruction is for ${r.date}, not ${date}`);
    if (r.snapshot?.generatedAt !== doc?.generatedAt) out.rejections.push("the reconstruction names a different original generatedAt");
    if (!(Date.parse(r.reconstructedAt) > Date.parse(doc?.generatedAt))) out.rejections.push("reconstructedAt is not after the original run — a reconstruction cannot be contemporaneous");
    for (const f of REPRODUCTION_FLAGS) if (r.reproduction?.[f] !== true) out.rejections.push(`the replay did not reproduce the snapshot (${f})`);
    for (const [sport, b] of Object.entries(r.inputs?.boards ?? {})) {
      const now = boardsNow[sport] ?? null;
      if (b?.present && (now?.sha256 ?? null) !== b.sha256) out.rejections.push(`${sport} board sha256 differs from the one the reconstruction replayed`);
      if (!b?.present && now) out.rejections.push(`${sport} board exists now but the reconstruction replayed without it`);
    }
    crossCheck(r.classification, ctx, out);
    return {
      receipt: "reconstructed", receiptVersion: r.receiptVersion ?? null, status: "reconstructed", generatedAt: doc?.generatedAt ?? null,
      reconstructedAt: r.reconstructedAt ?? null, snapshotSha256, sectionSlips, ...digest(r.classification), ...out,
    };
  }

  /* A legacy snapshot has no receipt to cross-check, but its lineage can still be stale: a board written after the
     snapshot was generated is one the snapshot never read. */
  for (const [sport, now] of Object.entries(boardsNow)) {
    if (now?.generatedAt && doc?.generatedAt && Date.parse(now.generatedAt) > Date.parse(doc.generatedAt)) {
      out.problems.push(`${sport} board was regenerated (${now.generatedAt}) after the snapshot (${doc.generatedAt})`);
    }
  }
  return { receipt: "absent", sectionSlips, ...out };
}

/**
 * The window audit: what the projection can see beyond the snapshots it read. Pure.
 *
 * @param {string[]} windowDates the snapshot dates the projection carries (oldest first)
 * @param {string[]} snapshotDates every dated snapshot on disk
 * @param {string[]} boardDates every dated upstream board on disk, any sport
 * @param {Record<string, {attemptedAt?: string, errorType?: string}>} failures date → recorded failed attempt
 */
export function windowAudit({ windowDates, snapshotDates, boardDates, failures = {} }) {
  const have = new Set(snapshotDates);
  const start = windowDates[0] ?? null;
  const newestBoardDate = [...boardDates].sort().at(-1) ?? null;
  const newestSnapshotDate = [...snapshotDates].sort().at(-1) ?? null;
  /* A board for a date at or after the window's start with no snapshot is output the optimizer should have
     written. Before the window it is history the projection no longer reads. */
  const missingSnapshots = start
    ? [...new Set(boardDates)].filter((d) => d >= start && !have.has(d)).sort()
    : [...new Set(boardDates)].sort().slice(-1);
  const failedRuns = Object.entries(failures)
    .filter(([d]) => DATE_RE.test(d) && (!start || d >= start))
    .map(([date, f]) => ({ date, attemptedAt: f?.attemptedAt ?? null, errorType: f?.errorType ?? null }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return { windowDates: [...windowDates], newestSnapshotDate, newestBoardDate, missingSnapshots, failedRuns };
}

/**
 * Judge the published parlays document. Returns per-day verdicts, the fatal problems, and whether the window
 * is vacuous (no candidate checked, none withheld). The guard fails when `fatal` is non-empty.
 */
export function judgeParlayWindow(parlays) {
  const byDate = parlays?.byDate ?? {};
  const dates = Object.keys(byDate).sort();
  const audit = parlays?.windowAudit ?? null;
  const fatal = [];
  const days = [];

  if (!audit) fatal.push("the projection carries no windowAudit — the window cannot be judged");

  const receiptDates = dates.filter((d) => byDate[d]?.evidence?.receipt === "present");
  const firstReceipt = receiptDates[0] ?? null;

  let checked = 0;
  let withheld = 0;
  for (const date of dates) {
    const day = byDate[date];
    const slips = Object.values(day.profiles ?? {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
    const held = day.withheldMarketContext ?? 0;
    checked += slips;
    withheld += held;
    const ev = day.evidence ?? null;
    const failure = audit?.failedRuns?.find((f) => f.date === date) ?? null;
    let verdict;
    let detail;

    if (failure && (!day.generatedAt || (failure.attemptedAt ?? "") > day.generatedAt)) {
      verdict = PARLAY_DAY_VERDICT.FAILED_RUN;
      detail = `the newest optimizer attempt for ${date} failed (${failure.errorType ?? "error"} at ${failure.attemptedAt})`;
    } else if (!ev) {
      verdict = PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE;
      detail = `${date} carries no evidence block — the projection that wrote it predates the evidence contract`;
    } else if (ev.rejections?.length) {
      verdict = PARLAY_DAY_VERDICT.INVALID_EVIDENCE;
      detail = `${date}: ${ev.rejections.join("; ")}`;
    } else if (ev.problems?.length) {
      verdict = PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE;
      detail = `${date}: ${ev.problems.join("; ")}`;
    } else if (slips > 0) {
      verdict = PARLAY_DAY_VERDICT.HAS_SLIPS;
      detail = `${slips} candidate(s)`;
    } else if (held > 0) {
      verdict = PARLAY_DAY_VERDICT.WITHHELD;
      detail = `${held} candidate(s) withheld under the card-leg rule`;
    } else if (ev.receipt !== "present" && ev.receipt !== "reconstructed") {
      verdict = PARLAY_DAY_VERDICT.MISSING_EVIDENCE;
      detail = `${date} is empty and its snapshot carries no generation receipt`;
    } else if (ev.outcome === "NO_QUALIFYING_GAMES") {
      verdict = PARLAY_DAY_VERDICT.NO_QUALIFYING_GAMES;
      detail = `every board read parsed and listed no game (${Object.entries(ev.inputs ?? {}).filter(([, i]) => i.present).map(([s, i]) => `${s}: ${i.pendingReason ?? "0 games"}`).join(", ")})`;
      const bad = Object.entries(ev.inputs ?? {}).filter(([, i]) => i.present && (!i.parsed || (i.games ?? 0) > 0 || (i.leansLoaded ?? 0) > 0));
      if (bad.length || ev.legPool?.totalLegs !== 0) {
        verdict = PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE;
        detail = `${date}: receipt says NO_QUALIFYING_GAMES but its own inputs disagree`;
      }
    } else if (ev.outcome === "NO_ELIGIBLE_SLIPS") {
      const unexplained = PUBLIC_SECTIONS.filter((s) => !(VERIFIABLE_EMPTY_REASONS.includes(ev.sections?.[s]?.emptyReason) && ev.sections?.[s]?.verified === true));
      if (unexplained.length) {
        verdict = PARLAY_DAY_VERDICT.MISSING_EVIDENCE;
        detail = `${date} is empty and ${unexplained.map((s) => `${s} (${ev.sections?.[s]?.emptyReason ?? "no reason"})`).join(", ")} is not explained by the receipt's own counts`;
      } else {
        verdict = PARLAY_DAY_VERDICT.EMPTY_EVIDENCED;
        detail = PUBLIC_SECTIONS.map((s) => `${s}: ${ev.sections[s].emptyReason}`).join(", ");
      }
    } else if (ev.outcome === "SLIPS_BUILT" && ev.receipt === "reconstructed") {
      verdict = PARLAY_DAY_VERDICT.INVALID_EVIDENCE;
      detail = `${date}: a RECONSTRUCTED receipt may only evidence an empty day`;
    } else if (ev.outcome === "SLIPS_BUILT") {
      verdict = PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE;
      detail = `${date}: the producer built ${ev.publicSlips} public slip(s) and the projection carries none, withholding none`;
    } else {
      verdict = PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE;
      detail = `${date}: the run's inputs were not usable (${ev.outcome ?? "no outcome"})`;
    }

    if (ev?.receipt === "reconstructed" && verdict !== PARLAY_DAY_VERDICT.INVALID_EVIDENCE) {
      detail = `${detail} [RECONSTRUCTED receipt, ${ev.reconstructedAt}; not a producer receipt]`;
    }
    /* A reconstruction is valid only for the pre-receipt period: never on or after the first genuine receipt. */
    if (ev?.receipt === "reconstructed" && firstReceipt && date >= firstReceipt) {
      verdict = PARLAY_DAY_VERDICT.INVALID_EVIDENCE;
      detail = `${date} has a RECONSTRUCTED receipt although the producer already records genuine ones (${firstReceipt})`;
    }
    /* A receipt-less snapshot newer than one with a receipt: the producer stopped recording. */
    const legacy = ev?.receipt === "absent" && (!firstReceipt || date < firstReceipt);
    if (ev && ev.receipt === "absent" && !legacy) {
      verdict = PARLAY_DAY_VERDICT.MISSING_EVIDENCE;
      detail = `${date} has no generation receipt although an older snapshot (${firstReceipt}) has one — the producer stopped recording`;
    }
    days.push({ date, verdict, detail, legacy, evidenceKind: ev?.receipt ?? null });
  }

  for (const d of audit?.missingSnapshots ?? []) {
    const failure = audit.failedRuns?.find((f) => f.date === d);
    days.push({
      date: d,
      verdict: failure ? PARLAY_DAY_VERDICT.FAILED_RUN : PARLAY_DAY_VERDICT.MISSING_OUTPUT,
      detail: failure
        ? `the optimizer attempt for ${d} failed (${failure.errorType ?? "error"} at ${failure.attemptedAt}) and wrote no snapshot`
        : `an upstream board exists for ${d} and no optimizer snapshot does`,
      legacy: false,
    });
  }
  for (const f of audit?.failedRuns ?? []) {
    if (!days.some((d) => d.date === f.date)) {
      days.push({ date: f.date, verdict: PARLAY_DAY_VERDICT.FAILED_RUN, detail: `the optimizer attempt for ${f.date} failed (${f.errorType ?? "error"})`, legacy: false });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const vacuous = checked === 0 && withheld === 0;
  const ACCEPTED_EMPTY = [PARLAY_DAY_VERDICT.EMPTY_EVIDENCED, PARLAY_DAY_VERDICT.NO_QUALIFYING_GAMES];
  for (const d of days) {
    if ([PARLAY_DAY_VERDICT.MISSING_OUTPUT, PARLAY_DAY_VERDICT.FAILED_RUN, PARLAY_DAY_VERDICT.STALE_OR_INCOMPLETE, PARLAY_DAY_VERDICT.INVALID_EVIDENCE].includes(d.verdict)) fatal.push(`${d.verdict}: ${d.detail}`);
    else if (d.verdict === PARLAY_DAY_VERDICT.MISSING_EVIDENCE && (!d.legacy || vacuous)) fatal.push(`${d.verdict}: ${d.detail}`);
  }
  if (vacuous && dates.length === 0) fatal.push("the projection carries no parlay day at all — nothing to judge");
  if (vacuous && !days.every((d) => ACCEPTED_EMPTY.includes(d.verdict))) {
    fatal.push("no candidates were checked AND none were withheld, and not every day in the window is an evidenced empty day — this guard would pass vacuously");
  }
  return { checked, withheld, vacuous, days, fatal };
}
