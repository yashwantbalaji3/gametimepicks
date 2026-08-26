"use client";

import { useMemo, useState } from "react";
import TeamLogo from "@/components/team-logo";
import type { BoardProp } from "@/components/mlb/props-board";
import PlayerAvatar from "@/components/ui/player-avatar";

/**
 * GameExplorer — a scannable, collapsible card per MLB game. Shows ONLY real data: team logos (resolved
 * from the props' team abbreviations), first-pitch ET, total props on the board, the game's top featured
 * props, and the pitchers carrying props. Weather / park / team records have no data source in the slate
 * artifacts, so they are intentionally omitted (documented as a blocker) — never fabricated.
 */

export interface ExplorerGame {
  gameId: string;
  matchup: string;
  home: string;
  away: string;
  commenceTime: string | null;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;
const ET_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const firstPitch = (iso: string | null) => { if (!iso) return null; try { return `${ET_FMT.format(new Date(iso))} ET`; } catch { return null; } };

interface GameModel {
  game: ExplorerGame;
  homeAbbr: string | null;
  awayAbbr: string | null;
  total: number;
  featured: BoardProp[];
  pitchers: { player: string; photoUrl: string | null; teamAbbr: string | null }[];
}

function buildModel(games: ExplorerGame[], props: BoardProp[]): GameModel[] {
  const byGame = new Map<string, BoardProp[]>();
  for (const p of props) { const g = byGame.get(p.gameId) ?? []; g.push(p); byGame.set(p.gameId, g); }
  return games.map((game) => {
    const gp = byGame.get(game.gameId) ?? [];
    let homeAbbr: string | null = null, awayAbbr: string | null = null;
    for (const p of gp) {
      if (p.homeAway === "home" && p.teamAbbr) homeAbbr = p.teamAbbr;
      if (p.homeAway === "away" && p.teamAbbr) awayAbbr = p.teamAbbr;
      // opponent abbr fills the other side when only one side has props
      if (p.homeAway === "home" && p.opponentAbbr && !awayAbbr) awayAbbr = p.opponentAbbr;
      if (p.homeAway === "away" && p.opponentAbbr && !homeAbbr) homeAbbr = p.opponentAbbr;
    }
    const featured = [...gp].sort((a, b) => impliedPct(b.americanOdds) - impliedPct(a.americanOdds)).slice(0, 3);
    const seenP = new Set<string>();
    const pitchers = gp.filter((p) => p.group === "pitchers").flatMap((p) => {
      if (seenP.has(p.player)) return [];
      seenP.add(p.player);
      return [{ player: p.player, photoUrl: p.photoUrl ?? null, teamAbbr: p.teamAbbr ?? null }];
    });
    return { game, homeAbbr, awayAbbr, total: gp.length, featured, pitchers };
  }).sort((a, b) => (a.game.commenceTime ?? "").localeCompare(b.game.commenceTime ?? ""));
}

function GameCard({ m }: { m: GameModel }) {
  const [open, setOpen] = useState(false);
  const t = firstPitch(m.game.commenceTime);
  return (
    <div className="rounded-[12px] overflow-hidden" style={{ background: "color-mix(in srgb, var(--vault-bg) 50%, transparent)", border: "1px solid var(--vault-rule)" }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${m.game.matchup} details`} className="w-full px-3.5 py-3 flex items-center gap-3 text-left" style={{ cursor: "pointer" }}>
        <span className="flex items-center gap-1.5 shrink-0">
          {m.awayAbbr ? <TeamLogo team={m.awayAbbr} sport="mlb" size="md" /> : null}
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>@</span>
          {m.homeAbbr ? <TeamLogo team={m.homeAbbr} sport="mlb" size="md" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{m.game.matchup}</span>
          <span className="block font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            {t ? `${t} · ` : ""}{m.total} props{m.pitchers.length ? ` · ${m.pitchers.length} pitchers on board` : ""}
          </span>
        </span>
        <span aria-hidden className="shrink-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
          {m.featured.length ? (
            <div className="mt-2">
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Featured props</span>
              <ul className="mt-1 flex flex-col gap-1 list-none">
                {m.featured.map((p, i) => (
                  <li key={`${p.player}:${p.market}:${i}`} className="flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5" style={{ background: "var(--vault-wash-faint)" }}>
                    <span className="relative shrink-0">
                      <PlayerAvatar name={p.player} photo={p.photoUrl} size={20} />
                      {p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>{p.player} <span style={{ color: "var(--vault-text-faint)" }}>· {p.marketLabel}{p.point != null ? ` ${p.point}` : ""}</span></span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      <span className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>{american(p.americanOdds)}</span>
                      <span className="font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>{impliedPct(p.americanOdds)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {m.pitchers.length ? (
            <div>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Pitchers on the board</span>
              {/* Was `pitchers.join(" · ")` — a run-on line of names. Faces make the same list
                  scannable, and the portrait is the thing a reader recognises first. */}
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5 list-none">
                {m.pitchers.map((pi) => (
                  <li key={pi.player} className="flex items-center gap-1.5">
                    <span className="relative shrink-0">
                      <PlayerAvatar name={pi.player} photo={pi.photoUrl} size={20} />
                      {pi.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={pi.teamAbbr} sport="mlb" size="sm" /></span> : null}
                    </span>
                    <span style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pi.player}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[9.5px] font-mono" style={{ color: "var(--vault-text-faint)" }}>Starting pitchers, weather, park & records are not in the slate feed yet — shown only when a real source is wired.</p>
        </div>
      ) : null}
    </div>
  );
}

export default function GameExplorer({ games, props }: { games: ExplorerGame[]; props: BoardProp[] }) {
  const models = useMemo(() => buildModel(games, props), [games, props]);
  if (!models.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {models.map((m) => <GameCard key={m.game.gameId} m={m} />)}
    </div>
  );
}
