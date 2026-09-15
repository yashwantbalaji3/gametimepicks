"use client";
/**
 * SaveForecastButton (P310) — save or unsave a forecast card to the reader's browser. Renders as an unsaved control on
 * the server and on the first client paint (the store loads after mount), then reflects the store. An analytics
 * item, never a wager: the label says "Save", the page it leads to says what a saved forecast is.
 */
import { useMemo } from "react";
import { useSavedForecasts } from "@/lib/saved/saved-store";
import type { PredictionCardModel } from "@/lib/command-center/contract";
import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { SCHEMA_VERSION, type Sport } from "@/lib/analytics/event-contract";
import { currentEtDate } from "@/lib/freshness";

export default function SaveForecastButton({ card, compact = true }: { card: PredictionCardModel; compact?: boolean }) {
  const { ready, isSaved, save, unsave } = useSavedForecasts();
  const saved = ready && isSaved(card.id);
  const sink = useMemo(() => resolveSink(readSinkConfig()), []);
  const sport = card.sport as Sport;
  return (
    <button
      type="button"
      onClick={() => {
        if (saved) { unsave(card.id); track({ event: "forecast_unsaved", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "app", sport }, sink); }
        else { save(card); track({ event: "forecast_saved", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "app", sport }, sink); }
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${card.away.name} and ${card.home.name} from your saved forecasts` : `Save the ${card.away.name} and ${card.home.name} forecast`}
      className="gtp-save-btn inline-flex items-center gap-1 rounded-full font-mono uppercase tracking-[0.08em]"
      style={{ minHeight: compact ? 28 : 36, padding: compact ? "0 8px" : "0 12px", fontSize: 9.5, border: `1px solid ${saved ? "var(--vault-gold)" : "var(--vault-rule)"}`, color: saved ? "var(--vault-gold)" : "var(--vault-text-mute)", background: "transparent", cursor: "pointer" }}
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      <span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
