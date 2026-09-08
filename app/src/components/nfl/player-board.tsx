"use client";
/**
 * NFL PLAYER BOARD (P245 · Release E) — the filterable per-game player projection board.
 *
 * Renders the PUBLIC player-board artifact: only promotion-eligible families carry numbers
 * (rushing yards + calibrated anytime TD today); every withheld family is listed with the exact
 * bar it failed, so absence reads as a decision, not a gap. Filters are client-side presentation
 * over the precomputed artifact — nothing here computes, fetches or invents a number.
 */
import { useMemo, useState } from "react";

export interface PlayerBoardRow {
  playerId: string;
  name: string;
  team: string;
  participation: string;
  volumeNote?: string;
  markets: Record<string, { mean?: number; p10?: number; median?: number; p90?: number; probability?: number; participation?: string }>;
}

export interface PlayerBoardArtifact {
  matchup: string;
  participationBasis: string;
  families: Record<string, { label: string; state: string; basis?: string; reason?: string }>;
  players: PlayerBoardRow[];
  disclaimer: string;
}

const PARTICIPATION_LABEL: Record<string, string> = {
  AVAILABLE_ROLE_UNCERTAIN: "role uncertain",
  ACTIVE_PROJECTED: "projected active",
  QUESTIONABLE: "questionable",
  INACTIVE: "listed out",
};

export default function NflPlayerBoard({ board, teams }: { board: PlayerBoardArtifact; teams: [string, string] }) {
  const publishedFamilies = Object.entries(board.families).filter(([, f]) => f.state === "PUBLISHED");
  const withheld = Object.entries(board.families).filter(([, f]) => f.state !== "PUBLISHED");
  const [team, setTeam] = useState<string | null>(null);
  const [family, setFamily] = useState<string>(publishedFamilies[0]?.[0] ?? "");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      board.players
        .filter((p) => (team ? p.team === team : true))
        .filter((p) => (family ? p.markets[family] != null : true))
        .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : true)),
    [board.players, team, family, q],
  );

  if (publishedFamilies.length === 0) return null;
  const fam = board.families[family];
  const isProb = family === "anytime_td";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Player board filters">
        {publishedFamilies.map(([key, f]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFamily(key)}
            aria-pressed={family === key}
            className="vault-press font-mono uppercase tracking-[0.1em]"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 10.5, border: `1px solid ${family === key ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: family === key ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: family === key ? "var(--vault-gold-dim)" : "transparent" }}
          >
            {f.label}
          </button>
        ))}
        <span aria-hidden style={{ width: 1, height: 22, background: "var(--vault-rule)" }} />
        {[null, ...teams].map((t) => (
          <button
            key={t ?? "both"}
            type="button"
            onClick={() => setTeam(t)}
            aria-pressed={team === t}
            className="vault-press font-mono"
            style={{ minHeight: 40, padding: "0 12px", borderRadius: 999, fontSize: 11, border: `1px solid ${team === t ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: team === t ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: "transparent" }}
          >
            {t ?? "Both teams"}
          </button>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Player name"
          aria-label="Filter players by name"
          className="font-mono"
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 12, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text)" }}
        />
      </div>

      {fam?.basis ? (
        <p className="mt-2" style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>{fam.basis}</p>
      ) : null}

      <div className="mt-3" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              {(isProb
                ? ["Player", "Team", "Availability", "TD chance"]
                : ["Player", "Team", "Availability", "Low (10th)", "Median", "High (90th)"]
              ).map((h) => (
                <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const m = p.markets[family]!;
              return (
                <tr key={`${p.playerId}-${family}`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <td style={{ padding: "8px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</td>
                  <td className="font-mono" style={{ padding: "8px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{p.team}</td>
                  <td className="font-mono" style={{ padding: "8px 9px", fontSize: 10.5, color: p.participation === "INACTIVE" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>
                    {PARTICIPATION_LABEL[p.participation] ?? p.participation.toLowerCase()}
                  </td>
                  {isProb ? (
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 13, fontWeight: 700, color: "var(--gtp-bank-cta)" }}>
                      {m.probability != null ? `${(m.probability * 100).toFixed(1)}%` : "—"}
                    </td>
                  ) : (
                    <>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12, color: "var(--vault-text-faint)" }}>{m.p10}</td>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{m.median}</td>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12, color: "var(--vault-text-faint)" }}>{m.p90}</td>
                    </>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "12px 9px", fontSize: 12.5, color: "var(--vault-text-mute)" }}>No modelled player matches this filter — a player without a supported projection is absent by decision, never padded in.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {withheld.length ? (
        <details className="mt-3" style={{ border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>
            Families not shown, and the exact bar each failed ({withheld.length})
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {withheld.map(([key, f]) => (
              <li key={key} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                <strong style={{ color: "var(--vault-text-mute)" }}>{f.label}:</strong> {f.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>
        {board.participationBasis} {board.disclaimer}
      </p>
    </div>
  );
}
