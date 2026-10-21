/**
 * NBA PROMOTION / ROLLBACK RECORD — PURE, no I/O. APPEND-ONLY. data/internal/research/nba/promotion-record.json.
 *
 * The only place a change of NBA champion (or a rollback) is ever written down. Nothing in automation appends here:
 * the nightly jobs grade and report; the champion/challenger evaluator only says READY_FOR_FOUNDER_REVIEW. A record
 * needs a named HUMAN approver (prereg §11: "No number is written into the capability registry by automation";
 * founder N3: a challenger never replaces the champion automatically). A record with no approver — or an automation
 * identity as approver — is REFUSED. A PROMOTION must cite an evaluator verdict of READY_FOR_FOUNDER_REVIEW for the
 * market it promotes; a ROLLBACK must name the PROMOTION it reverses. Records are never edited or removed.
 */
import { FAMILIES } from "./experimental-forecast.mjs";
import { canonicalJson } from "./forecast-receipt.mjs";
import { VERDICT } from "./champion-challenger.mjs";

export const PROMOTION_RECORD_ARTIFACT = "nba-promotion-record";
export const RECORD_KIND = Object.freeze({ PROMOTION: "PROMOTION", ROLLBACK: "ROLLBACK" });
/** Approver identities that are automation, never a human decision. */
const AUTOMATION = /(\[bot\]|github-actions|dependabot|renovate|^claude\b|anthropic|automation|^ci$|^system$|^cron$)/i;

export function emptyPromotionRecord() {
  return {
    schemaVersion: 1, artifact: PROMOTION_RECORD_ARTIFACT, sport: "nba", dataClass: "PRIVATE_RESEARCH", productEligible: false,
    rule: "append-only; every record names a human approver; a PROMOTION cites a READY_FOR_FOUNDER_REVIEW evaluator verdict for its market; a ROLLBACK names the PROMOTION it reverses; automation never appends",
    preregistration: "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §6–§13",
    records: [],
  };
}

const isoDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isoInstant = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s));
const nonEmpty = (s, min = 1) => typeof s === "string" && s.trim().length >= min;

/** Validate one record against a document (for ROLLBACK lineage). Returns { ok, errors }. */
export function validatePromotionRecord(rec, doc = emptyPromotionRecord()) {
  const e = [];
  if (!rec || typeof rec !== "object") return { ok: false, errors: ["record is not an object"] };
  if (!Object.values(RECORD_KIND).includes(rec.kind)) e.push(`kind must be ${Object.values(RECORD_KIND).join(" | ")}`);
  const fam = FAMILIES[rec.family];
  if (!fam) e.push(`family ${JSON.stringify(rec.family)} is not an NBA experimental family`);
  else if (rec.version !== fam.modelVersion) e.push(`version ${JSON.stringify(rec.version)} is not family ${rec.family}'s model version ${fam.modelVersion}`);
  if (!nonEmpty(rec.market)) e.push("market is required (markets are promoted separately, §7)");
  if (!isoDate(rec.date)) e.push("date must be YYYY-MM-DD");
  if (!isoInstant(rec.decidedAt)) e.push("decidedAt must be an ISO instant");
  if (!rec.metrics || typeof rec.metrics !== "object" || !Object.keys(rec.metrics).length) e.push("metrics are required (the numbers the decision read, each with its n)");
  if (!nonEmpty(rec.reason, 10)) e.push("reason is required (≥ 10 characters)");
  if (!nonEmpty(rec.approver)) e.push("approver is required — a promotion or rollback without a named human approver is refused");
  else if (AUTOMATION.test(rec.approver.trim())) e.push(`approver ${JSON.stringify(rec.approver)} is an automation identity — only a human approves`);
  if (rec.kind === RECORD_KIND.PROMOTION) {
    if (!rec.evidence || rec.evidence.verdict !== VERDICT.READY_FOR_FOUNDER_REVIEW) e.push(`a PROMOTION must cite evidence.verdict ${VERDICT.READY_FOR_FOUNDER_REVIEW} from the champion/challenger evaluator`);
    if (!nonEmpty(rec.evidence?.report)) e.push("a PROMOTION must cite evidence.report (the evaluator report file)");
    if (rec.evidence && rec.evidence.market !== rec.market) e.push("evidence.market must be the market being promoted");
  }
  if (rec.kind === RECORD_KIND.ROLLBACK) {
    const target = (doc?.records ?? []).find((r) => r.seq === rec.rollsBack);
    if (!target || target.kind !== RECORD_KIND.PROMOTION) e.push("a ROLLBACK must name (rollsBack) the seq of an earlier PROMOTION");
    else if (target.market !== rec.market) e.push("a ROLLBACK reverses a PROMOTION of the same market");
  }
  return { ok: e.length === 0, errors: e };
}

/** Append a validated record (returns a NEW document) or refuse. */
export function appendPromotionRecord(doc, rec) {
  const base = doc ?? emptyPromotionRecord();
  const v = validatePromotionRecord(rec, base);
  if (!v.ok) return { ok: false, errors: v.errors, doc: base };
  const seq = base.records.length ? base.records.at(-1).seq + 1 : 1;
  return { ok: true, errors: [], doc: { ...base, records: [...base.records, { seq, ...rec }] } };
}

/** Post-write guard: BEFORE's records are an unchanged prefix of AFTER's; seq strictly increasing; each valid. */
export function promotionRecordViolations({ before, after }) {
  const v = [];
  const b = before?.records ?? [], a = after?.records ?? [];
  if (a.length < b.length) v.push(`records removed (${b.length} → ${a.length})`);
  for (let i = 0; i < b.length; i += 1) if (a[i] && canonicalJson(a[i]) !== canonicalJson(b[i])) v.push(`record seq ${b[i].seq} was edited`);
  for (let i = 1; i < a.length; i += 1) if (!(a[i].seq > a[i - 1].seq)) v.push(`seq not increasing at ${a[i].seq}`);
  for (let i = b.length; i < a.length; i += 1) {
    const { seq: _s, ...rec } = a[i];
    const r = validatePromotionRecord(rec, { records: a.slice(0, i) });
    if (!r.ok) v.push(`record seq ${a[i].seq}: ${r.errors.join("; ")}`);
  }
  return v;
}
