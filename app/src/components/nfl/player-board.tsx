"use client";
/**
 * NFL PLAYER BOARD (P245 · Release E; P250 · A15 consolidation) — the filterable per-game player
 * projection board, now including the COMBINED player-centric view as its first tab.
 *
 * Renders the PUBLIC player-board artifact: only promotion-eligible families carry numbers;
 * every withheld family is listed with the exact bar it failed, so absence reads as a decision,
 * not a gap. Filters are client-side presentation over the precomputed artifact — nothing here
 * computes, fetches or invents a number.
 *
 * P250 · A15: the P249 combined receiving table used to be a SEPARATE server-rendered block below
 * this board — the team/player filters above it did not govern it, it silently capped at 14 rows,
 * carried no availability column, and rounded yards while this board printed hundredths. It is now
 * the board's own "Combined" tab: one filter scope, every eligible player reachable, availability
 * on every row, one display-precision policy (yards to the whole yard, receptions to one decimal —
 * matching the weekly boards), and a missing value renders "—", never a fabricated zero.
 */
import { useMemo, useState } from "react";
import { SEARCH_PLAYERS, SEARCH_PLAYERS_LABEL } from "@/lib/ui/search-labels";

export interface PlayerBoardRow {
  playerId: string;
  name: string;
  team: string;
  participation: string;
  volumeNote?: string;
  markets: Record<string, { mean?: number; p10?: number; median?: number; p90?: number; probability?: number; participation?: string }>;
}

/** P250-GD3: a roster-present mover the evaluated stint rule cannot yet place — factual prior-club
 *  per-game usage, explicitly NOT part of this game's simulated team numbers. */
export interface NewArrival {
  playerId: string;
  name: string;
  position: string;
  team: string;
  participation: string;
  lastSeason: { club: string; games: number; targetsPg: number; receptionsPg: number; recYdsPg: number; rushAttPg: number; rushYdsPg: number; passAttPg: number; passYdsPg: number };
  note: string;
}

export interface PlayerBoardArtifact {
  matchup: string;
  participationBasis: string;
  newArrivals?: Record<string, NewArrival[]>;
  families: Record<string, { label: string; state: string; basis?: string; reason?: string; caveat?: string }>;
  players: PlayerBoardRow[];
  disclaimer: string;
}

const PARTICIPATION_LABEL: Record<string, string> = {
  AVAILABLE_ROLE_UNCERTAIN: "role uncertain",
  ACTIVE_PROJECTED: "projected active",
  QUESTIONABLE: "questionable",
  INACTIVE: "listed out",
};

/** One display-precision policy (matches the weekly boards): yards to the whole yard, counts to one
 *  decimal. Absence stays absent — "—", never a zero invented by a fallback. */
const yd = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(Math.round(v)) : "—");
const ct = (v: number | undefined) => (v != null && Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : "—");

const COMBINED = "combined";

