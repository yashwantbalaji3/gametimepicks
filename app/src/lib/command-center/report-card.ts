/**
 * REPORT CARD CONTEXT (P319) — the status and freshness a report page gives its Save control, derived exactly as
 * the homepage lane derives them: the sport's product day for freshness, `modelStatusFor` for the lead status.
 * A report page and the homepage therefore describe the same event with the same chip, the same stamp and the
 * same settlement key; neither computes its own.
 */
import { productDayFor } from "@/lib/product-day/product-day";
import type { CardSport, Freshness, ModelStatusItem } from "./contract";
import { freshnessFor } from "./freshness";
import { modelStatusFor, type StatusContext } from "./model-status";

/** The family a sport's featured card rests on — the chip a card carries. */
export const LEAD_STATUS_ID: Record<CardSport, string> = { nfl: "nfl_team", mlb: "mlb_moneyline", epl: "epl_match_model", ufc: "ufc_model" };

/** The lead status for a featured card: the family the headline rests on. */
export const leadStatus = (items: ModelStatusItem[], preferId: string): ModelStatusItem =>
  items.find((s) => s.id === preferId) ?? items[0] ?? { id: "unknown", family: "Model", state: "UNKNOWN", headline: "Status unknown", detail: "", n: null, source: "" };

export function reportCardContext(sport: CardSport, ctx: StatusContext & { today?: string }): { status: ModelStatusItem; freshness: Freshness; nowIso: string } {
  let day: ReturnType<typeof productDayFor> | null = null;
  try { day = productDayFor(sport, ctx.dataRoot, ctx.today ? { today: ctx.today } : undefined); } catch { day = null; }
  const freshness = freshnessFor(day?.sourceStamp ?? null, ctx.nowIso, { sourceStale: day?.state === "SOURCE_STALE" });
  const status = leadStatus(modelStatusFor(sport, ctx), LEAD_STATUS_ID[sport]);
  return { status, freshness, nowIso: ctx.nowIso };
}
