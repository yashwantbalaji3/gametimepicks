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
import type { FeaturedForecast } from "@/lib/live/nfl-hub-data";

const MONO = "var(--font-mono)";

export interface ForecastTracking {
  rail: string;
  liveValue: number | null;
  finalStat: number | null;
  ageMs: number | null;
  stale: boolean;
  status: string;
  landmarks: { line: number | null; gtp: number | null; live: number | null; liveOverflow: boolean } | null;
}

const S = {
  row: { listStyle: "none", padding: "10px 0", borderTop: "1px solid var(--vault-border)" } as const,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, minWidth: 0 } as const,
  name: { display: "block", fontSize: 13, color: "var(--vault-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
  sub: { display: "block", fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
  nums: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 } as const,
  numLabel: { display: "block", fontFamily: MONO, fontSize: 8.5, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.1em" } as const,
  numValue: { display: "block", fontFamily: MONO, fontSize: 15, fontVariantNumeric: "tabular-nums", color: "var(--vault-text)" } as const,
  numLive: { display: "block", fontFamily: MONO, fontSize: 15, fontVariantNumeric: "tabular-nums", color: "var(--vault-info)" } as const,
  numDash: { display: "block", fontFamily: MONO, fontSize: 15, color: "var(--vault-text-faint)" } as const,
  railWrap: { position: "relative", height: 16, margin: "10px 2px 2px" } as const,
  track: { position: "absolute", left: 0, right: 0, top: 6, height: 4, borderRadius: 2, background: "var(--vault-border)" } as const,
  fillBase: { position: "absolute", left: 0, top: 6, height: 4, borderRadius: 2, background: "var(--vault-info)" } as const,
  lineTick: { position: "absolute", top: 1, width: 2, height: 14, marginLeft: -1, background: "var(--vault-text-mute)" } as const,
  gtpMark: { position: "absolute", top: 4, width: 8, height: 8, marginLeft: -4, transform: "rotate(45deg)", border: "2px solid var(--vault-accent)", background: "var(--vault-panel)" } as const,
  liveDot: { position: "absolute", top: 3, width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: "var(--vault-info)", boxShadow: "0 0 0 2px var(--vault-panel)" } as const,
  legend: { display: "flex", flexWrap: "wrap", gap: "2px 12px", fontFamily: MONO, fontSize: 8.5, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "4px 0 0" } as const,
  status: { fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-mute)", margin: "6px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" } as const,
  statusLive: { fontFamily: MONO, fontSize: 9.5, color: "var(--vault-info)", margin: "6px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" } as const,
  statusWarn: { fontFamily: MONO, fontSize: 9.5, color: "var(--vault-warn)", margin: "6px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" } as const,
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

function Num({ label, value, live = false, hint }: { label: string; value: string | null; live?: boolean; hint?: string }) {
  return (
    <span style={{ minWidth: 0 }}>
      <span style={S.numLabel}>{label}</span>
      {value === null
        ? <span style={S.numDash} title={hint}>—</span>
        : <span style={live ? S.numLive : S.numValue}>{value}</span>}
    </span>
  );
}

export default function FeaturedForecastRow({ f, t, final }: { f: FeaturedForecast; t: ForecastTracking; final: boolean }) {
  const binary = f.kind === "PROBABILITY";
  const measured = final ? t.finalStat : t.liveValue;
  const statusStyle = t.stale || t.status.startsWith("Live tracking") ? S.statusWarn : measured !== null && !final ? S.statusLive : S.status;
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
            <Num label="GTP pregame" value={f.modelProbability !== null ? `${(f.modelProbability * 100).toFixed(1)}%` : null} hint="No pregame probability was frozen for this row" />
            <span style={{ minWidth: 0, gridColumn: "span 2" }}>
              <span style={S.numLabel}>{final ? "Final status" : "Live status"}</span>
              <span style={measured !== null && measured >= 1 ? S.numLive : S.numValue}>
                {final ? (measured !== null && measured >= 1 ? "Touchdown scored" : "No TD recorded") : t.status.replace(/^Last known · /, "")}
              </span>
            </span>
          </div>
        ) : (
          <>
            <div style={S.nums}>
              <Num label="GTP" value={fmtModel(f.modelValue)} />
              <Num label="Line" value={fmt(f.line, 1)} />
              <Num label={final ? "Final" : "Live"} value={fmtModel(measured)} live={!final} />
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
                  <span>● {final ? "Final" : "Live"}{t.landmarks.liveOverflow ? " ▸" : ""}</span>
                  {t.landmarks.line !== null ? <span>│ Line</span> : null}
                  <span>◆ GTP</span>
                </p>
              </>
            ) : null}
          </>
        )}

        <p style={statusStyle}>{t.status}{age ? ` · ${age}` : ""}</p>
      </div>
    </li>
  );
}
