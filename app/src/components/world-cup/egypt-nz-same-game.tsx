/**
 * Egypt vs New Zealand — Same-Game Ideas.
 *
 * A small, self-contained World Cup section that pairs REAL posted NZ/Egypt markets (Egypt ML,
 * Under 2.5, Egypt Double Chance, BTTS No, Egypt Draw No Bet) into 3–5 "same-game ideas". It NEVER
 * fabricates a combined / SGP price — each leg shows its individual posted odds only, with an explicit
 * "Same-game idea only — combined pricing requires sportsbook SGP pricing." note.
 *
 * Kickoff-gated: NZ/Egypt kicks off 2026-06-22T01:00:00Z. At/after kickoff (relative to build time)
 * the section renders an archived "match has started — for review" state; before kickoff it renders
 * as pre-event ideas. Server component; reads the committed projections artifact only.
 */
import fs from "node:fs";
import path from "node:path";
import FlagBadge from "@/components/flag-badge";

const NZ_EGYPT_KICKOFF_ISO = "2026-06-22T01:00:00Z";
const MATCH_ID = 40;

interface NzEgyptMarket {
  market: string;
  label: string;     // human pick label, e.g. "Egypt", "Under 2.5"
  odds: number | null;
}
interface NzEgyptData {
  homeTeam: string;
  awayTeam: string;
  homeCode: string | null;
  awayCode: string | null;
  kickoffUtc: string | null;
  markets: Record<string, NzEgyptMarket>; // keyed by market key (moneyline_90, match_total_goals, …)
}

/** Read the NZ/Egypt (matchId 40) markets from the committed projections snapshot. Fail-closed. */
export function loadNzEgyptMarkets(slateDate: string, rootOverride?: string): NzEgyptData | null {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    const p = path.join(root, "world-cup", "projections", `${slateDate}.json`);
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { matches?: Array<Record<string, unknown>> };
    const rows = (raw.matches ?? []).filter((m) => Number(m.matchId) === MATCH_ID);
    if (rows.length === 0) return null;
    const first = rows[0];
    const markets: Record<string, NzEgyptMarket> = {};
    for (const r of rows) {
      const market = String(r.market ?? "");
      if (!market) continue;
      markets[market] = {
        market,
        label: String(r.pickLabel ?? r.pick ?? market),
        odds: (r.americanOdds as number | null | undefined) ?? null,
      };
    }
    return {
      homeTeam: String(first.homeTeam ?? "New Zealand"),
      awayTeam: String(first.awayTeam ?? "Egypt"),
      homeCode: (first.homeCode as string | null | undefined) ?? null,
      awayCode: (first.awayCode as string | null | undefined) ?? null,
      kickoffUtc: (first.kickoffUtc as string | null | undefined) ?? NZ_EGYPT_KICKOFF_ISO,
      markets,
    };
  } catch {
    return null;
  }
}

const american = (o: number | null | undefined) => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

interface Idea { title: string; legs: string[]; rationale: string }

/**
 * 3–5 same-game ideas, each a pair of the REAL posted markets. We never combine the prices — each
 * leg keeps its individual odds. Only ideas whose both markets are actually posted are built.
 */
function buildIdeas(d: NzEgyptData): Idea[] {
  const has = (k: string) => d.markets[k]?.odds != null;
  const candidates: Array<{ a: string; b: string; rationale: string }> = [
    { a: "moneyline_90", b: "match_total_goals", rationale: "Egypt favoured to win a low-scoring 90 minutes." },
    { a: "double_chance", b: "btts", rationale: "Egypt avoid defeat while the model leans toward a clean sheet at one end." },
    { a: "match_total_goals", b: "draw_no_bet", rationale: "A tight, low-goal game where Egypt are backed (draw refunds the DNB leg)." },
    { a: "moneyline_90", b: "btts", rationale: "Egypt win and keep New Zealand off the scoresheet." },
    { a: "double_chance", b: "match_total_goals", rationale: "Egypt not to lose in a game the totals lean under." },
  ];
  const ideas: Idea[] = [];
  for (const c of candidates) {
    if (!has(c.a) || !has(c.b)) continue;
    const la = d.markets[c.a];
    const lb = d.markets[c.b];
    ideas.push({
      title: `${la.label} + ${lb.label}`,
      legs: [c.a, c.b],
      rationale: c.rationale,
    });
    if (ideas.length >= 5) break;
  }
  return ideas;
}

function IdeaLegRow({ m }: { m: NzEgyptMarket }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{m.label}</span>
        <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)" }}>{m.market.replace(/_/g, " ")}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12.5px]" style={{ color: "var(--vault-text)" }}>{american(m.odds)}</span>
        <span className="block font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>individual</span>
      </span>
    </div>
  );
}

export default function EgyptNzSameGame({
  data,
  nowIso,
}: {
  data: NzEgyptData | null;
  /** Injected build-time clock (defaults to now) so the kickoff gate is deterministic in tests. */
  nowIso?: string;
}) {
  if (!data) return null;
  const ideas = buildIdeas(data);
  if (ideas.length === 0) return null;

  const kickoffMs = Date.parse(data.kickoffUtc ?? NZ_EGYPT_KICKOFF_ISO);
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  // Started when the kickoff is at/before build time. (It is ~9 PM ET June 21 at build, so archived.)
  const started = Number.isFinite(kickoffMs) && Number.isFinite(nowMs) && kickoffMs <= nowMs;

  const accent = "var(--vault-gold-bright)";
  return (
    <section className="gtp-fade-up" aria-label="Egypt vs New Zealand same-game ideas">
      <div className="overflow-hidden rounded-2xl p-4 sm:p-5" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.45)", opacity: started ? 0.92 : 1 }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              <FlagBadge code={data.awayCode ?? "EG"} size="sm" ariaLabel={data.awayTeam} />
              <FlagBadge code={data.homeCode ?? "NZ"} size="sm" ariaLabel={data.homeTeam} />
            </span>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
              Egypt vs New Zealand — Same-Game Ideas
            </h2>
          </div>
          <span className="rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: started ? "var(--vault-text-faint)" : accent, background: started ? "rgba(255,255,255,0.05)" : "rgba(217,164,65,0.12)", border: `1px solid ${started ? "var(--vault-rule)" : accent}` }}>
            {started ? "Archived · for review" : "Pre-event ideas"}
          </span>
        </div>

        {started ? (
          <div className="mb-3 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)" }}>
            This match has started — same-game ideas are archived for review, not new pre-event cards.
          </div>
        ) : (
          <p className="mb-3 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
            Pairs of real posted NZ/Egypt markets — pre-event ideas, paper-only. Each leg shows its individual posted odds.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ideas.map((idea, i) => (
            <div key={i} className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: accent }}>Idea #{i + 1}</span> · {idea.title}
                </span>
                <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>$10 per leg</span>
              </div>
              <div className="mt-1">{idea.legs.map((k) => <IdeaLegRow key={k} m={data.markets[k]} />)}</div>
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{idea.rationale}</p>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.05em]" style={{ color: "var(--vault-text-faint)" }}>
                settlement-supported · official 90-minute result
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
          Same-game idea only — combined pricing requires sportsbook SGP pricing. Individual odds shown; 90-minute regulation settlement only. Paper-only, educational.
        </p>
      </div>
    </section>
  );
}
