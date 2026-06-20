/**
 * /preview/june20 — INTERNAL review build for Saturday June 20.
 *
 * Review-only surface: shows the rebuilt, role-screened World Cup Specials for June 20 (real odds +
 * API-Football identity, pulled into the isolated `previews/june20/` namespace). It does NOT touch the
 * production homepage / world-cup / parlays surfaces and is `noindex` (not linked from production). The
 * June 19 active Bank Builder / Moonshot / Mr. Dub state is unchanged and intentionally still pending —
 * this preview does not settle anything.
 */
import Link from "next/link";
import WorldCupSpecialsPreviewBox from "@/components/world-cup/world-cup-specials-preview-box";
import { loadJune20SpecialsPreview } from "@/lib/world-cup/world-cup-specials-preview";

export const metadata = {
  title: "Internal Preview · June 20 World Cup Specials",
  robots: { index: false, follow: false },
};

const american = (o: number) => (o > 0 ? `+${o}` : `${o}`);
const kickoff = (iso: string | null) => {
  if (!iso) return "TBD";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "TBD";
  return new Date(t).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }) + " UTC";
};

export default function June20PreviewPage() {
  const data = loadJune20SpecialsPreview();
  const d = data?.diagnostics;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* Internal preview banner */}
      <section
        className="rounded-[14px] px-4 py-3.5"
        style={{ border: "1px solid var(--vault-gold, #D4AF37)", background: "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(26,16,11,0.4))" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
            🧪 Internal June 20 Preview
          </span>
          <div className="flex flex-wrap gap-1.5">
            {["Not production", "Review build", "Paper-only"].map((b) => (
              <span key={b} className="rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)", border: "1px solid var(--lava-border-strong)" }}>{b}</span>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          This is an internal review build of Saturday <strong style={{ color: "var(--vault-text)" }}>June 20</strong> World Cup Specials, rebuilt with a
          player role-quality gate. It is not linked from production and changes no live data.
        </p>
        <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--gtp-bank-heat)" }}>
          June 19 settlement is not finalized in this preview — active Bank Builder / Moonshot lanes remain pending (no fake results, nothing settled).
        </p>
      </section>

      {/* June 20 slate status */}
      <section className="rounded-[14px] px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.4)" }}>
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Saturday June 20 · World Cup slate</span>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(data?.games ?? []).map((g) => (
            <div key={g.fixture} className="rounded-[10px] px-3 py-2" style={{ background: "rgba(12,8,6,0.55)", border: "1px solid var(--vault-rule)" }}>
              <span className="block truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{g.fixture}</span>
              <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{kickoff(g.kickoffUtc)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
          Real odds-backed, pre-event games only. Tunisia vs Japan is excluded — no odds posted yet (not fabricated).
          {data && !data.lineupsPosted ? " Lineups are not yet posted, so player roles are projected (market-implied / limited-data)." : ""}
        </p>
      </section>

      {/* The role-screened World Cup Specials */}
      <WorldCupSpecialsPreviewBox data={data} />

      {/* Diagnostics */}
      {d && (
        <section className="rounded-[14px] px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.4)" }}>
          <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Role-quality diagnostics</span>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            {[
              ["cards generated", d.cardsGenerated],
              ["eligible team legs", d.eligibleTeamLegs],
              ["in-range player legs", d.eligiblePlayerLegs],
              ["accepted (role-passed)", d.acceptedPlayerLegs],
              ["excluded rotation/def", d.excludedRotationRisk],
              ["excluded goalkeeper", d.excludedBenchRisk],
              ["excluded unknown role", d.excludedUnknownRole],
              ["excluded out-of-range", d.excludedOutOfLegOddsRange],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-md px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-rule)" }}>
                <span className="block" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{String(val)}</span>
                <span className="block uppercase tracking-[0.05em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</span>
              </div>
            ))}
          </div>
          <details className="mt-2.5">
            <summary className="cursor-pointer font-mono text-[10.5px]" style={{ color: "var(--vault-gold-bright)", listStyle: "none" }}>
              Excluded players + reasons ({data?.roleBreakdown.excluded.length ?? 0}) ▾
            </summary>
            <ul className="mt-1.5 max-h-72 overflow-y-auto space-y-0.5 pl-1 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
              {(data?.roleBreakdown.excluded ?? []).map((r) => (
                <li key={`${r.team}:${r.player}`}>
                  <span style={{ color: "var(--vault-text-faint)" }}>✗</span> <span style={{ color: "var(--vault-text)" }}>{r.player}</span> ({r.team}, {r.position ?? "?"}) — {r.reason}
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-2 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{(d.roleQualityNotes ?? []).join(" ")}</p>
        </section>
      )}

      {/* Review instructions */}
      <section className="rounded-[14px] px-4 py-3.5" style={{ border: "1px dashed var(--vault-rule)", background: "rgba(26,16,11,0.3)" }}>
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>What to review</span>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          <li>Each card&apos;s player legs should be projected starters / key attackers — no bench or rotation-risk names.</li>
          <li>Combined odds {american(data?.config.minCombinedOdds ?? 700)}..{american(data?.config.maxCombinedOdds ?? 3000)}; every leg {american(data?.config.minLegOdds ?? -250)}..{american(data?.config.maxLegOdds ?? 200)}.</li>
          <li>Open a card&apos;s drawer to see the role evidence behind each player prop.</li>
          <li>Check the excluded-players list above — confirm the right names were screened out.</li>
        </ul>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          If approved, the next step is to wire this role-screened build into the production homepage box and merge. Nothing is published from this preview.
        </p>
        <Link href="/" className="mt-2 inline-flex font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)" }}>← Back to production home</Link>
      </section>
    </div>
  );
}
