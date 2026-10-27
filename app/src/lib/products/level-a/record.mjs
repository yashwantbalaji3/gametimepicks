/**
 * LEVEL A · THE SUGGESTIONS RECORD. PURE, append-only. Every Level A card and untiered pick is recorded once, as
 * published, so it can be graded forward against official finals — in its OWN record, never mixed with the priced
 * products' ledgers (lab-ledger, product receipts, settlement). It holds no price and no payout.
 *
 * KEY  (productDay, policy, tier|"untiered", leg event ids). An identical entry is never written twice. A different
 * suggestion for the same (productDay, policy, tier) later in the day is recorded as its own entry with `revisionOf`
 * pointing at the earlier one; the grader grades every entry that was recorded before its first leg's start, so a
 * revision can never replace what was shown.
 * SHOWN, NOT COMPUTED. A static export decides what readers see at BUILD time. `shownAt` is the build instant of the
 * Production deployment that served the entry (read from that deployment, never from the recorder's clock), and
 * `servedFrom` is when that deployment went live (its GitHub deployment status turned success), a few minutes later.
 * The pre-start gate reads the LATEST instant it has (servedFrom, else shownAt, else recordedAt): an entry counts
 * only if readers could see it before its first leg started. `source` names the deployment.
 * Writers: app/scripts/products/record-level-a-from-deployment.mjs (per Production deployment, the normal path) and
 * app/scripts/products/record-level-a-suggestions.mjs (manual).
 *
 * WITHDRAWALS (release owner 2026-10-26) live in their OWN append-only file, withdrawn.jsonl, so no reader of the
 * suggestions record (grader, Results, the guard above) ever meets a second schema, and nothing recorded is edited or
 * regraded. When a Production deployment no longer serves a recorded entry BEFORE that entry's own publication cutoff
 * (first leg's start − 30 min), the recorder appends a `withdrawn` event: the entry's id, when it first went live
 * (servedFrom, copied), lastServedFrom (the go-live of the Production deployment this one replaced) and
 * firstNotServedFrom (this deployment's go-live: the entry stopped being served at or before it), and the reason
 * where the served model says it. An entry served again before its cutoff gets a `reinstated` event. Disappearing
 * at or after the cutoff is the normal end of a suggestion and records nothing. Grading is unchanged: every entry
 * shown before its first leg started is still graded as recorded.
 */
import { createHash } from "node:crypto";
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";
import { recordableNbaGameWinnerCards } from "./nba-game-winner-tiers.mjs";

export const LEVEL_A_RECORD_SCHEMA = "gtp.level-a.suggestion@1";

const legKey = (l) => `${l.sport}:${l.eventId}:${l.market}:${l.selection.code}`;
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Entries a Level A answer would add to a record (pure). */
export function recordEntries(answer, { recordedAt, shownAt = null, servedFrom = null, source = null }) {
  const rows = [];
  const add = (policy, tier, legs, extra = {}) => {
    if (!legs?.length) return;
    const legsOut = legs.map((l) => ({ sport: l.sport, eventId: l.eventId, eventLabel: l.eventLabel, startUtc: l.startUtc, market: l.market, selection: l.selection, probability: l.probability, forecast: l.forecast, settlement: l.settlement }));
    const id = sha([answer.productDay, policy, tier, ...legs.map(legKey)].join("|"));
    rows.push({ schema: LEVEL_A_RECORD_SCHEMA, id, productDay: answer.productDay, policy, tier, recordedAt, ...(shownAt ? { shownAt } : {}), ...(servedFrom ? { servedFrom } : {}), ...(source ? { source } : {}), firstStartUtc: legs.map((l) => l.startUtc).sort()[0], legs: legsOut, priced: false, price: null, payout: null, dataClass: "PAPER_SUGGESTION", ...extra });
  };
  for (const t of answer.parlayLab ?? []) if (t.card) add(t.card.policy, t.tier, t.card.legs, { jointProbability: t.card.jointProbability });
  if (answer.bankBuilder?.card) add(answer.bankBuilder.card.policy, answer.bankBuilder.card.tier, answer.bankBuilder.card.legs, { jointProbability: answer.bankBuilder.card.jointProbability });
  if (answer.moonshot?.card) add(answer.moonshot.card.policy, answer.moonshot.card.tier, answer.moonshot.card.legs, { jointProbability: answer.moonshot.card.jointProbability });
  for (const l of answer.untiered ?? []) add("untiered-pick@1", "untiered", [l], { jointProbability: null });
  /* NBA game winners (nba-game-winner-tiers@1): only while that block is public, i.e. only cards readers saw. */
  for (const c of recordableNbaGameWinnerCards(answer.nbaGameWinners)) add(c.policy, c.tier, c.legs, { jointProbability: c.jointProbability });
  return rows;
}

/** Append to an existing record (entries in file order). Returns the NEW entries only. */
export function appendRecord(existing, candidates) {
  const ids = new Set((existing ?? []).map((e) => e.id));
  const lastBySlot = new Map();
  for (const e of existing ?? []) lastBySlot.set(`${e.productDay}|${e.policy}|${e.tier}`, e);
  const out = [];
  for (const c of candidates ?? []) {
    if (ids.has(c.id)) continue;
    if (!(Date.parse(c.servedFrom ?? c.shownAt ?? c.recordedAt) < Date.parse(c.firstStartUtc))) continue; // only what readers could see before its first leg started
    const prev = lastBySlot.get(`${c.productDay}|${c.policy}|${c.tier}`);
    const row = prev ? { ...c, revisionOf: prev.id } : c;
    out.push(row); ids.add(row.id); lastBySlot.set(`${c.productDay}|${c.policy}|${c.tier}`, row);
  }
  return out;
}

