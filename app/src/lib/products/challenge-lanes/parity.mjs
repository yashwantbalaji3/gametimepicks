/**
 * SITE ↔ ENGINE PARITY (PD, 2026-11-04): for one lane, what the site renders must equal the engine's canonical record —
 * the committed public projection (gtp.challenge-lane.public@1) and its decrypted price display
 * (gtp.challenge-lane.prices@1). The record is read RAW here, not through laneDisplay, so a site-side bug cannot hide
 * behind the shared fold. FAIL-CLOSED: a field missing on either side, or different, fails. bb-social checks its
 * graphic against the same record. Pure; returns rows, never prints a price.
 */
import { decimalToAmerican } from "../../challenge-lanes/payout.mjs";
import { isProp, hitRateText, flagWords } from "./lane.mjs";
import { EVIDENCE_LABEL } from "../../challenge-lanes/card-fields.mjs";
import { laneDisplay } from "../../challenge-lanes/display.mjs";

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
  rowOpt("selections", card?.legs.map((l) => (isProp(l) ? l.player?.name ?? null : l.selection?.teamAbbr ?? l.team ?? l.selection?.label)), siteDay?.hasCard ? siteDay.legs.map((l) => (l.prop ? l.player?.name ?? null : l.teamAbbr ?? l.selection)) : null);
  /* Winner legs only: a prop leg shows a MODEL PROJECTION (the player's number), compared under "prop projections". */
  const winners = card?.legs.filter((l) => !isProp(l)) ?? [];
  const siteWinners = siteDay?.hasCard ? siteDay.legs.filter((l) => !l.prop) : [];
  rowOpt("model win probability", winners.length ? winners.map((l) => l.probabilityShown) : null, siteWinners.length ? siteWinners.map((l) => l.projection) : null);
  rowOpt("projection snapshots", card?.legs.map((l) => l.projection?.snapshotId), siteDay?.hasCard ? siteDay.legs.map((l) => l.snapshotId) : null);
  row("rule version", doc.ruleVersion ?? doc.current?.ruleVersion ?? "bbm-rules@1", view.ruleVersion ?? "bbm-rules@1");
  rowOpt("leg count", typeof day?.legCount === "number" && card ? day.legCount : null, siteDay?.hasCard && typeof day?.legCount === "number" ? siteDay.legs.length : null);
  out.push({ laneId: doc.laneId, field: "leg cap", engine: day?.maxLegs ?? null, site: siteDay?.legs?.length ?? null, ok: typeof day?.maxLegs !== "number" || !siteDay || siteDay.legs.length <= day.maxLegs });
  /* Evidence class (founder 2026-11-04: LEVEL A model-validated / LEVEL B historical hit-rate research): the site shows
     the record's class and label verbatim, for the day and every leg; absent on both matches (v1 and pre-class records). */
  const ev = (x) => { const c = x?.evidenceClass ?? (x?.classification && x.classification !== "HOLD" ? x.classification : null); return c ? [c, x.evidenceLabel ?? EVIDENCE_LABEL[c] ?? c] : null; };
  const evS = (x) => (x?.evidence ? [x.evidence.class, x.evidence.label] : null);
  /* The record's day class is its frozen card's classification (HOLD is not a class), with the card's own label. */
  rowOpt("evidence class", ev(day) ?? (card ? ev({ classification: card.classification, evidenceLabel: card.evidenceLabel }) : null), evS(siteDay));
  rowOpt("leg evidence", card?.legs.some((l) => ev(l)) ? card.legs.map(ev) : null, siteDay?.hasCard && siteDay.legs.some((l) => l.evidence) ? siteDay.legs.map(evS) : null);
  /* Player-prop legs: who, which side, which market, and the MODEL PROJECTION shown. */
  const props = card?.legs.filter(isProp) ?? [];
  const siteProps = siteDay?.hasCard ? siteDay.legs.filter((l) => l.prop) : [];
  rowOpt("prop players", props.length ? props.map((l) => [l.legId, l.player?.name ?? null, l.player?.team ?? l.team ?? null]) : null, siteProps.length ? siteProps.map((l) => [l.legId, l.player?.name ?? null, l.player?.team ?? null]) : null);
  rowOpt("prop sides", props.length ? props.map((l) => [l.legId, l.side ? String(l.side).toUpperCase() : null]) : null, siteProps.length ? siteProps.map((l) => [l.legId, l.player?.side ?? null]) : null);
  rowOpt("prop projections", props.length ? props.map((l) => [l.legId, typeof l.projection?.value === "number" ? l.projection.value.toFixed(1) : null]) : null, siteProps.length ? siteProps.map((l) => [l.legId, l.projection ?? null]) : null);
  /* A LOST lane shows no step target (nothing is being played for). */
  /* DAILY RESEARCH SELECTION: the card's mode label verbatim and its disclosed-limit codes per leg. */
  rowOpt("selection label", card?.selectionLabel ?? null, siteDay?.selection?.label ?? null);
  rowOpt("flag codes", card?.flags?.length ? card.legs.map((l) => [l.legId, [...new Set(card.flags.filter((f) => f.legId === l.legId).map(flagWords).filter(Boolean))]]) : null,
    siteDay?.legs?.some((l) => l.limits?.length) ? siteDay.legs.map((l) => [l.legId, l.limits ?? []]) : null);
  rowOpt("step target", typeof day?.targetPayoutCents === "number" && doc.current?.publicStatus !== "LOST" ? { label: day.targetPayoutLabel ?? null, value: money(day.targetPayoutCents) } : null, view.stepTarget ?? null);
  const pr = prices?.runs?.find((r) => r.runId === run.runId);
  const pd = pr?.days?.filter((d) => d.date === day?.date).at(-1) ?? null;
  row("prices bound to projection", prices?.projectionSha256, doc.contentSha256);
  /* The post-settlement bankroll in every state ($0 on BUSTED, engine 566ab9cfd5); the site never shows a pre-loss figure. */
  row("tracked bankroll", pr ? money(pr.trackedBankrollCents) : doc.current?.publicStatus === "LOST" ? "Busted" : null, view.tracked);
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
  /* Prop lines and k/n hit rates come only from the encrypted display; a hit rate is compared as "k of n (window)" text,
     never as a probability. */
  const pLegs = priced ? pd.legs.filter((l) => props.some((p) => p.legId === l.legId)) : [];
  const detail = new Map((priced ? pd.legDetails ?? [] : []).map((d) => [d.legId, d]));
  const hrOf = (l) => (detail.get(l.legId)?.hitRates ?? l.hitRates ?? []).map(hitRateText).filter(Boolean);
  const sProps = sp ? siteProps : [];
  rowOpt("prop lines", pLegs.length ? pLegs.map((l) => [l.legId, l.line ?? detail.get(l.legId)?.line ?? null]) : null, sProps.length ? sProps.map((l) => [l.legId, l.price?.line ?? null]) : null);
  rowOpt("evidence lines", pLegs.some((l) => detail.get(l.legId)?.evidenceLine) ? pLegs.map((l) => [l.legId, detail.get(l.legId)?.evidenceLine ?? null]) : null, sProps.some((l) => l.price?.evidenceLine) ? sProps.map((l) => [l.legId, l.price?.evidenceLine ?? null]) : null);
  rowOpt("prop hit rates", pLegs.some((l) => hrOf(l).length) ? pLegs.map((l) => [l.legId, hrOf(l)]) : null, sProps.some((l) => l.price?.hitRates?.length) ? sProps.map((l) => [l.legId, l.price?.hitRates ?? []]) : null);
  rowP("price event sha", priced ? pd.priceEventSha256 : null, sp?.priceEventSha256);
  /* Graphics (PD 2026-11-04): every GRAPHIC_RENDERED receipt the record holds, with its image, caption and renderer
     version, is the one the site lists — same order, same hashes. Absent on both sides matches. */
  const recG = run.days.flatMap((d) => (d.receipts ?? []).filter((r) => r.type === "GRAPHIC_RENDERED"));
  rowOpt("graphic receipts", recG.length ? recG.map((g) => [g.date, g.packageId ?? null, g.imageSha256 ?? null, g.captionSha256 ?? null, g.rendererCommit ?? null]) : null,
    view.graphics?.length ? view.graphics.map((g) => [g.date, g.packageId, g.imageSha256, g.captionSha256 ?? null, g.graphicVersion ?? null]) : null);
  rowP("odds snapshot sha", priced ? pd.priceSnapshotSha256 : null, sp?.snapshotSha256);
  return out;
}

