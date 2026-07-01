/**
 * WorldCupCuratedPicks — model-ranked picks grouped by GAME (top team picks + top player picks),
 * the curated replacement for the raw prop list. Every player/team shows a portrait/flag. Public
 * data only; nothing fabricated. The raw inventory, if shown at all, is secondary.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/ui/player-avatar";
import { gameSlug } from "@/lib/game-detail";
import type { CuratedGame, CuratedPick } from "@/lib/curated-picks";

function odds(o: number): string {
  return o > 0 ? `+${o}` : `${o}`;
}

function DqBadge({ q }: { q?: string }) {
  if (!q) return null;
  const limited = q.toLowerCase() === "limited";
  return (
    <span className="rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.08em]"
      style={{ fontSize: 8, color: limited ? "var(--vault-text-faint)" : "var(--vault-success)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
      {limited ? "limited data" : `data ${q}`}
    </span>
  );
}

function TeamPickRow({ p }: { p: CuratedPick }) {
  return (
    <details className="group rounded-[9px]" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 list-none">
        <span className="flex items-center gap-2 min-w-0">
          {p.teamCode ? <FlagBadge code={p.teamCode} size="sm" /> : null}
          <span className="flex flex-col min-w-0">
            <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.selection}</span>
            <span className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{p.marketLabel}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {p.eligibility.bankBuilder ? <span className="rounded-full px-1.5 py-0.5 font-mono uppercase" style={{ fontSize: 8, color: "var(--vault-success)", background: "rgba(110,231,168,0.12)" }}>bank eligible</span> : null}
          <span className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12 }}>{odds(p.odds)}</span>
        </span>
      </summary>
      <div className="px-3 pb-2.5 flex flex-col gap-1">
        <div className="flex items-center gap-3 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
          <span>model {Math.round((p.modelProbability ?? 0) * 100)}%</span>
          <span>market {Math.round((p.marketProbability ?? 0) * 100)}%</span>
          {p.recentHitRate ? <span>form {p.recentHitRate.label}</span> : null}
          <DqBadge q={p.dataQuality} />
        </div>
        <ul className="space-y-0.5 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {p.why.map((w, i) => <li key={i}>• {w}</li>)}
        </ul>
      </div>
    </details>
  );
}

function PlayerPickRow({ p }: { p: CuratedPick }) {
  return (
    <details className="group rounded-[9px]" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 list-none">
        <span className="flex items-center gap-2 min-w-0">
          <PlayerAvatar name={p.entityName} photo={p.entityImage} size={28} />
          <span className="flex flex-col min-w-0">
            <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.entityName}</span>
            <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{p.teamName} · {p.selection}</span>
          </span>
        </span>
        <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 12 }}>{odds(p.odds)}</span>
      </summary>
      <div className="px-3 pb-2.5 flex flex-col gap-1">
        <div className="flex items-center gap-3 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
          <span>model {Math.round((p.modelProbability ?? 0) * 100)}%</span>
          <span>market {Math.round((p.marketProbability ?? 0) * 100)}%</span>
          <DqBadge q={p.dataQuality} />
        </div>
        <ul className="space-y-0.5 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {p.why.map((w, i) => <li key={i}>• {w}</li>)}
        </ul>
      </div>
    </details>
  );
}

function GameCard({ g, slateDate }: { g: CuratedGame; slateDate: string }) {
  return (
    <section className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          {g.homeCode ? <FlagBadge code={g.homeCode} size="sm" /> : null}
          <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>v</span>
          {g.awayCode ? <FlagBadge code={g.awayCode} size="sm" /> : null}
          <span className="truncate font-display font-bold tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15 }}>{g.homeTeam} v {g.awayTeam}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {g.status === "started" ? (
            <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)" }}>started · for reference</span>
          ) : (
            <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-success)", background: "rgba(110,231,168,0.12)" }}>upcoming</span>
          )}
          {g.group ? <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{g.group}</span> : null}
        </span>
      </div>

      <div className="mt-3">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Top team picks</span>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {g.topTeamPicks.map((p) => <TeamPickRow key={p.id} p={p} />)}
        </div>
      </div>

      <div className="mt-3">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>Top player picks</span>
        {g.topPlayerPicks.length > 0 ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {g.topPlayerPicks.map((p) => <PlayerPickRow key={p.id} p={p} />)}
          </div>
        ) : (
          <p className="mt-1.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{g.playerPickNote ?? "Limited qualified player picks."}</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {/* Slug on the SLATE date the detail page is generated under (gameDetailParams uses the projections
            head date), NOT the kickoff date — a combined-window kickoff can roll into the next day and 404. */}
        <Link href={`/games/world-cup/${gameSlug(g.homeTeam, g.awayTeam, slateDate)}`}
          className="vault-press inline-flex rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]"
          style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 9.5, fontWeight: 700, textDecoration: "none" }}>
          View full game →
        </Link>
        <Link href={`/build?sport=world_cup&game=${encodeURIComponent(g.gameId)}`}
          className="vault-press inline-flex rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]"
          style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 9.5, fontWeight: 700, textDecoration: "none" }}>
          Add to Build
        </Link>
      </div>
    </section>
  );
}

export default function WorldCupCuratedPicks({ games, slateDate }: { games: CuratedGame[]; slateDate: string }) {
  if (!games.length) {
    return (
      <div className="rounded-[10px] px-5 py-6 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
        <span aria-hidden style={{ fontSize: 26 }}>⚽</span>
        <p className="mt-2" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No curated World Cup picks yet</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>Curated picks appear once today&apos;s odds + projections are live.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {games.map((g) => <GameCard key={g.gameId} g={g} slateDate={slateDate} />)}
    </div>
  );
}
