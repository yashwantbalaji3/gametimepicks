/**
 * RESEARCH CANDIDATES (founder 2026-11-04): market and historical research shown beside the lanes, NEVER as an official
 * selection — no stake, no payout, no "pick" wording, its own section with the engine's own labels. Presentation of the
 * engine's researchDisplay (lib/challenge-lanes/research.mjs: gtp.challenge-research.public@1 + its encrypted
 * companion). Lines, odds and k/n hit rates only from the companion; a leg past its staleAfter shows none of them and
 * says so. Pure.
 */
import { decimalToAmerican } from "../../challenge-lanes/payout.mjs";
import { hitRateText, evidenceOf, isProp, PROP_MARKET, flagWords, selectionOf } from "./lane.mjs";

const american = (n) => (typeof n === "number" && Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : null);
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET.format(t)} ET` : null; };
const LANE_NAME = Object.freeze({ "bb-a": "Bank Builder · Lane A", "bb-b": "Bank Builder · Lane B", "ms-a": "Moonshot · Lane A", "ms-b": "Moonshot · Lane B" });

/** The section view, or null (no file, or a block not marked official:false — research is never official). `now` = the build instant. */
export function researchView(d, { now = Date.now() } = {}) {
  if (!d || d.official !== false || !Array.isArray(d.candidates) || !d.candidates.length) return null;
  return {
    date: d.date ?? null, label: d.label, heldLabel: d.heldLabel ?? "Not an official selection", rankingLabel: d.rankingLabel ?? null,
    lanesHeld: (d.lanesHeld ?? []).map((h) => ({ lane: LANE_NAME[h.laneId] ?? h.laneId, reason: h.reason ?? null })),
    candidates: d.candidates.map((c) => {
      const legs = c.legs.map((l) => {
        const staleAt = Date.parse(String(l.price?.staleAfter ?? ""));
        const stale = Boolean(l.price) && (!Number.isFinite(staleAt) || now > staleAt);
        const p = stale ? null : l.price;
        const prop = isProp(l);
        return {
          legId: l.legId, game: l.eventLabel ?? l.gameId ?? null, stale,
          who: prop ? l.player?.name ?? null : l.team ?? null,
          what: prop ? [l.side ? String(l.side).toUpperCase() : null, p?.line != null ? String(p.line) : null, PROP_MARKET[l.family] ?? PROP_MARKET[l.market] ?? l.market].filter(Boolean).join(" ") : "Moneyline",
          projection: prop && typeof l.projection?.value === "number" ? l.projection.value.toFixed(1) : null,
          projectionLabel: prop ? l.projection?.label ?? "MODEL PROJECTION" : null,
          odds: p ? american(p.american) : null, book: p?.book ?? null, captured: p ? et(p.fetchedAt) : null,
          hitRates: (p?.hitRates ?? []).map(hitRateText).filter(Boolean),
          evidenceLine: typeof p?.evidenceLine === "string" && !/%|\b0?\.\d/.test(p.evidenceLine) ? p.evidenceLine : null,
          limits: [...new Set((c.flags ?? []).filter((f) => f?.legId === l.legId).map(flagWords).filter(Boolean))],
        };
      });
      const anyStale = legs.some((l) => l.stale);
      return {
        id: c.candidateId, status: c.status ?? "RESEARCH", selection: selectionOf(c), rank: c.rank ?? null, evidence: evidenceOf(c), reasonCodes: c.reasonCodes ?? [], stale: anyStale, legs,
        combined: !anyStale && c.combined ? { label: c.combined.label, odds: american(c.combined.american ?? decimalToAmerican(c.combined.decimal)) } : null,
      };
    }),
  };
}
