"use client";
/**
 * ONE FEATURED GAMETIMEPICKS FORECAST — portrait, player, market, then GTP · LINE · LIVE and either a
 * progress rail (volume families) or a touchdown primitive (anytime TD).
 *
 * This file decides NOTHING. Every state and every word comes from `trackForecast` in
 * `featured-forecasts.mjs`, which feeds the canonical rail machine (`railStateOf`) and cannot produce
 * a HIT or a MISS. The component only lays those facts out.
 *
 *   LIVE  moves  — a factual measurement, or a dash when none exists (missing is never 0)
 *   LINE  fixed  — the frozen sportsbook threshold
 *   GTP   fixed  — the frozen model forecast (median)
 *
 * The rail's scale is built from frozen numbers only, so LINE and GTP never move as the game goes on.
 * Touchdowns never sit on a yardage rail: a TD is binary.
 *
 * ⚠ STYLES ARE HOISTED. A per-row style object once took a page of this product to 1,160KB; only the
 *   three rail offsets, which genuinely vary per row, are computed inline.
 */
import PlayerAvatar from "@/components/player-avatar";
import type { FeaturedForecast, LiveModelStatus } from "@/lib/live/nfl-hub-data";
import ForecastDetail from "./forecast-detail";
import { TD_FINAL_WORDS } from "@/lib/live/featured-forecasts.mjs";

export interface ForecastTracking {
  rail: string;
  liveValue: number | null;
  finalStat: number | null;
  ageMs: number | null;
  stale: boolean;
  status: string;
  /** Session 6 · anytime-TD final state (null unless the row is binary and the game is over). */
  tdFinal?: "SCORED" | "NONE_AT_FINAL" | "NONE_AT_LAST_READ" | "NOT_MEASURED" | null;
  /** The settlement owner's canonical answer, verbatim — present only when the row is CANONICAL. */
  settlement?: { state: string; forecastResult: string | null; lineResult: string | null; finalStat: number | null } | null;
  landmarks: { line: number | null; gtp: number | null; live: number | null; liveOverflow: boolean } | null;
}

/*
 * V2C · IDENTITY FIRST, NUMBERS SECOND, RAIL THIRD, STATUS FOURTH. Sans labels at a readable size
 * instead of tiny monospace; tabular figures keep the three numbers aligned; the model's number wears
 * the product's green, the live number the info blue, the line stays neutral.
 */
