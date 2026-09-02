/**
 * INTERNAL PREVIEW — June 20 World Cup Specials box, with the player ROLE-QUALITY gate surfaced.
 * Renders the role-screened cards: every player leg shows its role tier badge (key attacker /
 * projected starter) + role evidence in the drawer, plus a per-card role-quality summary. Gold/lava
 * "trophy" styling like production, but clearly framed as an internal review build. Server-rendered;
 * native <details> drawers. NOT linked from production surfaces.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { SpecialLeg, WorldCupSpecialCard } from "@/lib/world-cup/world-cup-specials";
import type { June20SpecialsPreview } from "@/lib/world-cup/world-cup-specials-preview";
import PlayerAvatar from "@/components/ui/player-avatar";

const GOLD = "var(--vault-gold, var(--vault-gold))";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const american = (o: number) => (o > 0 ? `+${o}` : `${o}`);
const shortStart = (iso: string | null) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }) + " UTC";
};

const ROLE_LABEL: Record<string, string> = {
  confirmed_starter: "Confirmed starter",
  key_attacker: "Key attacker",
  projected_starter: "Projected starter",
};

function RoleBadge({ tier }: { tier?: string }) {
  if (!tier || !ROLE_LABEL[tier]) return null;
  return (
    <span className="rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em]"
      style={{ color: "var(--vault-success)", background: "color-mix(in srgb, var(--gtp-success-on-dark) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--gtp-success-on-dark) 40%, transparent)" }}>
      {ROLE_LABEL[tier]}
    </span>
  );
}

function LegAvatar({ leg }: { leg: SpecialLeg }) {
  if (leg.kind === "player" && leg.photoUrl) {
    return (
      <span className="relative inline-block shrink-0" style={{ width: 26, height: 26 }}>
        <PlayerAvatar name={leg.participant} photo={leg.photoUrl} size={26} />
        {leg.countryCode && (
          <span className="absolute -bottom-1 -right-1" style={{ transform: "scale(0.6)", transformOrigin: "bottom right" }}>
            <FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.team ?? ""} />
          </span>
        )}
      </span>
    );
  }
  if (leg.countryCode) return <span className="shrink-0"><FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.participant} /></span>;
  return (
    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px]"
      style={{ background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", border: "1px solid var(--vault-border)" }} aria-label="Match market">⚽</span>
  );
}

function LegRow({ leg }: { leg: SpecialLeg }) {
  const pick = `${leg.marketLabel}${leg.kind === "player" && leg.side && leg.side !== "Yes" ? ` ${leg.side}` : ""}${leg.line != null ? ` ${leg.line}` : ""}`.trim();
  const where = leg.opponent ? `vs ${leg.opponent}` : leg.fixture;
  const matchup = [where, shortStart(leg.startTime)].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <LegAvatar leg={leg} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
          {leg.kind === "player" && <RoleBadge tier={leg.roleTier} />}
        </span>
        <span className="block truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{pick}</span>
        {matchup && <span className="block truncate font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{matchup}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
        <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>
      </span>
    </div>
  );
}

function SpecialCard({ card, index }: { card: WorldCupSpecialCard; index: number }) {
  const playerLegs = card.legs.filter((l) => l.kind === "player");
  return (
    <div className="overflow-hidden rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: GOLD }}>Special #{index + 1}</span> · {card.title}
        </span>
        <span className="font-mono text-[12px]" style={{ color: GOLD }}>{american(card.combinedOdds)} combined</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        <span style={{ color: "var(--vault-text-mute)" }}>{usd(card.stakePreview)} → {usd(card.projectedReturn)}</span>
        <span>· {card.legs.length} legs · {card.games.length} games</span>
        <span>· {card.teamPropCount} team / {card.playerPropCount} player</span>
        <span>· model {Math.round(card.jointModelProbability * 100)}% all-hit</span>
      </div>
      {card.roleQualitySummary && (
        <div className="mt-1 rounded-md px-2 py-1 text-[10.5px]" style={{ background: "color-mix(in srgb, var(--gtp-success-on-dark) 6%, transparent)", color: "var(--vault-text-mute)" }}>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-success)", fontSize: 9 }}>role-screened</span> · {card.roleQualitySummary}
        </div>
      )}
      <div className="mt-1.5">{card.legs.map((l) => <LegRow key={l.legId} leg={l} />)}</div>
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-[10.5px]" style={{ color: GOLD, listStyle: "none" }}>
          Why this card · role evidence · correlation · how it fails ▾
        </summary>
        <div className="mt-1.5 space-y-1 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {card.whyThisCard.map((w, i) => <div key={`w${i}`}><span style={{ color: "var(--vault-success)" }}>Why:</span> {w}</div>)}
          {playerLegs.length > 0 && (
            <div>
              <span className="font-mono text-[10px] uppercase" style={{ color: "var(--vault-success)" }}>role evidence:</span>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {playerLegs.map((l) => (
                  <li key={l.legId}>
                    <span style={{ color: "var(--vault-text)" }}>{l.participant}</span> — {ROLE_LABEL[l.roleTier ?? ""] ?? l.roleTier}: {(l.roleEvidence ?? []).join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <span className="font-mono text-[10px] uppercase" style={{ color: GOLD }}>correlation:</span>{" "}
            {card.correlationProfile.replace(/_/g, " ")} — correlation-disclosed, not hidden.
          </div>
          {card.whyItCanFail.map((w, i) => <div key={`f${i}`}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {w}</div>)}
          <div style={{ color: "var(--vault-text-faint)" }}>Data quality: {card.dataQuality}. Player roles are projected (lineups pending) — limited-data / market-implied.</div>
          <div style={{ color: "var(--vault-text-faint)" }}>Official settlement: {card.settlementNotes.join(" · ")}.</div>
        </div>
      </details>
    </div>
  );
}

export default function WorldCupSpecialsPreviewBox({ data }: { data: June20SpecialsPreview | null }) {
  const cards = data?.cards ?? [];
  return (
    <section className="gtp-fade-up" aria-label="World Cup Specials (June 20 preview)">
      <div className="overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{ border: `1px solid ${GOLD}`, background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-gold) 10%, transparent), color-mix(in srgb, var(--vault-lava-red) 6%, transparent) 55%, color-mix(in srgb, var(--vault-scrim-base) 30%, transparent))" }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>🏆 World Cup Specials</h2>
            <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              Moonshot-style World Cup parlays built from role-screened player props and team anchors.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["High-volatility", "Paper-only", "Role-screened", "Odds-backed"].map((b) => (
              <span key={b} className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: GOLD, background: "color-mix(in srgb, var(--vault-gold) 12%, transparent)", border: `1px solid ${GOLD}` }}>{b}</span>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          <strong style={{ color: "var(--vault-text-mute)" }}>Internal June 20 preview — review before publishing.</strong> Every player prop is screened to a
          projected-starter / key-attacker role — bench &amp; rotation-risk props are excluded. Combined {american(data?.config.minCombinedOdds ?? 700)}..{american(data?.config.maxCombinedOdds ?? 3000)} ·
          per-leg {american(data?.config.minLegOdds ?? -250)}..{american(data?.config.maxLegOdds ?? 200)}. Higher variance by design.
        </p>

        {cards.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {cards.map((c, i) => <SpecialCard key={c.id} card={c} index={i} />)}
          </div>
        ) : (
          <div className="rounded-xl px-3.5 py-4 text-[12px]" style={{ border: "1px dashed var(--vault-rule)", color: "var(--vault-text-mute)" }}>
            <p className="font-semibold" style={{ color: "var(--vault-text)" }}>No role-screened World Cup Specials available yet.</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4" style={{ color: "var(--vault-text-faint)" }}>
              {(data?.notes ?? ["June 20 preview data is not available."]).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        <Link href="/results/" className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: GOLD }}>
          More World Cup projections &amp; cards →
        </Link>
      </div>
    </section>
  );
}
