/**
 * RESEARCH CANDIDATES (founder 2026-11-04): market and historical research shown beside the lanes, NEVER as an official
 * selection — no stake, no payout, no "pick" wording, its own section with the engine's own label. Presentation of the
 * engine's research block (field names proposed to betting-engine, 2026-11-04, PENDING its contract): public legs from
 * the research file, line / odds / hit rates only from its encrypted price display. Stale lines are marked stale and
 * their numbers withheld, never shown as current. Pure.
 */
import { decimalToAmerican } from "../../challenge-lanes/payout.mjs";
import { hitRateText, evidenceOf } from "./lane.mjs";

const PROP_MARKET = Object.freeze({ pts: "PTS", reb: "REB", ast: "AST", points: "PTS", rebounds: "REB", assists: "AST" });
const american = (n) => (typeof n === "number" && Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : null);
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET.format(t)} ET` : null; };
export const RESEARCH_DEFAULT_LABEL = "Research candidates — not official selections";

/** The section view, or null (no block, or an official block — research is never official). `now` = the build instant. */
export function researchView(block, { prices = null, now = Date.now() } = {}) {
  if (!block || block.official !== false || !Array.isArray(block.candidates) || !block.candidates.length) return null;
  const priceOf = new Map((prices?.candidates ?? []).map((c) => [c.candidateId, c]));
  return {
    date: block.date ?? null,
    label: block.label ?? RESEARCH_DEFAULT_LABEL,
    heldNote: block.heldReason ?? null,
    candidates: block.candidates.map((c) => {
      const pc = priceOf.get(c.candidateId);
      const staleAt = Date.parse(String(pc?.staleAfter ?? ""));
      const stale = Number.isFinite(staleAt) && now > staleAt;
      const lp = new Map((pc?.legs ?? []).map((l) => [l.legId, l]));
      return {
        id: c.candidateId, status: c.status ?? "RESEARCH", evidence: evidenceOf(c), reason: c.reason ?? null, stale,
        captured: stale ? null : et(pc?.fetchedAt),
        legs: (c.legs ?? []).map((l) => {
          const p = stale ? null : lp.get(l.legId);
          const prop = l.market !== "winner";
          return {
            legId: l.legId, game: l.eventLabel ?? l.gameId ?? null,
            who: prop ? l.player?.name ?? null : l.selection?.label ?? l.selection?.teamAbbr ?? null,
            what: prop ? [l.side, p?.line != null ? String(p.line) : null, PROP_MARKET[l.market] ?? l.market].filter(Boolean).join(" ") : "Moneyline",
            projection: prop ? (typeof l.projection?.value === "number" ? l.projection.value.toFixed(1) : null) : l.probabilityShown ?? null,
            projectionLabel: prop ? "MODEL PROJECTION" : "MODEL WIN PROBABILITY",
            odds: p ? american(p.oddsFormat === "decimal" ? decimalToAmerican(p.price) : p.price) : null, book: p?.book ?? null,
            hitRates: (p?.hitRates ?? []).map(hitRateText).filter(Boolean),
          };
        }),
      };
    }),
  };
}
