/**
 * FRESHNESS (P309) — one rule for "when was this produced", from the artifact's own stamp against the build
 * instant. Never the browser clock: a static export's "updated" is the pipeline's, and a visitor's clock says
 * nothing about it. A sport whose product-day owner already says SOURCE_STALE is stale here too, whatever the age.
 */
import { formatUpdatedEt } from "@/lib/format";
import type { Freshness, FreshnessState } from "./contract";

export const FRESH_HOURS = 12;
export const DELAYED_HOURS = 36;

export function freshnessFor(updatedAt: string | null | undefined, nowIso: string, { sourceStale = false }: { sourceStale?: boolean } = {}): Freshness {
  const at = Date.parse(updatedAt ?? "");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return { state: "MISSING", updatedAt: null, label: "No update stamp", ageHours: null };
  const ageHours = Math.max(0, (now - at) / 3600e3);
  const state: FreshnessState = sourceStale || ageHours >= DELAYED_HOURS ? "STALE" : ageHours >= FRESH_HOURS ? "DELAYED" : "FRESH";
  const stamp = formatUpdatedEt(updatedAt);
  const label = state === "STALE" ? `Last update ${stamp} · stale` : state === "DELAYED" ? `Updated ${stamp} · update due` : `Updated ${stamp}`;
  return { state, updatedAt: new Date(at).toISOString(), label, ageHours: Number(ageHours.toFixed(1)) };
}
