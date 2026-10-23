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
 */
import { createHash } from "node:crypto";

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
