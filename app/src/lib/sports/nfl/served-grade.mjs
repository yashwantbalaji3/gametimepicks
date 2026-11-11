/**
 * NFL GRADE RULE (founder 2026-11-09, ~/gtp-evidence/nov9-founder-canon01-release.md; CANON-01 Option B). PURE: no fs,
 * no network, no clock.
 *
 *   "the version graded must be the exact official forecast version verified as publicly served before kickoff."
 *   "A valid late replacement is permitted only when necessary … only if it passes eligibility and validation, is
 *    published before kickoff, and has a verified publication record."
 *   "If a forecast becomes invalid and cannot be safely republished before kickoff, hold it rather than publishing or
 *    grading an unsupported replacement."  "Do not retroactively change historical grades …"
 *
 * THREE STEPS, each its own record:
 *   FREEZE    before the protected window (21:30Z) on slate days, one write-once record per upcoming game: the official
 *             forecast of record (nflOfficialOfRecord: revision, model version, content hash, snapshot id) and its
 *             eligibility@1 state (R5 + the starting quarterbacks). buildFreezeRecord().
 *   DECIDE    after kickoff, which revision the Production site SERVED at kickoff (served-revision.mjs, deployment
 *             record), compared with the freeze. decideGradedRevision():
 *               GRADE FROZEN_REVISION_SERVED   the frozen revision is the served one
 *               GRADE LATE_REPLACEMENT         a LATER revision was served, it has a recorded receipt, passes R5, and was
 *                                              generated and served before kickoff
 *               HOLD <reason>                  anything else — no grade (no freeze, evidence gap or ambiguity, the frozen
 *                                              revision was not served and no valid replacement was, …)
 *   GRADE     the week reconciliation grades the decided revision's receipt (gradingReceiptFor); HOLD ⇒ a HOLD row.
 * FORWARD ONLY: a game kicking off before NFL_SERVED_GRADE_FROM keeps the legacy rule (the latest receipt generated
 * before kickoff) — every graded week on file is reproduced byte for byte; known served-vs-graded discrepancies are
 * reported by scripts/nfl/audit-served-forecast-of-record.mjs, never regraded here.
 */
import crypto from "node:crypto";
import { STATUS, servedForecastOfRecord } from "../../publication-evidence/served-revision.mjs";
import { gameEligibility } from "../../availability/eligibility.mjs";

export const FREEZE_SCHEMA = "gtp.nfl.grade-freeze@1";
export const DECISION_SCHEMA = "gtp.nfl.served-grade-decision@1";
export const GRADED_AGAINST_SCHEMA = "gtp.nfl.graded-against@1";
/** Games kicking off at or after this instant are graded by the served rule (2026 week 11, Thursday night, onward). */
export const NFL_SERVED_GRADE_FROM = "2026-11-13T00:00:00Z";
/** The protected pregame publication window opens at 21:30Z; the freeze for a day's slate is taken before it. */
export const PROTECTED_WINDOW_UTC = "21:30:00";
/** GitHub's deployment record vs Vercel (TRUTH-001): up to 19 s early, 7 min late. */
export const RECORD_CLOCK = Object.freeze({ earlyMs: 19_000, lateMs: 420_000 });

export const DECISION = Object.freeze({ GRADE: "GRADE", HOLD: "HOLD", LEGACY: "LEGACY_RULE" });
export const BASIS = Object.freeze({ FROZEN_REVISION_SERVED: "FROZEN_REVISION_SERVED", LATE_REPLACEMENT: "LATE_REPLACEMENT" });
export const HOLD_REASON = Object.freeze({
  NO_FREEZE_RECORD: "NO_FREEZE_RECORD",
  NOT_VERIFIED_SERVED: "NOT_VERIFIED_SERVED", // + the served-revision status (EVIDENCE_GAP, AMBIGUOUS_NEAR_CUTOFF, …)
  FROZEN_REVISION_NOT_SERVED: "FROZEN_REVISION_NOT_SERVED", // an OLDER revision than the freeze was serving at kickoff
  REPLACEMENT_NOT_RECORDED: "REPLACEMENT_NOT_RECORDED", // the served later revision has no immutable receipt
  REPLACEMENT_INELIGIBLE: "REPLACEMENT_INELIGIBLE", // the served later revision fails eligibility@1 R5
  NO_RECORDED_RECEIPT: "NO_RECORDED_RECEIPT", // the decided revision has no receipt the reconciliation can grade
});

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