/**
 * The research section against the engine's research block (fail-closed like the lanes): the same candidates, statuses,
 * evidence classes and legs, never official, and no stale line shown. Absent on both sides matches.
 */
export function researchParity({ block, view, laneId = "research" }) {
  const out = [];
  const row = (field, engine, site) => out.push({ laneId, field, engine: engine ?? null, site: site ?? null, ok: JSON.stringify(engine ?? null) === JSON.stringify(site ?? null) });
  const live = block && block.official === false && block.candidates?.length ? block : null;
  out.push({ laneId, field: "research never official", engine: block?.official ?? null, site: view ? "not official" : null, ok: !view || block?.official === false });
  row("research candidates", live?.candidates.map((c) => [c.candidateId, c.status ?? "RESEARCH", c.evidenceClass ?? null]), view?.candidates.map((c) => [c.id, c.status, c.evidence?.class ?? null]));
  row("research legs", live?.candidates.map((c) => c.legs.map((l) => [l.legId, isProp(l) ? l.player?.name ?? null : l.team ?? null])), view?.candidates.map((c) => c.legs.map((l) => [l.legId, l.who])));
  /* A stale line is withheld whole: no odds, no hit rates, no capture time (the line itself is never put in `what`). */
  out.push({ laneId, field: "no stale line shown", engine: null, site: null, ok: !view || view.candidates.every((c) => !c.stale || (c.captured == null && c.legs.every((l) => l.odds == null && !l.hitRates.length))) });
  return out;
}

