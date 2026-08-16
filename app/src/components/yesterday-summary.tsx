/**
 * YesterdaySummary — a compact, settled-results strip for /today and /results.
 * Reads ONLY settled artifacts (never model opinion):
 *   - Bank Builder public ledger (last settled step),
 *   - World Cup settlement (official finals + graded picks),
 *   - World Cup parlays + daily mixed cards (card results),
 *   - MLB comparison report (decisive record).
 * Renders nothing when there is no settled data for the date. Server component.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import { getSportIdentity } from "@/lib/sport-identity";
import { loadPublicBankBuilderLedger } from "@/lib/data-bank-builder";
import { finalScoreText } from "@/lib/world-cup/projections";
import type { WcSettlement, WcParlays } from "@/lib/world-cup/projections";
import type { PublicSuggestedCard } from "@/lib/normalize";

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T;
  } catch {
    return null;
  }
}

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Tile {
  key: string;
  sport: string;
  title: string;
  value: string;
  sub: string;
  href: string;
  tone: "win" | "loss" | "neutral";
}

export default function YesterdaySummary({ date }: { date: string }) {
  const tiles: Tile[] = [];

  // Bank Builder — last settled step, only when it settled on `date`.
  const ledger = loadPublicBankBuilderLedger();
  const lastHit = (ledger?.entries ?? []).filter((e) => e.date === date).at(-1);
  if (lastHit) {
    tiles.push({
      key: "bank",
      sport: "bank_builder",
      title: `Bank Builder · Step ${lastHit.step}`,
      value: lastHit.result === "win" ? "WON" : lastHit.result.toUpperCase(),
      sub: `${usd(lastHit.bankrollBefore)} → ${usd(lastHit.bankrollAfter)} · ${lastHit.sport}`,
      href: "/bank-builder",
      tone: lastHit.result === "win" ? "win" : "loss",
    });
  }

  // World Cup — official finals + graded picks for the date (DATED artifact, so a new
  // day's empty latest.json never erases settled history).
  const wc = readJson<WcSettlement>(`world-cup/settlement/${date}.json`);
  if (wc && wc.date === date && (wc.graded ?? []).length > 0) {
    const w = wc.graded.filter((g) => g.outcome === "win").length;
    const l = wc.graded.filter((g) => g.outcome === "loss").length;
    // Dedupe by match (some artifacts carry duplicate final rows), and normalize the score across both
    // artifact shapes (regulationScore string vs structured homeGoals/awayGoals) — never render "undefined".
    const seenFinals = new Set<string>();
    const finals = (wc.finals ?? [])
      .filter((f) => { const k = f.match; if (seenFinals.has(k)) return false; seenFinals.add(k); return true; })
      .map((f) => `${f.match.split(" vs ")[0]} ${finalScoreText(f)}`.trim())
      .join(" · ");
    tiles.push({
      key: "wc",
      sport: "world_cup",
      title: "World Cup picks",
      value: `${w}–${l}`,
      sub: finals || "settled from official 90′ finals",
      href: "/world-cup?tab=results",
      tone: w >= l ? "win" : "loss",
    });
  }

  // Suggested cards (WC singles + mixed) settled on the date — dated artifacts.
  const wcCards = (readJson<WcParlays>(`world-cup/parlays/${date}.json`)?.cards ?? []).filter(
    (c) => c.result && c.result !== "pending",
  );
  const mixed = (readJson<{ cards?: PublicSuggestedCard[] }>(`daily/cards/${date}.json`)?.cards ?? []).filter(
    (c) => c.result && c.result !== "pending",
  );
  const settledCards = [...wcCards, ...mixed];
  if (settledCards.length > 0) {
    const won = settledCards.filter((c) => c.result === "won").length;
    tiles.push({
      key: "cards",
      sport: "mixed",
      title: "Suggested cards",
      value: `${won} / ${settledCards.length} hit`,
      sub: "World Cup + mixed-sport cards",
      href: "/picks",
      tone: won > 0 ? "neutral" : "loss",
    });
  }

  // MLB — decisive record from the official comparison report.
  const mlb = readJson<{ date?: string; wins?: number; losses?: number; decisive?: number; hitRate?: number }>(
    `mlb/results/comparison_report_${date}.json`,
  );
  if (mlb && (mlb.decisive ?? 0) > 0) {
    tiles.push({
      key: "mlb",
      sport: "mlb",
      title: "MLB leans",
      value: `${mlb.wins}W–${mlb.losses}L`,
      sub: `${Math.round((mlb.hitRate ?? 0) * 1000) / 10}% decisive hit rate`,
      href: "/results",
      tone: (mlb.hitRate ?? 0) >= 0.5 ? "win" : "neutral",
    });
  }

  if (tiles.length === 0) return null;
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", timeZone: "UTC",
  });

  return (
    <section aria-label={`Results from ${dateLabel}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          Yesterday · {dateLabel} · settled from official results
        </span>
        <Link href="/results" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
          Full results →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t, i) => {
          const id = getSportIdentity(t.sport);
          const toneColor = t.tone === "win" ? "#6EE7A8" : t.tone === "loss" ? "#F08A8A" : "var(--vault-text)";
          return (
            <Link
              key={t.key}
              href={t.href}
              className="gtp-fade-up gtp-card-hover flex items-center gap-2.5 rounded-[10px] px-3.5 py-3"
              style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none", animationDelay: `${i * 60}ms` }}
            >
              <span
                className="gtp-sport-orb shrink-0"
                style={{ width: 30, height: 30, fontSize: 16, ["--orb-grad" as string]: id.gradient }}
                role="img"
                aria-label={id.ballLabel}
              >
                {id.icon}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="font-mono uppercase tracking-[0.08em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{t.title}</span>
                <span className="font-display tabular" style={{ color: toneColor, fontSize: 15, fontWeight: 700 }}>{t.value}</span>
                <span className="font-mono truncate" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{t.sub}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
