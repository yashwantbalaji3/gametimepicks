/**
 * Achievement banner — surfaces the platform's verifiable track record (Phase 9 social proof). Every claim
 * is read from the canonical portfolio + banked-ladders artifacts (no hardcoded marketing numbers): two
 * officially-completed $100→$10k ladders, cumulative paper profit, and the Bank Builder record. Paper-only,
 * educational — never overstated.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function AchievementBanner() {
  let p: any = null;
  let banked: any = null;
  try { p = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "portfolio.json"), "utf8")); } catch { return null; }
  try { banked = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "banked-ladders.json"), "utf8")); } catch {}
  const completed = (p.completedLadders ?? []).filter((l: any) => l.official);
  if (completed.length < 1) return null;
  const rec = p.record ?? { wins: 0, losses: 0 };
  // Realized paper profit — the ONE canonical figure (bankroll − starting capital). NOT
  // banked.lifetimeProfit, which historically held the bankroll itself (off by the $100 seed).
  const profit = p.settledProfit ?? ((p.currentBankroll ?? 100) - (p.startingBankroll ?? 100));

  return (
    <section
      aria-label="Track record"
      className="rounded-2xl px-4 py-3 sm:px-5 sm:py-4"
      style={{ border: "1px solid rgba(217,164,65,0.45)", background: "linear-gradient(135deg, rgba(217,164,65,0.14), rgba(26,16,11,0.5))" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden style={{ fontSize: 18 }}>👑</span>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-gold-bright)", fontSize: 17, fontWeight: 800 }}>
              {completed.length === 2 ? "2× $100 → $10K challenge completed" : `${completed.length}× $100 → $10K challenge completed`}
            </h2>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            Two paper Bank Builder ladders run from $100 to ~$10K, each graded leg-by-leg from official results.
            <span className="ml-1" style={{ color: "var(--vault-text-faint)" }}>Paper-only · educational · not betting advice.</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {completed.map((l: any) => (
            <span key={l.ladder ?? l.final} className="rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold" style={{ color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.35)" }}>
              {usd(l.start ?? 100)} → {usd(l.final)}
            </span>
          ))}
          <span className="rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.12)", border: "1px solid rgba(110,231,168,0.35)" }}>
            {usd(profit)} paper profit
          </span>
          <span className="rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold" style={{ color: "var(--vault-text)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)" }}>
            Bank Builder {rec.wins}–{rec.losses}
          </span>
          <Link href="/mr-dub" className="vault-press rounded-full px-3 py-1 font-mono uppercase tracking-[0.08em] text-[10px]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", textDecoration: "none" }}>
            Full ledger →
          </Link>
        </div>
      </div>
    </section>
  );
}
