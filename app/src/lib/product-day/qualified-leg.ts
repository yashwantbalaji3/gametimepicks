/**
 * THE QUALIFIED-LEG CONTRACT — one typed selection shape for every lane (Program 201 · A2).
 *
 * Each lane's generator grew its own leg dialect: MLB legs carry gamePk/market/odds, EPL legs carry
 * eventId/kickoff/books (market-priced by design — no model probability, on purpose), UFC legs
 * carry the model's own read. This module does NOT rewrite those generators; it is the contract
 * they must all be expressible in, plus the adapters that prove it against the COMMITTED lane
 * artifacts. A leg that cannot adapt does not silently pass — it returns a typed refusal, and the
 * guard test turns any refusal on a published card into a failing build.
 *
 * Two fields are deliberately three-state:
 *   modelProbability — a number when a model genuinely produced one (UFC), or the string reason
 *     for its absence (MLB/EPL market-priced lanes). Never zero-filled, never odds-derived.
 *   settlementId — the identity settlement will grade by (gamePk for MLB, eventId elsewhere).
 *     A leg with no settlement identity is REFUSED: an ungradeable leg never enters a card.
 */
import fs from "node:fs";
import path from "node:path";

export const QUALIFIED_LEG_SCHEMA_VERSION = 1;

export interface QualifiedLeg {
  schemaVersion: number;
  /** Stable within the day: `${slipId}#${index}` — the card is frozen, so the index is too. */
  id: string;
  sport: "mlb" | "epl" | "ufc" | "nfl";
  productDate: string;
  /** Event identity in the sport's own canonical vocabulary. */
  eventId: string;
  settlementId: string;
  market: string;
  side: string | null;
  line: number | null;
  /** American price as published on the frozen card. */
  price: number;
  /** A real model probability, or the typed reason none exists. Never zero, never invented. */
  modelProbability: number | { absent: string };
  participant: string | null;
  team: string | null;
  /** ISO freshness anchor: kickoff/start when the leg carries one, else the card's product date. */
  freshnessUtc: string;
  /** Source lineage when the lane records it (e.g. the books behind an EPL price). */
  sourceLineage: string[] | null;
}

export type LegRefusalCode =
  | "NO_SETTLEMENT_IDENTITY" | "NO_MARKET" | "NO_PRICE" | "UNKNOWN_LANE" | "MALFORMED_LEG";

export interface LegRefusal { code: LegRefusalCode; detail: string }
export type AdaptResult = { ok: true; leg: QualifiedLeg } | { ok: false; refusal: LegRefusal };

type RawLeg = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function adaptLaneLeg(
  lane: "mlb" | "epl" | "ufc",
  raw: RawLeg,
  ctx: { slipId: string; index: number; productDate: string },
): AdaptResult {
  const refuse = (code: LegRefusalCode, detail: string): AdaptResult => ({ ok: false, refusal: { code, detail } });
  if (!raw || typeof raw !== "object") return refuse("MALFORMED_LEG", `${ctx.slipId}#${ctx.index}: not an object`);

  const market = str(raw.market);
  if (!market) return refuse("NO_MARKET", `${ctx.slipId}#${ctx.index}: no market`);
  const price = num(raw.odds);
  if (price == null) return refuse("NO_PRICE", `${ctx.slipId}#${ctx.index}: no American price`);

  const settlementId =
    lane === "mlb" ? (num(raw.gamePk) != null ? String(raw.gamePk) : null) : str(raw.eventId);
  if (!settlementId) {
    return refuse("NO_SETTLEMENT_IDENTITY",
      `${ctx.slipId}#${ctx.index}: ${lane === "mlb" ? "no gamePk" : "no eventId"} — an ungradeable leg never enters a card`);
  }

  const modelProbability: QualifiedLeg["modelProbability"] =
    num(raw.modelProbability) != null
      ? (raw.modelProbability as number)
      : { absent: lane === "ufc" ? "no model read recorded for this leg" : "market-priced lane — the model does not price these legs by design" };

  return {
    ok: true,
    leg: {
      schemaVersion: QUALIFIED_LEG_SCHEMA_VERSION,
      id: `${ctx.slipId}#${ctx.index}`,
      sport: lane,
      productDate: ctx.productDate,
      eventId: lane === "mlb" ? (str(raw.gameId) ?? settlementId) : settlementId,
      settlementId,
      market,
      side: str(raw.side),
      line: num(raw.line),
      price,
      modelProbability,
      participant: str(raw.player),
      team: str(raw.team),
      freshnessUtc: str(raw.kickoffUtc) ?? `${ctx.productDate}T00:00:00Z`,
      sourceLineage: Array.isArray(raw.books) ? (raw.books as string[]) : null,
    },
  };
}