const SANS = "var(--font-display)";
const label = { display: "block", fontFamily: SANS, fontSize: 10.5, fontWeight: 500, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" } as const;
const figure = { display: "block", fontFamily: SANS, fontSize: 20, fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as const;
const statusBase = { fontFamily: SANS, fontSize: 11, fontWeight: 600, margin: "8px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" } as const;
const S = {
  row: { listStyle: "none", padding: "14px 0 12px", borderTop: "1px solid var(--vault-border)" } as const,
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, minWidth: 0 } as const,
  name: { display: "block", fontFamily: SANS, fontSize: 14.5, fontWeight: 600, color: "var(--vault-text)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
  sub: { display: "block", fontFamily: SANS, fontSize: 11, fontWeight: 500, color: "var(--vault-text-mute)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
  nums: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 } as const,
  numLabel: label,
  numValue: { ...figure, color: "var(--vault-text)" } as const,
  numGtp: { ...figure, color: "var(--vault-accent)" } as const,
  numLive: { ...figure, color: "var(--vault-info)" } as const,
  /* A TD status is words, not a number: smaller, and allowed to wrap without shouting. */
  tdText: { display: "block", fontFamily: SANS, fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: "var(--vault-text)", textTransform: "uppercase", letterSpacing: "0.04em" } as const,
  tdTextLive: { display: "block", fontFamily: SANS, fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: "var(--vault-info)", textTransform: "uppercase", letterSpacing: "0.04em" } as const,
  numDash: { ...figure, color: "var(--vault-text-faint)" } as const,
  railWrap: { position: "relative", height: 20, margin: "12px 3px 0" } as const,
  track: { position: "absolute", left: 0, right: 0, top: 7, height: 6, borderRadius: 3, background: "var(--vault-border)" } as const,
  fillBase: { position: "absolute", left: 0, top: 7, height: 6, borderRadius: 3, background: "var(--vault-info)" } as const,
  lineTick: { position: "absolute", top: 1, width: 2, height: 18, marginLeft: -1, borderRadius: 1, background: "var(--vault-text-mute)" } as const,
  gtpMark: { position: "absolute", top: 5, width: 10, height: 10, marginLeft: -5, transform: "rotate(45deg)", border: "2px solid var(--vault-accent)", background: "var(--vault-panel)" } as const,
  liveDot: { position: "absolute", top: 4, width: 12, height: 12, marginLeft: -6, borderRadius: "50%", background: "var(--vault-info)", boxShadow: "0 0 0 3px var(--vault-panel)" } as const,
  legend: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 14px", fontFamily: SANS, fontSize: 10, fontWeight: 500, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "6px 0 0" } as const,
  legendZero: { marginRight: "auto", fontVariantNumeric: "tabular-nums" } as const,
  status: { ...statusBase, color: "var(--vault-text-mute)" } as const,
  statusLive: { ...statusBase, color: "var(--vault-info)" } as const,
  statusWin: { ...statusBase, color: "var(--vault-success)" } as const,
  statusLoss: { ...statusBase, color: "var(--vault-loss-red)" } as const,
  statusWarn: { ...statusBase, color: "var(--vault-warn)" } as const,
};

const fmt = (n: number | null, dp: number) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(dp) : null);
/** Yards to one decimal where the model states one; counts as whole numbers when they are whole. */
const fmtModel = (n: number | null) => (n === null ? null : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function ageText(ageMs: number | null): string | null {
  if (ageMs === null) return null;
  const s = Math.round(ageMs / 1000);
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Updated ${m}m ago`;
  return `Updated ${Math.round(m / 60)}h ago`;
}

function Num({ label: text, value, tone = "plain", hint }: { label: string; value: string | null; tone?: "plain" | "gtp" | "live"; hint?: string }) {
  return (
    <span style={{ minWidth: 0 }}>
      <span style={S.numLabel}>{text}</span>
      {value === null
        ? <span style={S.numDash} title={hint}>—</span>
        : <span style={tone === "gtp" ? S.numGtp : tone === "live" ? S.numLive : S.numValue}>{value}</span>}
    </span>
  );
}

export default function FeaturedForecastRow({ f, t, final, modelStatus = null, liveSource = null, lastObservedAt = null }: {
  f: FeaturedForecast; t: ForecastTracking; final: boolean;
  /** Model detail beneath the row (a closed disclosure) — never the row's values or status. */
  modelStatus?: LiveModelStatus | null; liveSource?: string | null; lastObservedAt?: string | null;
}) {
  const binary = f.kind === "PROBABILITY";
  const measured = final ? t.finalStat : t.liveValue;
  /* Colour follows the OWNER's canonical forecast result only; the words carry it too. */
  const fr = t.settlement?.forecastResult ?? null;
  const statusStyle = fr === "WIN" ? S.statusWin : fr === "LOSS" ? S.statusLoss
    : t.stale || t.status.startsWith("Live tracking") ? S.statusWarn : measured !== null && !final ? S.statusLive : S.status;
  const age = t.stale ? ageText(t.ageMs) : null;

  /* One sentence carries the whole row for assistive technology; the rail itself is decorative. */
  const spoken = binary
    ? `${f.playerName}, ${f.team ?? ""}, ${f.label ?? "anytime touchdown"}. ` +
      (f.modelProbability !== null ? `GameTimePicks pregame probability ${(f.modelProbability * 100).toFixed(1)} percent. ` : "No pregame probability was frozen for this row. ") +
      `${t.status}.`
    : `${f.playerName}, ${f.team ?? ""}, ${f.label ?? f.family}. GameTimePicks forecast ${fmtModel(f.modelValue) ?? "not available"}` +
      (f.line !== null ? `, line ${fmt(f.line, 1)}` : ", no line") +
      (measured !== null ? `, ${final ? "final" : "live"} ${fmtModel(measured)}` : "") + `. ${t.status}${age ? `, ${age}` : ""}.`;

  return (
    <li style={S.row}>
      <span className="sr-only">{spoken}</span>
      <div aria-hidden="true">
        <div style={S.head}>
          {/* Canonical ESPN id only. A null portrait renders initials + team chip — never a guessed face. */}
          <span className="gtp-live-portrait" style={{ flexShrink: 0 }}>
            <PlayerAvatar photoUrl={f.portraitUrl} playerName={f.playerName} team={f.team} sport="nfl" size="sm" flat />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={S.name}>{f.playerName}</span>
            <span style={S.sub}>{f.team ? `${f.team} · ` : ""}{f.label ?? f.family}</span>
          </span>
        </div>

        {binary ? (
          /* ── TOUCHDOWN: binary, so no rail. A pregame number appears only if one was frozen. ── */
          <div style={S.nums}>
            <Num label="GTP pregame" tone="gtp" value={f.modelProbability !== null ? `${(f.modelProbability * 100).toFixed(1)}%` : null} hint="No pregame probability was frozen for this row" />
            <span style={{ minWidth: 0, gridColumn: "span 2" }}>
              <span style={S.numLabel}>{final ? "Final status" : "Live status"}</span>
              <span style={!final && measured !== null && measured >= 1 ? S.tdTextLive : S.tdText}>
                {final ? TD_FINAL_WORDS[t.tdFinal ?? "NOT_MEASURED"] : t.status}
              </span>
            </span>
          </div>
        ) : (
          <>
            <div style={S.nums}>
              <Num label="GTP" tone="gtp" value={fmtModel(f.modelValue)} />
              <Num label="Line" value={fmt(f.line, 1)} />
              <Num label={final ? "Final" : "Live"} value={fmtModel(measured)} tone={final ? "plain" : "live"} />
            </div>
            {t.landmarks ? (
              <>
                <div style={S.railWrap}>
                  <div style={S.track} />
                  {t.landmarks.live !== null ? <div style={{ ...S.fillBase, width: `${t.landmarks.live}%` }} /> : null}
                  {t.landmarks.line !== null ? <div style={{ ...S.lineTick, left: `${t.landmarks.line}%` }} /> : null}
                  {t.landmarks.gtp !== null ? <div style={{ ...S.gtpMark, left: `${t.landmarks.gtp}%` }} /> : null}
                  {t.landmarks.live !== null ? <div style={{ ...S.liveDot, left: `${t.landmarks.live}%` }} /> : null}
                </div>
                <p style={S.legend}>
                  <span style={S.legendZero}>0</span>
                  {t.landmarks.live !== null ? <span>● {final ? "Final" : "Live"}{t.landmarks.liveOverflow ? " ▸" : ""}</span> : null}
                  {t.landmarks.line !== null ? <span>│ Line</span> : null}
                  <span>◆ GTP</span>
                </p>
              </>
            ) : null}
          </>
        )}

        {/* A TD's status already sits in its own box; only its age (when stale) or grading note is added. */}
        {binary
          ? (age || final ? <p style={statusStyle}>{final ? (t.settlement ? t.status : "Grading pending") : age}</p> : null)
          : <p style={statusStyle}>{t.status}{age ? ` · ${age}` : ""}</p>}
      </div>
      {/* Model detail beneath the row: a closed disclosure, for every reader. Not aria-hidden — it is
          real, readable content. */}
      <ForecastDetail f={f} modelStatus={modelStatus} liveSource={liveSource} lastObservedAt={lastObservedAt} />
    </li>
  );
}
