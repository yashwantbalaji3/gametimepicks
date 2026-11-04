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
  /* Rules-v2 fields are absent on v1 records: absent on both sides matches; present on one side only fails. */
  const rowOpt = (field, engine, site) => out.push({ laneId: doc.laneId, field, engine: engine ?? null, site: site ?? null, ok: JSON.stringify(engine ?? null) === JSON.stringify(site ?? null) });
  const run = doc.runs.at(-1);
  const day = run.days.at(-1);
  const card = day?.card ?? null;
  /* What the site renders for that same day: the current selection, or (a settled or held day) its history entry. */
  const siteDay = view.current ?? view.story?.find((x) => x.date === day?.date && x.step === day?.step) ?? null;
  row("runId", run.runId, view.runId);
  row("step", doc.current.step, view.step);
  row("steps", doc.steps, view.steps);
  row("status", doc.current.publicStatus, view.status);
  row("base", money(doc.baseCents), view.base);
  row("target", money(doc.targetCents), view.target);
  row("projection sha", doc.contentSha256, view.sourceSha256);
  row("day", day ? `${day.date}/${day.step}` : null, siteDay ? `${siteDay.date}/${siteDay.step}` : null);
  rowOpt("leg ids", card?.legs.map((l) => l.legId), siteDay?.hasCard ? siteDay.legs.map((l) => l.legId) : null);
  rowOpt("markets", card?.legs.map((l) => l.market), siteDay?.hasCard ? siteDay.legs.map((l) => l.market) : null);
  rowOpt("selections", card?.legs.map((l) => l.selection?.teamAbbr ?? l.selection?.label), siteDay?.hasCard ? siteDay.legs.map((l) => l.teamAbbr ?? l.selection) : null);
  rowOpt("model win probability", card?.legs.map((l) => l.probabilityShown), siteDay?.hasCard ? siteDay.legs.map((l) => l.projection) : null);
  rowOpt("projection snapshots", card?.legs.map((l) => l.projection?.snapshotId), siteDay?.hasCard ? siteDay.legs.map((l) => l.snapshotId) : null);
  row("rule version", doc.ruleVersion ?? doc.current?.ruleVersion ?? "bbm-rules@1", view.ruleVersion ?? "bbm-rules@1");
  rowOpt("leg count", typeof day?.legCount === "number" && card ? day.legCount : null, siteDay?.hasCard && typeof day?.legCount === "number" ? siteDay.legs.length : null);
  out.push({ laneId: doc.laneId, field: "leg cap", engine: day?.maxLegs ?? null, site: siteDay?.legs?.length ?? null, ok: typeof day?.maxLegs !== "number" || !siteDay || siteDay.legs.length <= day.maxLegs });
  rowOpt("step target", typeof day?.targetPayoutCents === "number" ? { label: day.targetPayoutLabel ?? null, value: money(day.targetPayoutCents) } : null, view.stepTarget ?? null);
  const pr = prices?.runs?.find((r) => r.runId === run.runId);
  const pd = pr?.days?.filter((d) => d.date === day?.date).at(-1) ?? null;
  row("prices bound to projection", prices?.projectionSha256, doc.contentSha256);
  row("tracked bankroll", money(pr?.trackedBankrollCents), view.tracked);
  const sp = siteDay?.price ?? null;
  const priced = pd && pd.verification !== "REFUSED";
  /* A priced day must show every price field, exactly (fail-closed); an unpriced or refused day must show none. */
  const rowP = priced ? row : rowOpt;
  rowP("verification", priced ? pd.verification : null, sp ? (sp.verification ?? "VERIFIED") : null);
  rowP("book", priced ? pd.book : null, sp?.book);
  rowP("leg odds", priced ? pd.legs.map((l) => [l.legId, l.oddsFormat === "american" ? american(l.price) : american(decimalToAmerican(l.price))]) : null, sp ? siteDay.legs.map((l) => [l.legId, l.price?.odds ?? null]) : null);
  rowP("combined decimal", priced && typeof pd.decimalPrice === "number" ? pd.decimalPrice.toFixed(2) : null, typeof sp?.decimal === "number" ? sp.decimal.toFixed(2) : null);
  rowP("stake", priced ? money(pd.stakeCents) : null, sp?.stake);
  rowP("payout", priced ? money(pd.grossPayoutCents) : null, sp?.payout);
  rowP("profit", priced ? money(pd.profitCents) : null, sp?.profit);
  rowP("odds snapshot sha", priced ? pd.priceSnapshotSha256 : null, sp?.snapshotSha256);
  return out;
}

/** The report for several lanes: { ok, failures, rows }. */
export function parityReport(perLane) {
  const rows = perLane.flat();
  const failures = rows.filter((r) => !r.ok);
  return { ok: rows.length > 0 && failures.length === 0, failures: failures.map((r) => `${r.laneId} ${r.field}${r.engine == null ? " (NOT_IN_RECORD)" : r.site == null ? " (NOT_ON_SITE)" : ""}`), rows };
}
