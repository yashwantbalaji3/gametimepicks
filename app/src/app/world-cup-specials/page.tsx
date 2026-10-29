/**
 * /world-cup-specials — RETIRED archive of the World Cup Specials Tracker. The 2026 World Cup is
 * complete and WC Specials is retired in the product registry; this page exists ONLY as the durable
 * accountability record: the settled per-slate ledger (record / ROI / P&L), the final tracker state,
 * and the full slate history. Suggested cards only — no exposure was ever placed. Nothing here may
 * present as live coverage (soccer is SCAFFOLD_ONLY in the capability registry). Server component;
 * reads committed artifacts. noindex: an archive, not a destination.
 */
import Link from "next/link";

import { loadWorldCupSpecials, loadWorldCupSpecialsHistory, specialsPastSlates } from "@/lib/world-cup/world-cup-specials";
import { deriveSpecialsTracker } from "@/lib/world-cup/specials-tracker";
import { buildSpecialsLedger, specialsSettledRecord } from "@/lib/world-cup/specials-ledger";
import WorldCupSpecialsTracker from "@/components/specials/world-cup-specials-tracker";
import SpecialsHistorySection from "@/components/specials/specials-history-section";
import SpecialsLedgerSection from "@/components/world-cup/specials-ledger-section";
import DailySpecialsSection from "@/components/specials/daily-specials-section";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import path from "node:path";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/world-cup-specials/", {
  title: "World Cup Specials — Retired Archive · GameTime Picks",
  description:
    "Archived World Cup Specials record — model-ranked suggested longshot cards from the completed 2026 World Cup, settled from official results. Retired; kept as past proof. Paper-only, educational.",
  robots: { index: false, follow: false },
});

export default function WorldCupSpecialsPage() {
  const nowIso = new Date().toISOString();
  const result = loadWorldCupSpecials();
  const t = deriveSpecialsTracker(result, nowIso);
  const pastSlates = specialsPastSlates(loadWorldCupSpecialsHistory(), t.date ?? "");
  const dataRoot = path.join(process.cwd(), "public", "data");
  const ledger = buildSpecialsLedger(dataRoot, t.date ?? result?.date ?? "");
  /* Batch 1 · #10: the history file never received the official settlements, so the ledger above reads 0 settled and
     printed "0–0, $0 · No World Cup Specials have settled yet" on a retired product whose cards WERE graded. The
     canonical settled record (product-ledger/wc-specials.json — what Mr. Dub's master ledger reads) is the archive line. */
  const settled = specialsSettledRecord(dataRoot);
  const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Retired · World Cup archive"
        title="World Cup Specials — Archived"
        slateDate={t.date ?? undefined}
        status="settled"
        /* archive-level counts (every archived slate + the canonical settled record), not the final empty slate's 0 / 0 / 0 */
        counts={{ suggestedCards: ledger.totalCards, settled: settled?.cards ?? ledger.settledCards }}
        primaryAction={{ label: "Mr. Dub portfolio", href: "/mr-dub" }}
        secondaryAction={{ label: "Results", href: "/results" }}
        note="RETIRED (2026-07-21) — the 2026 World Cup is complete, so this World-Cup-only paper product is closed and no new boxes post. Below is its archived record (record / ROI / P&L), settled from official results and kept as past proof. Paper-only; separate from the protected crown."
      />

      {/* The durable ledger — record / ROI / P&L / win-rate / open exposure / slates archived — when the history carries
          settled cards; otherwise the canonical settled record as one archive line (never a "nothing settled" claim). */}
      {ledger.settledCards > 0 ? (
        <SpecialsLedgerSection ledger={ledger} />
      ) : (
        <section className="rounded-xl px-4 py-4" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
          <p className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>Archived record</p>
          {settled ? (
            <>
              <p className="mt-1" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
                Final record {settled.wins}–{settled.losses}{settled.pushes ? `–${settled.pushes}` : ""} · {money(settled.staked)} paper staked · {money(settled.pnl)} P&amp;L
              </p>
              <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
                {settled.cards} card{settled.cards === 1 ? "" : "s"} settled from the official results, {settled.firstDate === settled.lastDate ? settled.firstDate : `${settled.firstDate} to ${settled.lastDate}`}.
                {ledger.totalCards > settled.cards
                  ? ` ${ledger.totalCards} suggested cards were posted across ${ledger.totalSlates} slates; the other ${ledger.totalCards - settled.cards} have no settlement on record and are not counted.`
                  : ""}{" "}
                Paper-only — no exposure was ever placed.
              </p>
            </>
          ) : (
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
              No settled World Cup Specials card is on record. {ledger.totalCards} suggested cards across {ledger.totalSlates} slates are archived below, ungraded. Paper-only — no exposure was ever placed.
            </p>
          )}
        </section>
      )}

      {/* Daily Structured Specials — the "2 legs from each game" product, four reliability tiers. */}
      {result?.dailySpecials?.length ? <DailySpecialsSection cards={result.dailySpecials} /> : null}

      {/* The tracker reads ONE slate; the last (2026-07-21) is empty, so it would print a "0–0" record beside the real one. */}
      {result?.cards?.length ? (
        <WorldCupSpecialsTracker result={result} nowIso={nowIso} mode="full" retired />
      ) : (
        <div className="rounded-xl px-4 py-8 text-center" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>World Cup Specials — retired</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            The 2026 World Cup is complete, so no new specials post. The settled record lives in the <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>results</Link>.
          </p>
        </div>
      )}
      <SpecialsHistorySection days={pastSlates} />
    </div>
  );
}
