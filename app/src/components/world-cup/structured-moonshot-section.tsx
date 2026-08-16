/**
 * StructuredMoonshotSection — renders the structured Moonshot GROUPED BY GAME: each tier (Structured /
 * Aggressive) is a set of game cards, each showing the game's score lean and its result + total(/BTTS)
 * legs. Pure presentation of a StructuredMoonshot (built upstream from real team markets). No player props,
 * nothing fabricated; a leg that runs against the score lean is badged "high variance", never hidden.
 */
import FlagBadge from "@/components/flag-badge";
import OddsPill from "@/components/tickets/odds-pill";
import type { StructuredMoonshot, MoonshotTicket, MoonshotGamePair } from "@/lib/world-cup/structured-moonshot";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CONF: Record<string, string> = { High: "var(--vault-success)", Solid: "var(--vault-gold-bright)", Lean: "#e7b15a", Speculative: "var(--gtp-bank-heat)" };
const VOL: Record<string, string> = { Low: "var(--vault-success)", Medium: "var(--vault-gold-bright)", High: "#e7b15a", Extreme: "var(--gtp-bank-heat)" };

function Badge({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`, background: "rgba(255,255,255,0.03)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>{label}</span>
      <span className="font-semibold" style={{ color: tone, fontSize: 10.5 }}>{value}</span>
    </span>
  );
}

function GameGroup({ pair, index }: { pair: MoonshotGamePair; index: number }) {
  const letter = String.fromCharCode(65 + index); // A, B, C…
  return (
    <div className="rounded-[9px] px-3 py-2.5 flex flex-col gap-2" style={{ background: "rgba(7, 11, 9,0.45)", border: "1px solid var(--vault-rule)" }}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "#a99bf5", fontSize: 8.5 }}>Game {letter}</span>
          {pair.homeCode ? <FlagBadge code={pair.homeCode} size="sm" /> : null}
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{pair.homeTeam}</span>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>v</span>
          {pair.awayCode ? <FlagBadge code={pair.awayCode} size="sm" /> : null}
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{pair.awayTeam}</span>
        </span>
        {pair.scoreLean ? <span className="shrink-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>lean {pair.scoreLean}</span> : null}
      </div>
      <div className="flex flex-col gap-1">
        {pair.legs.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono uppercase tracking-[0.06em] rounded px-1 py-0.5" style={{ color: l.kind === "result" ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: "rgba(255,255,255,0.03)", fontSize: 7.5 }}>{l.kind === "result" ? "Result" : l.kind === "total" ? "Total" : "BTTS"}</span>
              <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{l.selection}</span>
              {!l.aligned ? <span title="Runs against the model score lean" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>⚠ high variance</span> : null}
            </span>
            <OddsPill odds={l.americanOdds} size="sm" tone="violet" />
          </div>
        ))}
      </div>
      {pair.alignmentNote ? <span className="text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{pair.alignmentNote}</span> : null}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: MoonshotTicket }) {
  if (!ticket.available) {
    return (
      <div className="rounded-[12px] px-4 py-3.5 flex flex-col gap-1.5" style={{ background: "rgba(11, 18, 14,0.4)", border: "1px dashed var(--vault-rule)", borderLeft: "2px solid #8b7bf0" }}>
        <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{ticket.label}</span>
        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{ticket.reason}</p>
      </div>
    );
  }
  return (
    <div className="rounded-[12px] overflow-hidden flex flex-col" style={{ border: "1px solid var(--vault-rule)", background: "rgba(11, 18, 14,0.5)", borderLeft: "2px solid #8b7bf0" }}>
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{ticket.label}</span>
          <OddsPill odds={ticket.combinedOdds} size="md" tone="violet" />
        </div>
        <p className="text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{ticket.blurb}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{money(25)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-success)" }}>{money(ticket.payout)}</span> · {ticket.legCount} legs</span>
          <Badge label="Model" value={`${Math.round(ticket.modelProbability * 100)}%`} tone="var(--vault-text-mute)" />
          <Badge label="Conf" value={ticket.confidence} tone={CONF[ticket.confidence] ?? "var(--vault-text-mute)"} />
          <Badge label="Vol" value={ticket.volatility} tone={VOL[ticket.volatility] ?? "var(--vault-text-mute)"} />
        </div>
      </div>
      <div className="px-3 py-3 flex flex-col gap-2">
        {ticket.pairs.map((pair, i) => <GameGroup key={pair.gameSlug} pair={pair} index={i} />)}
      </div>
      <div className="px-4 py-2.5 flex flex-col gap-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-mute)" }}><span className="font-mono uppercase tracking-[0.1em]" style={{ color: "#a99bf5", fontSize: 8.5 }}>Why it can hit · </span>{ticket.whyItCanHit}</span>
        <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}><span aria-hidden style={{ color: "#e7b15a" }}>⚠ Why it can miss · </span>{ticket.whyItCanFail}</span>
        <span className="text-[9.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{ticket.correlationNote}</span>
      </div>
    </div>
  );
}

export default function StructuredMoonshotSection({ data }: { data: StructuredMoonshot }) {
  const anyAvailable = data.tickets.some((t) => t.available);
  if (!data.gameCount || !anyAvailable) {
    return (
      <div className="rounded-[12px] px-5 py-6 text-center" style={{ background: "rgba(11, 18, 14,0.45)", border: "1px dashed var(--vault-rule)" }}>
        <span aria-hidden style={{ fontSize: 22 }}>🌙</span>
        <p className="mt-1.5" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>No qualified Moonshot today</p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>The slate has no game with a usable result + total pair yet — the model is holding rather than forcing a thin longshot.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Structured longshot — one <span style={{ color: "var(--vault-gold-bright)" }}>result</span> leg + one <span style={{ color: "var(--vault-text)" }}>total-goals</span> leg from every game on the slate, grouped by game. Team markets only (no player props), each the model&apos;s own pick, aligned with the game&apos;s score lean.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.tickets.map((t) => <TicketCard key={t.tier} ticket={t} />)}
      </div>
    </div>
  );
}