/**
 * The content of an NFL forecast revision: its summary and the model's input hash (the definition the CANON-01 audit
 * uses — a run on unchanged inputs republishes the same forecast under a new generatedAt, which is not a new revision).
 */
export const nflForecastContentHash = (f) => (f?.forecastSummary ? crypto.createHash("sha256").update(JSON.stringify({ h: f.model?.inputHash ?? null, s: f.forecastSummary })).digest("hex").slice(0, 16) : null);

/** The freeze deadline of a UTC day ("YYYY-MM-DD") and the kickoff span its freeze covers: [day 21:30Z, next day 21:30Z). */
export function freezeSpan(day) {
  const from = `${day}T${PROTECTED_WINDOW_UTC}Z`;
  const to = new Date(Date.parse(from) + 86_400_000).toISOString().replace(/\.000Z$/, "Z");
  return { frozenBefore: from, from, to };
}
/** Does this game belong to the day's freeze? */
export const inFreezeSpan = (kickoffUtc, span) => ms(kickoffUtc) >= ms(span.from) && ms(kickoffUtc) < ms(span.to);

/**
 * One game's freeze record. Deterministic: only the inputs and the day's deadline, never the clock of the run.
 * @param {{ record: { basis: string, forecast: object, snapshot?: { snapshotId?: string } | null }, startingQbs?: Array<{ team: string, playerId: string, eligibility: object }>, span: { frozenBefore: string } }} a
 */
export function buildFreezeRecord({ record, startingQbs = [], span }) {
  const f = record.forecast;
  return {
    schema: FREEZE_SCHEMA,
    eventId: String(f.providerEventId),
    canonicalEventId: f.canonicalEventId ?? null,
    matchup: f.matchup ?? null,
    kickoffUtc: f.kickoffUtc,
    frozenBefore: span.frozenBefore,
    forecast: {
      basis: record.basis,
      generatedAt: f.generatedAt,
      modelId: f.model?.id ?? null,
      modelVersion: f.model?.version ?? null,
      inputHash: f.model?.inputHash ?? null,
      contentHash: nflForecastContentHash(f),
      snapshotId: record.snapshot?.snapshotId ?? null,
    },
    eligibility: {
      contractVersion: "eligibility@1",
      r5: { teamInputsState: f.teamInputs?.state ?? null, ...gameEligibility(f) },
      startingQbs: [...startingQbs].sort((a, b) => (a.team < b.team ? -1 : 1)),
    },
  };
}

/**
 * servedForecastOfRecord(), with ONE narrowing of AMBIGUOUS_NEAR_CUTOFF: when a deployment's recorded READY time is too
 * close to kickoff to say whether it was serving, the ambiguity is irrelevant if EVERY build that could have been
 * serving at kickoff — the last one clearly before it and each near one — served the same bytes for this game. Then the
 * served revision is those bytes, whichever build it was; otherwise the result stays AMBIGUOUS (⇒ HOLD). The record's
 * clock bounds are the same ones served-revision.mjs uses.
 */
export function servedWithNearCutoffResolved(args) {
  const served = servedForecastOfRecord(args);
  if (served.status !== STATUS.AMBIGUOUS_NEAR_CUTOFF) return served;
  const cut = ms(served.cutoff);
  const precision = (served.cutoffPrecisionSec ?? 0) * 1000;
  const earlyMs = args.recordClock?.earlyMs ?? args.readyUncertaintyMs ?? 0;
  const lateMs = args.recordClock?.lateMs ?? args.readyUncertaintyMs ?? 0;
  const near = args.deployments.filter((d) => d.state === "READY" && ms(d.readyAt) != null && ms(d.readyAt) - lateMs <= cut + precision && ms(d.readyAt) + earlyMs >= cut);
  const nearIds = new Set(near.map((d) => d.id));
  const before = servedForecastOfRecord({ ...args, deployments: args.deployments.filter((d) => !nearIds.has(d.id)) });
  if (before.status !== STATUS.SERVED) return served;
  const h = before.forecastOfRecord.contentHash;
  for (const d of near) {
    const s = args.servedAt(d.sha);
    if (!s?.ok || !s.game || s.game.status === "unavailable" || args.hashOf(s.game) !== h) return served;
  }
  return { ...before, nearCutoffResolved: { deployments: near.map((d) => ({ id: d.id, sha: d.sha, readyAt: d.readyAt })), rule: "every build that could have been serving at kickoff served the same bytes for this game", was: served.reason } };
}

