/**
 * HomerNukesBoard — the daily Homer Nukes 5-leg home-run PARLAY (one $20 paper bet, not five), or an
 * honest data-gated empty state. Premium layout:
 *   • Hero: "$20 Daily Homer Parlay" + date + slate size + stake / combined odds / potential return /
 *     implied win % / sportsbook sources + a parlay confidence meter.
 *   • Partial-Model status row (0/7 Statcast inputs live — honest, never fabricated).
 *   • 5 ranked legs: headshot + team logo + OPPONENT logo + matchup + odds pill + 4-tier confidence
 *     (Elite/Strong/Playable/Avoid) + an honest per-leg "why selected".
 *   • WHY rationale (pending Statcast) + historical performance scaffold (7d/30d, honest placeholder).
 *
 * Server component; pure presentational. Honest by construction: real headshots/odds/logos only; the WHY,
 * Homer Score, and ROI history read "pending"/"awaiting" until those inputs are wired — never fabricated.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import { homerModelInputStatus } from "@/lib/mlb/homer-score";
import { homerTierFromProb, tierMeta } from "@/lib/mlb/confidence";
import type { HomerNukesResult, HomerNukePick } from "@/lib/mlb/homer-nukes";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;
const pct1 = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
const DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => { try { return DATE_FMT.format(new Date(`${iso}T00:00:00Z`)); } catch { return iso; } };

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display tabular truncate" style={{ color: accent ?? "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</div>
    </div>
  );
}

const PARLAY_CONF = { low: "var(--vault-text-faint)", medium: "#e7b15a", high: "var(--vault-success)" } as const;
function ConfidenceMeter({ level }: { level: "low" | "medium" | "high" }) {
  const idx = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => <span key={n} className="rounded-full" style={{ width: 16, height: 5, background: n <= idx ? PARLAY_CONF[level] : "rgba(255,255,255,0.08)" }} />)}
      </span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: PARLAY_CONF[level], fontSize: 9 }}>{level} confidence</span>
    </span>
  );
}

/** A 4-tier confidence chip (Elite/Strong/Playable/Avoid) shared with the props board. */
function TierChip({ prob }: { prob: number }) {
  const m = tierMeta(homerTierFromProb(prob));
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 8.5, color: m.fg, background: m.bg }}>
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: m.fg }} />{m.label}
    </span>
  );
}

export default function HomerNukesBoard({ board }: { board: HomerNukesResult }) {
  if (!board.available || !board.parlay) {
    return (
      <div className="rounded-[14px] px-5 py-10 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
        <div aria-hidden style={{ fontSize: 34 }}>💣⚾</div>
        <p className="mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>Today&rsquo;s Homer Nukes parlay isn&rsquo;t posted yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{board.note}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/mlb" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>MLB board</Link>
          <Link href="/mr-dub" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Mr. Dub portfolio →</Link>
        </div>
      </div>
    );
  }

  const p = board.parlay;
  const model = homerModelInputStatus();
  return (
    <div className="rounded-[14px] overflow-hidden flex flex-col" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--lava-border-strong)", borderLeft: "3px solid var(--gtp-bank-heat)" }}>
      {/* Hero */}
      <div className="px-4 py-3.5 flex flex-col gap-3" style={{ borderBottom: "1px solid var(--vault-rule)", background: "radial-gradient(120% 140% at 100% 0%, rgba(225,29,42,0.12) 0%, transparent 55%)" }}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>$20 Daily Homer Parlay</span>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              {fmtDate(board.date)} · {board.slateGames}-game slate · {p.legs.length} legs
            </span>
          </div>
          <ConfidenceMeter level={board.confidence} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeroStat label="Stake" value={money(p.stake)} accent="var(--vault-gold-bright)" />
          <HeroStat label="Combined odds" value={american(p.combinedOdds)} accent="var(--gtp-bank-heat)" />
          <HeroStat label="Potential return" value={money(p.projectedReturn)} accent="var(--vault-success)" />
          <HeroStat label="Implied win %" value={pct1(p.impliedProbability)} />
        </div>
        {p.providers.length ? <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Sportsbook sources: {p.providers.join(" · ")}</span> : null}
      </div>

      {/* Homer Score model status — honest Partial Model until Statcast inputs are wired. */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
        <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, color: "#e7b15a", background: "rgba(231,177,90,0.12)", border: "1px solid color-mix(in srgb, #e7b15a 35%, transparent)" }}>
          Homer Score · Partial Model
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          ranking by de-vigged market probability · {model.live}/{model.total} advanced inputs live ({model.pending.join(" · ")} — pending Statcast)
        </span>
      </div>

      {/* The 5 ranked legs */}
      <ol className="flex flex-col list-none">
        {p.legs.map((l, i) => {
          const conn = l.homeAway === "home" ? "vs" : l.homeAway === "away" ? "@" : "·";
          return (
            <li key={l.id} className="px-4 py-2.5 flex items-center gap-3 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
              <span className="font-display tabular shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 12, fontWeight: 800, width: 14 }}>{i + 1}</span>
              <span className="relative shrink-0">
                <PlayerAvatar name={l.player} photo={l.photoUrl} size={32} />
                {l.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={l.teamAbbr} sport="mlb" size="sm" /></span> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="block break-words font-display tracking-tight leading-tight" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{l.player}</span>
                  {l.opponentAbbr ? <span className="inline-flex items-center gap-1 shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{conn}<TeamLogo team={l.opponentAbbr} sport="mlb" size="sm" /></span> : null}
                </span>
                <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>To hit a HR · {l.matchup}</span>
                <span className="block truncate" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>Shortest HR price in this game · {Math.round(l.modelProbability * 100)}% implied</span>
              </span>
              <span className="shrink-0 text-right flex flex-col items-end gap-1">
                <span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12.5, background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-rule)" }}>{american(l.odds)}</span>
                <TierChip prob={l.modelProbability} />
              </span>
            </li>
          );
        })}
      </ol>

      {/* WHY — honest until Statcast model rationale is wired. */}
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.012)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Why these legs</span>
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
          The five shortest-priced anytime-HR bats on the slate (one per game), ranked by de-vigged market probability.
          Model rationale (barrel rate vs HR-prone pitcher, park &amp; weather) is <span style={{ color: "#e7b15a" }}>pending advanced Statcast integration</span>.
        </p>
      </div>

      {/* Combined footer */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderTop: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          {money(p.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-success)" }}>{money(p.projectedReturn)}</span> · {american(p.combinedOdds)}
        </span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>all 5 must homer · paper-only</span>
      </div>

      {/* Historical performance — honest scaffold; only real settled data ever fills it. */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Historical performance</span>
        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {["Last 7 days", "Last 30 days"].map((window) => (
            <div key={window} className="rounded-[10px] px-3 py-2" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{window}</span>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {[["Record", "—"], ["Win %", "—"], ["ROI", "—"], ["Units", "—"]].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <div className="font-display tabular" style={{ color: "var(--vault-text-faint)", fontSize: 12, fontWeight: 700 }}>{v}</div>
                    <div className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)", fontSize: 7.5 }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Awaiting settled history — fills in after the first parlay settles from official MLB box scores. No ROI is shown until then.</p>
      </div>
    </div>
  );
}