export default function NflPlayerBoard({ board, teams }: { board: PlayerBoardArtifact; teams: [string, string] }) {
  /* P250-GD2: two display tiers. PUBLISHED families cleared their bars; ESTIMATE families carry
     real computed numbers WITH the failed bar and a caveat on the tab — the owner's display
     decision, rendered without ever dressing an estimate as a validated forecast. */
  const publishedFamilies = Object.entries(board.families).filter(([, f]) => f.state === "PUBLISHED" || f.state === "ESTIMATE");
  const withheld = Object.entries(board.families).filter(([, f]) => f.state !== "PUBLISHED" && f.state !== "ESTIMATE");
  const hasCombined =
    board.families.player_receptions?.state === "PUBLISHED" &&
    board.families.player_reception_yds?.state === "PUBLISHED";
  const hasTd = board.families.anytime_td?.state === "PUBLISHED";
  const [team, setTeam] = useState<string | null>(null);
  const [family, setFamily] = useState<string>(hasCombined ? COMBINED : publishedFamilies[0]?.[0] ?? "");
  const [q, setQ] = useState("");
  /* P246 (founder §4.1): a player confirmed OUT is excluded from the DEFAULT board — a
     conditional-on-playing number beside active players reads as a projection that he plays.
     The rows stay in the artifact; this toggle is the explicit optional detail that shows them. */
  const [includeOut, setIncludeOut] = useState(false);
  const outCount = useMemo(() => board.players.filter((p) => p.participation === "INACTIVE").length, [board.players]);

  const isCombined = family === COMBINED;
  const rows = useMemo(
    () =>
      board.players
        .filter((p) => (includeOut ? true : p.participation !== "INACTIVE"))
        .filter((p) => (team ? p.team === team : true))
        .filter((p) =>
          isCombined
            ? p.markets.player_receptions != null || p.markets.player_reception_yds != null
            : family
              ? p.markets[family] != null
              : true,
        )
        .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : true))
        /* The combined view ranks by expected receptions — ALL eligible players, never a silent cap. */
        .sort((a, b) =>
          isCombined
            ? (b.markets.player_receptions?.median ?? -1) - (a.markets.player_receptions?.median ?? -1)
            : 0,
        ),
    [board.players, team, family, q, includeOut, isCombined],
  );

  if (publishedFamilies.length === 0) return null;
  const fam = board.families[family];
  const isProb = family === "anytime_td";

  const tabs: Array<[string, string]> = [
    ...(hasCombined ? [[COMBINED, "Combined · one row per player"] as [string, string]] : []),
    ...publishedFamilies.map(([key, f]) => [key, f.label] as [string, string]),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Player board filters">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFamily(key)}
            aria-pressed={family === key}
            className="vault-press font-mono uppercase tracking-[0.1em]"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 10.5, border: `1px solid ${family === key ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: family === key ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: family === key ? "var(--vault-gold-dim)" : "transparent" }}
          >
            {label}
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
        {outCount > 0 ? (
          <label className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, fontSize: 11, color: "var(--vault-text-mute)", cursor: "pointer" }}>
            <input type="checkbox" checked={includeOut} onChange={(e) => setIncludeOut(e.target.checked)} aria-label={`Show listed-out players (${outCount}) — conditional on playing`} />
            Show listed-out players ({outCount}) — conditional on playing
          </label>
        ) : null}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={SEARCH_PLAYERS}
          aria-label={SEARCH_PLAYERS_LABEL}
          className="font-mono"
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 12, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text)" }}
        />
      </div>

      {isCombined ? (
        <p className="mt-2" style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>
          Every receiving family for one player on one row, ranked by expected receptions.
        </p>
      ) : null}

      <div className="mt-3" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isCombined ? 640 : 560 }}>
          <thead>
            <tr>
              {(isCombined
                ? ["Player", "Team", "Availability", "Receptions (10th–90th)", "Rec yards (10th–90th)", ...(hasTd ? ["TD chance"] : [])]
                : isProb
                  ? ["Player", "Team", "Availability", "TD chance"]
                  : ["Player", "Team", "Availability", "Low (10th)", "Median", "High (90th)"]
              ).map((h) => (
                <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const avail = (
                <td className="font-mono" style={{ padding: "8px 9px", fontSize: 10.5, color: p.participation === "INACTIVE" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>
                  {PARTICIPATION_LABEL[p.participation] ?? p.participation.toLowerCase()}
                </td>
              );
              if (isCombined) {
                const rec = p.markets.player_receptions;
                const ry = p.markets.player_reception_yds;
                const at = p.markets.anytime_td;
                return (
                  <tr key={`${p.playerId}-combined`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td style={{ padding: "8px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</td>
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{p.team}</td>
                    {avail}
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5 }}>
                      {rec?.median != null ? <>{ct(rec.median)} <span style={{ color: "var(--vault-text-faint)" }}>({ct(rec.p10)}–{ct(rec.p90)})</span></> : "—"}
                    </td>
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5 }}>
                      {ry?.median != null ? <>{yd(ry.median)} <span style={{ color: "var(--vault-text-faint)" }}>({yd(ry.p10)}–{yd(ry.p90)})</span></> : "—"}
                    </td>
                    {hasTd ? (
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5, fontWeight: 700, color: "var(--gtp-bank-cta)" }}>
                        {at?.probability != null ? `${(at.probability * 100).toFixed(1)}%` : "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              }
              const m = p.markets[family]!;
              return (
                <tr key={`${p.playerId}-${family}`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <td style={{ padding: "8px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>{p.name}</td>
                  <td className="font-mono" style={{ padding: "8px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{p.team}</td>
                  {avail}
                  {isProb ? (
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 13, fontWeight: 700, color: "var(--gtp-bank-cta)" }}>
                      {m.probability != null ? `${(m.probability * 100).toFixed(1)}%` : "—"}
                    </td>
                  ) : (
                    /* One precision policy with the combined view and the weekly boards: counts to
                       one decimal, yards to the whole yard — hundredths beside integers read as
                       false precision (P250 · A15). */
                    <>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12, color: "var(--vault-text-faint)" }}>{family === "player_receptions" ? ct(m.p10) : yd(m.p10)}</td>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{family === "player_receptions" ? ct(m.median) : yd(m.median)}</td>
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12, color: "var(--vault-text-faint)" }}>{family === "player_receptions" ? ct(m.p90) : yd(m.p90)}</td>
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

      {/* P250-GD3 — NEW ARRIVALS. A player who changed clubs after his last corpus game is absent
          from BOTH share pools: gone from the old club's list, and started at zero evidence on the
          new one by the evaluated stint rule. The rule is right about what is unknown (his role
          here) — but silently omitting a star the reader came for is a product defect. His own
          prior-club per-game usage is stated as fact, with the frame that it is NOT in the
          simulated numbers above. */}
      {(() => {
        const arrivals = Object.entries(board.newArrivals ?? {})
          .filter(([t]) => (team ? t === team : true))
          .flatMap(([, list]) => list)
          .filter((a) => (q ? a.name.toLowerCase().includes(q.toLowerCase()) : true));
        if (!arrivals.length) return null;
        return (
          <div className="mt-4 rounded-[10px]" style={{ border: "1px solid var(--vault-rule)", padding: "10px 12px" }}>
            <p className="font-mono uppercase tracking-[0.08em]" style={{ margin: 0, fontSize: 9.5, color: "var(--vault-gold)" }}>
              New arrivals · not in the simulated numbers above
            </p>
            <p style={{ margin: "4px 0 8px", fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>
              Per game at their previous team — history, not a projection.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    {["Player", "Team", "Availability", "Last club", "Per game (prior club)"].map((h) => (
                      <th key={h} scope="col" style={{ textAlign: "left", padding: "5px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map((a) => (
                    <tr key={a.playerId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                      <td style={{ padding: "7px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>{a.name} <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{a.position}</span></td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{a.team}</td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
                        {PARTICIPATION_LABEL[a.participation] ?? a.participation.toLowerCase().replaceAll("_", " ")}
                      </td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{a.lastSeason.club} · {a.lastSeason.games}g</td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 12 }}>
                        {a.lastSeason.targetsPg > 0 ? `${a.lastSeason.receptionsPg} rec · ${a.lastSeason.recYdsPg} yds` : null}
                        {a.lastSeason.rushAttPg >= 1 ? `${a.lastSeason.targetsPg > 0 ? " · " : ""}${a.lastSeason.rushYdsPg} rush yds` : null}
                        {a.lastSeason.passAttPg >= 1 ? `${a.lastSeason.targetsPg > 0 || a.lastSeason.rushAttPg >= 1 ? " · " : ""}${a.lastSeason.passYdsPg} pass yds` : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {withheld.length ? (
        <details className="mt-3" style={{ border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>
            Families not shown, and the exact bar each failed ({withheld.length})
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {withheld.map(([key, f]) => (
              <li key={key} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                {/* A raw family key is not a reader-facing label (player_pass_int shipped without one). */}
                <strong style={{ color: "var(--vault-text-mute)" }}>{f.label && f.label !== key ? f.label : key.replace(/^player_/, "").replace(/_/g, " ").replace(/\bint\b/, "interceptions")}:</strong> {f.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}


    </div>
  );
}