/**
 * Adapt one BUILDER leg into the contract (Program 202 · Release B).
 *
 * The builder's pool comes through the methodology engine (leakage/started/odds gating — the
 * generation-time qualifier). This adapter is the bridge that proves every leg the builder OFFERS
 * also satisfies the published contract: settlement identity present, three-state probability
 * (BuildLeg's own rule — null means "not modelled", never an odds-derived stand-in — maps to the
 * typed absence), a real price. A refusal here is a leg the builder must not offer.
 */
export function adaptBuildLeg(
  raw: { id?: string; sport?: string; gameId?: string | number | null; market?: string; americanOdds?: number; modelProbability?: number | null; sourceDate?: string | null; label?: string },
  ctx: { productDate: string },
): AdaptResult {
  const refuse = (code: LegRefusalCode, detail: string): AdaptResult => ({ ok: false, refusal: { code, detail } });
  if (!raw || typeof raw !== "object") return refuse("MALFORMED_LEG", "not an object");
  const market = str(raw.market);
  if (!market) return refuse("NO_MARKET", `${raw.id ?? "?"}: no market`);
  const price = num(raw.americanOdds);
  if (price == null) return refuse("NO_PRICE", `${raw.id ?? "?"}: no American price`);
  const settlementId = raw.gameId != null && `${raw.gameId}`.length > 0 ? String(raw.gameId) : null;
  if (!settlementId) {
    return refuse("NO_SETTLEMENT_IDENTITY", `${raw.id ?? "?"}: no gameId — an ungradeable leg never enters a card`);
  }
  const sportKey = String(raw.sport ?? "").toLowerCase();
  const sport = (["mlb", "epl", "ufc", "nfl"].includes(sportKey) ? sportKey : "mlb") as QualifiedLeg["sport"];
  return {
    ok: true,
    leg: {
      schemaVersion: QUALIFIED_LEG_SCHEMA_VERSION,
      id: String(raw.id ?? `${settlementId}#${market}`),
      sport,
      productDate: raw.sourceDate ?? ctx.productDate,
      eventId: settlementId,
      settlementId,
      market,
      side: null,
      line: null,
      price,
      modelProbability: num(raw.modelProbability) != null
        ? (raw.modelProbability as number)
        : { absent: "not modelled by the source — the builder renders absence, never an odds-derived stand-in" },
      participant: str(raw.label),
      team: null,
      freshnessUtc: `${raw.sourceDate ?? ctx.productDate}T00:00:00Z`,
      sourceLineage: null,
    },
  };
}

export interface LaneValidation {
  lane: "mlb" | "epl" | "ufc";
  date: string | null;
  cards: number;
  legs: number;
  adapted: number;
  refusals: Array<LegRefusal & { card: string }>;
}

const LADDER_DIR: Record<"mlb" | "epl" | "ufc", string> = {
  mlb: "risk-ladder", epl: "risk-ladder-epl", ufc: "risk-ladder-ufc",
};

/** Prove every PUBLISHED leg on today's committed ladders satisfies the contract. */
export function validateLaneArtifacts(dataRoot: string): LaneValidation[] {
  const out: LaneValidation[] = [];
  for (const lane of ["mlb", "epl", "ufc"] as const) {
    let doc: { date?: string; cards?: Array<{ slipId?: string; legs?: RawLeg[] }> } | null = null;
    try { doc = JSON.parse(fs.readFileSync(path.join(dataRoot, "parlays", LADDER_DIR[lane], "latest.json"), "utf8")); } catch { /* absent lane */ }
    const cards = doc?.cards ?? [];
    const v: LaneValidation = { lane, date: doc?.date ?? null, cards: cards.length, legs: 0, adapted: 0, refusals: [] };
    for (const card of cards) {
      const slipId = card.slipId ?? "unnamed-card";
      (card.legs ?? []).forEach((raw, index) => {
        v.legs += 1;
        const res = adaptLaneLeg(lane, raw, { slipId, index, productDate: doc?.date ?? "unknown" });
        if (res.ok) v.adapted += 1;
        else v.refusals.push({ ...res.refusal, card: slipId });
      });
    }
    out.push(v);
  }
  return out;
}
