/**
 * "Add to slip" on the sport hubs' forecast rows (release owner, Vehicle N · stacked on the model-only Smart Betslip,
 * PR 1257). SERVER.
 *
 * A hub asks for its rows' Level A legs ONCE (hubSlipLegs → levelASlipLegFor, the betting session's helper: the exact
 * Level A leg for that event, or null), renders <HubSlipButton> in each row — nothing when the row has no leg, so no
 * non-Level-A pick can ever be added — and <HubSlipBar> exactly once, with the legs it rendered buttons for. The bar
 * renders nothing without a leg, so the slip island only ships where a button does.
 */
import { AddToSlip, ModelSlipBar } from "@/components/products/level-a-slip";
import { levelASlipLegFor, slipLegFor } from "@/lib/products/level-a/slip-legs.mjs";

export type HubSlipLeg = NonNullable<Awaited<ReturnType<typeof levelASlipLegFor>>>;
export type HubSlipLegs = ReadonlyMap<string, HubSlipLeg>;

/** Level A sports with a hub (the helper's own sport keys). */
export type HubSlipSport = "nba" | "mlb" | "epl" | "ligue-1";

/** The rows' legs, keyed by the Level A event id the caller passed; rows without one are absent. `model` (tests) is a
 *  Level A page model; omitted, the helper builds the page model once per build. */
export async function hubSlipLegs(sport: HubSlipSport, eventIds: readonly string[], { model }: { model?: Parameters<typeof slipLegFor>[0] } = {}): Promise<HubSlipLegs> {
  const out = new Map<string, HubSlipLeg>();
  for (const id of new Set(eventIds.map(String))) {
    const leg = model ? slipLegFor(model, sport, id) : await levelASlipLegFor(sport, id);
    if (leg) out.set(id, leg as HubSlipLeg);
  }
  return out;
}

/** The row's button, or nothing. `name` defaults to the leg's own outcome and event ("Arsenal to win, Arsenal v Spurs"). */
export function HubSlipButton({ leg }: { leg: HubSlipLeg | null | undefined }) {
  if (!leg) return null;
  return <AddToSlip keys={[leg.key]} name={`${leg.outcome.label}, ${leg.eventLabel}`} />;
}

/** The page's one slip bar, carrying exactly the legs its buttons add. */
export function HubSlipBar({ legs }: { legs: HubSlipLegs }) {
  return legs.size ? <ModelSlipBar catalog={[...legs.values()]} /> : null;
}