/** Guard over the record text: prefix-preserving, unique ids, no price anywhere. */
export function recordViolations({ beforeText = "", afterText = "" }) {
  const v = [];
  if (!afterText.startsWith(beforeText)) v.push("the record before this run is not an unchanged prefix of the record after it");
  const ids = new Set();
  afterText.split("\n").filter((l) => l.trim()).forEach((l, i) => {
    let e; try { e = JSON.parse(l); } catch { v.push(`line ${i + 1}: not JSON`); return; }
    if (e.schema !== LEVEL_A_RECORD_SCHEMA) v.push(`line ${i + 1}: schema`);
    if (ids.has(e.id)) v.push(`line ${i + 1}: duplicate id ${e.id}`);
    ids.add(e.id);
    if (e.price !== null || e.payout !== null || e.priced !== false || /"(americanOdds|overAmerican|underAmerican|odds|book|bookmaker)"/.test(l)) v.push(`line ${i + 1}: a price field appears in a Level A record`);
  });
  return v;
}

/* ─── withdrawals: withdrawn.jsonl ─────────────────────────────────────────────────────────────────────────────── */
export const LEVEL_A_WITHDRAWAL_SCHEMA = "gtp.level-a.withdrawal@1";
const cutoffOf = (e) => Date.parse(e.firstStartUtc) - LEG_BOUNDS.activationCutoffMs;
const liveFrom = (e) => Date.parse(e.servedFrom ?? e.shownAt ?? e.recordedAt);

/** Why a recorded entry is not in `model` (pure): a leg refused, a leg gone, or its slot now holds another card. */
export function withdrawalReason(entry, model, servedRows) {
  const legKeyOf = (l) => `${l.sport}:${l.eventId}`;
  const present = new Set([...(model?.legs ?? []), ...(model?.untiered ?? []), ...(model?.nbaGameWinners?.legs ?? [])].map(legKeyOf));
  const refused = new Map((model?.refused ?? []).map((r) => [legKeyOf(r), r.reasons ?? []]));
  const parts = [];
  for (const l of entry.legs ?? []) {
    const k = legKeyOf(l);
    if (refused.has(k)) parts.push(`${k} refused: ${refused.get(k).join("+")}`);
    else if (!present.has(k)) parts.push(`${k} is no longer in the served model`);
  }
  if (parts.length) return parts.join("; ");
  const other = servedRows.find((r) => r.policy === entry.policy && r.tier === entry.tier);
  return other ? `replaced by a different card for the same slot (${other.id})` : "the slot shows no card now";
}

/**
 * The withdrawal events one verified Production deployment implies (pure). `existing` is the suggestions record,
 * `events` the withdrawal file so far, `model` the deployment's served model, `servedFrom` its go-live and
 * `lastServedFrom` the go-live of the deployment it replaced (null when unknown).
 */
export function withdrawalEvents({ existing, events = [], model, servedFrom, lastServedFrom = null, recordedAt, source = null }) {
  const at = Date.parse(servedFrom);
  if (!Number.isFinite(at) || !model) return [];
  const servedRows = recordEntries(model, { recordedAt });
  const served = new Set(servedRows.map((r) => r.id));
  const latest = new Map();
  for (const ev of events) latest.set(ev.id, ev);
  const out = [];
  for (const e of existing ?? []) {
    if (!(at < cutoffOf(e)) || !(liveFrom(e) < at)) continue; // past its own cutoff, or not yet live before this deployment
    const wasWithdrawn = latest.get(e.id)?.event === "withdrawn";
    const base = { schema: LEVEL_A_WITHDRAWAL_SCHEMA, id: e.id, productDay: e.productDay, policy: e.policy, tier: e.tier, firstStartUtc: e.firstStartUtc, servedFrom: e.servedFrom ?? e.shownAt ?? null, recordedAt, ...(source ? { source } : {}) };
    if (!served.has(e.id) && !wasWithdrawn) out.push({ ...base, event: "withdrawn", lastServedFrom, firstNotServedFrom: servedFrom, reason: withdrawalReason(e, model, servedRows) });
    else if (served.has(e.id) && wasWithdrawn) out.push({ ...base, event: "reinstated", reinstatedFrom: servedFrom });
  }
  return out;
}

/** Guard over the withdrawal file: prefix-preserving, known entries only, events alternate per entry, no price. */
export function withdrawalViolations({ beforeText = "", afterText = "", recordIds = new Set() }) {
  const v = [];
  if (!afterText.startsWith(beforeText)) v.push("the withdrawal file before this run is not an unchanged prefix of it after");
  const last = new Map();
  afterText.split("\n").filter((l) => l.trim()).forEach((l, i) => {
    let e; try { e = JSON.parse(l); } catch { v.push(`line ${i + 1}: not JSON`); return; }
    if (e.schema !== LEVEL_A_WITHDRAWAL_SCHEMA) v.push(`line ${i + 1}: schema`);
    if (!recordIds.has(e.id)) v.push(`line ${i + 1}: ${e.id} is not an entry in the suggestions record`);
    if (e.event !== "withdrawn" && e.event !== "reinstated") v.push(`line ${i + 1}: event ${e.event}`);
    if ((last.get(e.id) ?? "reinstated") === e.event) v.push(`line ${i + 1}: ${e.id} is ${e.event} twice in a row`);
    last.set(e.id, e.event);
    if (/"(price|payout|americanOdds|odds|book|bookmaker)"/.test(l)) v.push(`line ${i + 1}: a price field appears in a withdrawal`);
  });
  return v;
}