/**
 * CROSS-SURFACE PARITY (PD 2026-11-04): engine ↔ site ↔ graphic ↔ caption ↔ console for one lane. Each surface hands
 * in rows keyed by (date, packageId): bb-social's render manifest ({date, packageId, imageSha256, captionSha256,
 * graphicVersion, priceEventSha256}), the posted caption ({date, packageId, captionSha256}) and the console's approval
 * receipt ({date, packageId, imageSha256, approvedVersionSha256}). Every row must match the engine record's
 * GRAPHIC_RENDERED / APPROVED receipts and, when priced, the price display's priceEventSha256 for that day. A surface
 * row with no record receipt, or a record graphic missing from a surface that was handed in, fails. Field names are
 * PROPOSED to betting-engine and bb-social (2026-11-04).
 */
export function surfaceParity({ doc, prices = null, view = null, graphic = null, caption = null, console: cons = null }) {
  const out = [];
  const push = (field, engine, site) => out.push({ laneId: doc.laneId, field, engine: engine ?? null, site: site ?? null, ok: JSON.stringify(engine ?? null) === JSON.stringify(site ?? null) });
  const receipts = doc.runs.flatMap((r) => r.days.flatMap((d) => d.receipts ?? []));
  const key = (x) => `${x.date}|${x.packageId ?? ""}`;
  const rendered = new Map(receipts.filter((r) => r.type === "GRAPHIC_RENDERED").map((r) => [key(r), r]));
  const approved = new Map(receipts.filter((r) => r.type === "APPROVED").map((r) => [key(r), r]));
  const priceDays = new Map((prices?.runs ?? []).flatMap((r) => r.days).map((d) => [d.date, d]));
  /* The card or status event each day's image must be drawn from (betting-engine: display day.sourceEventSha256). */
  const shown = laneDisplay(doc);
  const sourceEvent = new Map([...shown.history, ...(shown.day ? [shown.day] : [])].map((d) => [d.date, d.sourceEventSha256 ?? null]));
  /* Record-internal checks (betting-engine 2026-11-04): POSTED approves what APPROVED approved; card@2.graphicVersion
     mirrors "<rendererCommit>:<imageSha256>"; card@2.priceEventSha256 mirrors the price display's. */
  for (const p of receipts.filter((r) => r.type === "POSTED")) push(`record ${key(p)} posted = approved version`, approved.get(key(p))?.approvedVersionSha256 ?? null, p.approvedVersionSha256 ?? null);
  for (const d of doc.runs.flatMap((r) => r.days)) {
    const card = d.card;
    if (!card) continue;
    if (card.graphicVersion != null) {
      const g = [...rendered.values()].filter((r) => r.date === d.date).at(-1);
      push(`record ${d.date} graphic version mirror`, g ? `${g.rendererCommit}:${g.imageSha256}` : null, card.graphicVersion);
    }
    if (card.priceEventSha256 != null && prices) push(`record ${d.date} price event mirror`, priceDays.get(d.date)?.priceEventSha256 ?? null, card.priceEventSha256);
  }
  const surfaces = { site: view?.graphics ?? null, graphic, caption, console: cons };
  for (const [name, rows] of Object.entries(surfaces)) {
    if (!rows) continue;
    const seen = new Set(rows.map(key));
    for (const k of rendered.keys()) if (!seen.has(k)) push(`${name} ${k} graphic`, k, null);
    for (const row of rows) {
      const k = key(row), g = rendered.get(k);
      if (!g) { push(`${name} ${k} graphic`, null, k); continue; }
      if ("imageSha256" in row) push(`${name} ${k} image sha`, g.imageSha256 ?? null, row.imageSha256);
      if ("captionSha256" in row) push(`${name} ${k} caption sha`, g.captionSha256 ?? null, row.captionSha256);
      if ("graphicVersion" in row) push(`${name} ${k} graphic version`, g.rendererCommit ?? null, row.graphicVersion);
      if ("approvedVersionSha256" in row) push(`${name} ${k} approved version`, approved.get(k)?.approvedVersionSha256 ?? null, row.approvedVersionSha256);
      if ("priceEventSha256" in row && prices) push(`${name} ${k} price event`, priceDays.get(row.date)?.priceEventSha256 ?? null, row.priceEventSha256);
      if ("payoutEventSha256" in row && prices) push(`${name} ${k} payout event`, priceDays.get(row.date)?.payoutEventSha256 ?? null, row.payoutEventSha256);
      if ("refEventSha256" in row) push(`${name} ${k} drawn from`, g.refEventSha256 ?? sourceEvent.get(row.date) ?? null, row.refEventSha256);
    }
  }
  return out;
}

/** The report for several lanes: { ok, failures, rows }. */
export function parityReport(perLane) {
  const rows = perLane.flat();
  const failures = rows.filter((r) => !r.ok);
  return { ok: rows.length > 0 && failures.length === 0, failures: failures.map((r) => `${r.laneId} ${r.field}${r.engine == null ? " (NOT_IN_RECORD)" : r.site == null ? " (NOT_ON_SITE)" : ""}`), rows };
}
