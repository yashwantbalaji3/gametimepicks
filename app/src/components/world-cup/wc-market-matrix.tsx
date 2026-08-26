/**
 * WcMarketMatrix — the requested-market availability matrix. Every requested market (moneyline,
 * total goals, total corners, player shots, SOT, assists, anytime goalscorer) gets an explicit
 * status chip + a one-line reason, so no market is ever silently missing. Real probe data only.
 */
import type { WcMarketAvailability } from "@/lib/world-cup/projections";
import { marketStatusChip } from "@/lib/world-cup/projections";

function Row({
  label,
  status,
  reason,
}: {
  label: string;
  status: string;
  reason: string;
}) {
  const chip = marketStatusChip(status);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[6px] px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex flex-col min-w-0">
        <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span className="font-mono leading-snug" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {reason}
        </span>
      </div>
      <span
        className="font-mono uppercase tracking-[0.08em] shrink-0 px-2 py-0.5 rounded-[4px] text-center"
        style={{ color: chip.tone, border: `1px solid ${chip.tone}`, fontSize: 10 }}
      >
        {chip.label}
      </span>
    </div>
  );
}

export default function WcMarketMatrix({ availability }: { availability: WcMarketAvailability }) {
  const all = Object.values(availability.markets);
  const team = all.filter((m) => m.kind === "team");
  const player = all.filter((m) => m.kind === "player");
  const credits = availability.providers.oddsApi.creditsRemaining;
  return (
    <section className="mt-10" aria-label="Requested markets">
      <div className="mb-3">
        <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
          Markets · status
        </span>
        <h2 className="font-display tracking-tight mt-1" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 700 }}>
          Every market, with an honest status
        </h2>
        <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--vault-text-mute)", maxWidth: "70ch" }}>
          We never hide a market. Each one below shows whether real odds + data are available and,
          if it isn&apos;t published yet, exactly what it&apos;s waiting on. Odds via The Odds API
          {credits ? ` (${credits} credits left)` : ""}; team strength via the FIFA ranking; lineups + stats via API-Football.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex flex-col gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Team / game markets
          </span>
          {team.map((m) => (
            <Row key={m.key} label={m.label} status={m.status} reason={m.reason} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Player markets
          </span>
          {player.map((m) => (
            <Row key={m.key} label={m.label} status={m.status} reason={m.reason} />
          ))}
        </div>
      </div>
    </section>
  );
}