/**
 * The decision for one game after kickoff.
 * @param {object} a
 * @param {string} a.eventId
 * @param {string} a.kickoffUtc
 * @param {object|null} a.freeze       the game's freeze record (null when none was written)
 * @param {object} a.served            servedForecastOfRecord() result for the game
 * @param {Array<{ id: string, generatedAt: string, contentHash: string, recorded: boolean, forecast?: object }>} a.candidates
 *        every revision the decision may name; `recorded` = an immutable forecast receipt exists for it
 * @param {string} [a.ruleFrom]  the rule's start (NFL_SERVED_GRADE_FROM; the decide script's dry run may pass an earlier one)
 */
export function decideGradedRevision({ eventId, kickoffUtc, freeze, served, candidates, ruleFrom = NFL_SERVED_GRADE_FROM }) {
  const base = { schema: DECISION_SCHEMA, eventId: String(eventId), kickoffUtc, rule: "served-before-kickoff (founder 2026-11-09)", servedStatus: served?.status ?? null, cutoff: served?.cutoff ?? null, cutoffBasis: served?.cutoffBasis ?? null };
  if (!(ms(kickoffUtc) >= ms(ruleFrom))) return { ...base, decision: DECISION.LEGACY, reason: `kickoff before ${ruleFrom}: the existing graded record stands` };
  const proof = served?.status === STATUS.SERVED ? { deployment: served.deployment, firstServingDeployment: served.firstServingDeployment ?? null, publishedAt: served.forecastOfRecord.publishedAt, deploymentReadyAt: served.forecastOfRecord.deploymentReadyAt, ...(served.nearCutoffResolved ? { nearCutoffResolved: served.nearCutoffResolved } : {}) } : (served?.deployment ? { deployment: served.deployment } : null);
  const hold = (reason, detail, extra = {}) => ({ ...base, decision: DECISION.HOLD, reason, detail, servedProof: proof, revision: null, ...extra });
  if (!freeze) return hold(HOLD_REASON.NO_FREEZE_RECORD, "no freeze record was written before the protected window");
  const frozen = { generatedAt: freeze.forecast.generatedAt, contentHash: freeze.forecast.contentHash };
  if (served?.status !== STATUS.SERVED) return hold(HOLD_REASON.NOT_VERIFIED_SERVED, `${served?.status ?? "NO_EVIDENCE"}: ${served?.reason ?? "no served-revision result"}`, { frozen });
  const h = served.forecastOfRecord.contentHash;
  const rev = (c) => ({ generatedAt: c.generatedAt, contentHash: c.contentHash, receipt: c.recorded ? c.id : null });
  if (h === frozen.contentHash) {
    const c = candidates.find((x) => x.contentHash === h && x.recorded) ?? candidates.find((x) => x.contentHash === h) ?? { generatedAt: served.forecastOfRecord.generatedAt, contentHash: h, recorded: false, id: null };
    return { ...base, decision: DECISION.GRADE, basis: BASIS.FROZEN_REVISION_SERVED, revision: rev(c), frozen, servedProof: proof };
  }
  const servedGen = served.forecastOfRecord.generatedAt;
  if (!(ms(servedGen) > ms(frozen.generatedAt))) {
    return hold(HOLD_REASON.FROZEN_REVISION_NOT_SERVED, `the build serving at kickoff carried the ${servedGen} revision, older than the frozen ${frozen.generatedAt}; the frozen revision was never served`, { frozen, served: { generatedAt: servedGen, contentHash: h } });
  }
  // a LATER revision was served before kickoff: a late replacement, valid only when recorded and eligible
  const recorded = candidates.filter((x) => x.contentHash === h && x.recorded).sort((a, b) => ms(a.generatedAt) - ms(b.generatedAt))[0] ?? null;
  if (!recorded) return hold(HOLD_REASON.REPLACEMENT_NOT_RECORDED, "the served later revision has no immutable forecast receipt", { frozen, served: { generatedAt: servedGen, contentHash: h } });
  const elig = gameEligibility(recorded.forecast ?? {});
  if (!elig.publishable) return hold(HOLD_REASON.REPLACEMENT_INELIGIBLE, `eligibility@1: ${elig.reasons.join(", ")}`, { frozen, served: { generatedAt: servedGen, contentHash: h } });
  return { ...base, decision: DECISION.GRADE, basis: BASIS.LATE_REPLACEMENT, revision: rev(recorded), frozen, replacement: { eligibility: elig, teamInputsState: recorded.forecast?.teamInputs?.state ?? null }, servedProof: proof };
}

