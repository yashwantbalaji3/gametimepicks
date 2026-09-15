"use client";
/**
 * SaveForecastButton (P310/P319) — save or unsave a forecast card to the reader's browser. Renders as an unsaved
 * control on the server and on the first client paint (the store loads after mount), then reflects the store.
 * An analytics item, never a wager: the label says "Save", the page it leads to says what a saved forecast is.
 *
 * P319: the same control sits on the report pages (`placement="report"`), built from the same card the homepage
 * would feature. Two honest refusals, decided on the client clock at render time: a card with no active call
 * (paused or withdrawn) shows nothing to save, and an event that has started shows "Started" instead of a save —
 * a page built before kickoff cannot offer a pre-event save after it.
 */
import { useEffect, useMemo, useState } from "react";
import { useSavedForecasts } from "@/lib/saved/saved-store";
import { saveEligibility } from "@/lib/saved/saved-schema.mjs";
import type { SaveCard } from "@/lib/saved/saved-store";

import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { SCHEMA_VERSION, type SavePlacement, type Sport } from "@/lib/analytics/event-contract";
import { currentEtDate } from "@/lib/freshness";

export default function SaveForecastButton({ card, compact = true, placement = "homepage" }: { card: SaveCard; compact?: boolean; placement?: SavePlacement }) {
  const { ready, isSaved, save, unsave } = useSavedForecasts();
  const saved = ready && isSaved(card.id);
  const sink = useMemo(() => resolveSink(readSinkConfig()), []);
  const sport = card.sport as Sport;
  /* Eligibility on the CLIENT clock, after mount — the server render is the pregame control, so the markup matches. */
  const [eligibility, setEligibility] = useState<{ ok: boolean; reason: string | null }>(() => saveEligibility(card, card.freshness?.updatedAt ?? "1970-01-01T00:00:00Z"));
  useEffect(() => { setEligibility(saveEligibility(card, new Date().toISOString())); }, [card]);
  const minHeight = compact ? 36 : 44;
  const style = { minHeight, padding: compact ? "0 8px" : "0 14px", fontSize: compact ? 9.5 : 11 } as const;

  if (!eligibility.ok && eligibility.reason === "NO_CALL") return null;
  if (!eligibility.ok && !saved) {
    return (
      <span className="gtp-save-btn inline-flex items-center gap-1 rounded-full font-mono uppercase tracking-[0.08em]" aria-label="This event has started, so its forecast can no longer be saved" style={{ ...style, border: "1px dashed var(--vault-rule)", color: "var(--vault-text-faint)" }}>
        Started · not saveable
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (saved) { unsave(card.id); track({ event: "forecast_unsaved", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "app", sport, placement }, sink); }
        else { save(card); track({ event: "forecast_saved", schemaVersion: SCHEMA_VERSION, dayBucket: currentEtDate(), surface: "app", sport, placement }, sink); }
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${card.away.name} and ${card.home.name} from your saved forecasts` : `Save the ${card.away.name} and ${card.home.name} forecast`}
      className="gtp-save-btn inline-flex items-center gap-1 rounded-full font-mono uppercase tracking-[0.08em]"
      style={{ ...style, border: `1px solid ${saved ? "var(--vault-gold)" : "var(--vault-rule)"}`, color: saved ? "var(--vault-gold)" : "var(--vault-text-mute)", background: "transparent", cursor: "pointer" }}
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      <span>{saved ? "Saved" : compact ? "Save" : "Save this forecast"}</span>
    </button>
  );
}
