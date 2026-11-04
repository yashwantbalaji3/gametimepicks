/**
 * SITE ↔ ENGINE PARITY (PD, 2026-11-04): for one lane, what the site renders must equal the engine's canonical record —
 * the committed public projection (gtp.challenge-lane.public@1) and its decrypted price display
 * (gtp.challenge-lane.prices@1). The record is read RAW here, not through laneDisplay, so a site-side bug cannot hide
 * behind the shared fold. FAIL-CLOSED: a field missing on either side, or different, fails. bb-social checks its
 * graphic against the same record. Pure; returns rows, never prints a price.
 */
import { decimalToAmerican } from "../../challenge-lanes/payout.mjs";

const money = (cents) => (typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toLocaleString("en-US", cents % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}` : null);
const american = (n) => (typeof n === "number" && Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : null);

/** [{ laneId, field, engine, site, ok }] for one lane. `prices` may be null (the price rows then fail, closed). */
export function laneParity({ doc, prices, view }) {
  const out = [];
  const row = (field, engine, site) => out.push({ laneId: doc.laneId, field, engine: engine ?? null, site: site ?? null, ok: engine != null && site != null && JSON.stringify(engine) === JSON.stringify(site) });
  const run = doc.runs.at(-1);
  const day = run.days.at(-1);
  const card = day?.card ?? null;
  row("runId", run.runId, view.runId);
  row("step", doc.current.step, view.step);
  row("steps", doc.steps, view.steps);
  row("status", doc.current.publicStatus, view.status);
  row("base", money(doc.baseCents), view.base);
  row("target", money(doc.targetCents), view.target);
  row("projection sha", doc.contentSha256, view.sourceSha256);
  row("card date", card ? day.date : null, view.current?.date ?? null);
  row("leg ids", card?.legs.map((l) => l.legId), view.current?.legs.map((l) => l.legId));
  row("markets", card?.legs.map((l) => l.market), view.current?.legs.map((l) => l.market));
  row("selections", card?.legs.map((l) => l.selection?.teamAbbr ?? l.selection?.label), view.current?.legs.map((l) => l.teamAbbr ?? l.selection));
  row("model win probability", card?.legs.map((l) => l.probabilityShown), view.current?.legs.map((l) => l.projection));
  row("projection snapshots", card?.legs.map((l) => l.projection?.snapshotId), view.current?.legs.map((l) => l.snapshotId));
  const pr = prices?.runs?.find((r) => r.runId === run.runId);
  const pd = pr?.days?.filter((d) => d.date === day?.date).at(-1) ?? null;
  row("prices bound to projection", prices?.projectionSha256, doc.contentSha256);
  row("tracked bankroll", money(pr?.trackedBankrollCents), view.tracked);
  row("verification", pd?.verification, view.current?.price ? (view.verification ?? "VERIFIED") : null);
  row("book", pd?.book, view.current?.price?.book);
  row("leg odds", pd?.legs.map((l) => [l.legId, l.oddsFormat === "american" ? american(l.price) : american(decimalToAmerican(l.price))]), view.current?.legs.map((l) => [l.legId, l.price?.odds ?? null]));
  row("combined decimal", typeof pd?.decimalPrice === "number" ? pd.decimalPrice.toFixed(2) : null, typeof view.current?.price?.decimal === "number" ? view.current.price.decimal.toFixed(2) : null);
  row("stake", money(pd?.stakeCents), view.current?.price?.stake);
  row("payout", money(pd?.grossPayoutCents), view.current?.price?.payout);
  row("profit", money(pd?.profitCents), view.current?.price?.profit);
  row("odds snapshot sha", pd?.priceSnapshotSha256, view.current?.price?.snapshotSha256);
  return out;
}

/** The report for several lanes: { ok, failures, rows }. */
export function parityReport(perLane) {
  const rows = perLane.flat();
  const failures = rows.filter((r) => !r.ok);
  return { ok: rows.length > 0 && failures.length === 0, failures: failures.map((r) => `${r.laneId} ${r.field}${r.engine == null ? " (NOT_IN_RECORD)" : r.site == null ? " (NOT_ON_SITE)" : ""}`), rows };
}