/**
 * Which receipt the week reconciliation grades for one game, or why it holds.
 * @param {{ kickoffUtc: string, legacyReceipt: object|null, receipts: object[], decision: object|null }} a
 *        legacyReceipt = the latest receipt generated before kickoff (the rule every graded week on file used)
 * @returns {{ receipt: object, rule: "LEGACY_RULE"|"SERVED_RULE", decision?: object } | { hold: { reason: string, detail: string }, rule: "SERVED_RULE", decision: object|null }}
 */
export function gradingReceiptFor({ kickoffUtc, legacyReceipt, receipts, decision }) {
  if (!(ms(kickoffUtc) >= ms(NFL_SERVED_GRADE_FROM))) return legacyReceipt ? { receipt: legacyReceipt, rule: DECISION.LEGACY } : null;
  if (!decision) return { hold: { reason: "NO_DECISION", detail: "no served-revision decision has been recorded for this game yet" }, rule: "SERVED_RULE", decision: null };
  if (decision.decision !== DECISION.GRADE) return { hold: { reason: decision.reason, detail: decision.detail ?? "" }, rule: "SERVED_RULE", decision };
  const want = decision.revision.contentHash;
  const r = receipts.filter((x) => nflForecastContentHash(x) === want && ms(x.generatedAt) < ms(kickoffUtc)).sort((a, b) => ms(a.generatedAt) - ms(b.generatedAt))[0] ?? null;
  if (!r) return { hold: { reason: HOLD_REASON.NO_RECORDED_RECEIPT, detail: `no receipt carries the decided revision ${decision.revision.generatedAt}` }, rule: "SERVED_RULE", decision };
  return { receipt: r, rule: "SERVED_RULE", decision };
}

/**
 * RESULTS SURFACE HOOK (for product B: game page, Trends). One game's "graded against" record: which revision, the
 * served proof, and the outcome — from the decision (internal) and the week reconciliation row (public).
 */
export function gradedAgainstRecord({ eventId, decision = null, reconciliationGame = null }) {
  const g = reconciliationGame;
  const outcome = g?.state === "FINAL" ? { state: "FINAL", final: g.final, team: g.team } : g ? { state: g.state, final: null, team: [] } : null;
  if (!decision || decision.decision === DECISION.LEGACY) {
    return { schema: GRADED_AGAINST_SCHEMA, eventId: String(eventId), rule: DECISION.LEGACY, status: g ? (g.state === "FINAL" ? "GRADED" : g.state) : "NOT_GRADED", revision: g?.published ? { generatedAt: g.published.generatedAt } : null, servedProof: null, outcome,
      note: "graded before the served rule took effect: the latest revision generated before kickoff (historical grades are not changed)" };
  }
  if (decision.decision === DECISION.HOLD) {
    return { schema: GRADED_AGAINST_SCHEMA, eventId: String(eventId), rule: "SERVED_RULE", status: "HOLD", hold: { reason: decision.reason, detail: decision.detail }, revision: null, servedProof: decision.servedProof ?? null, outcome: null };
  }
  return { schema: GRADED_AGAINST_SCHEMA, eventId: String(eventId), rule: "SERVED_RULE", status: g?.state === "FINAL" ? "GRADED" : "AWAITING_FINAL", basis: decision.basis, revision: decision.revision, servedProof: decision.servedProof, outcome };
}
