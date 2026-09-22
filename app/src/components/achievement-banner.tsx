/**
 * Completed ladders — the LEGACY HISTORY panel (C3 founder decision, 2026-09-22).
 *
 * The two completed $100→$10k Bank Builder ladders are real and are preserved. They ran in JUNE 2026, under
 * the June multi-sport operator process, and they are NOT evidence for the methodology running today. The
 * decision is explicit: they may render only inside an explicitly labelled "Completed ladders / Legacy
 * history" context, with exact dates and era context, and may never be the current headline, never be added
 * to the current protected record, and never be mixed into current-performance figures.
 *
 * This banner used to break three of those rules at once: it headlined "2× $100 → $10K challenge completed"
 * with a crown, carried NO dates and no era, and sat the completions immediately beside the CURRENT Bank
 * Builder record and CURRENT paper profit — so a reader had nothing to tell them the ladders were three
 * months old or ran under a different process. It is now a dated, era-labelled historical panel, and the
 * current record is no longer shown inside it (the current figure belongs to the current surfaces; showing
 * it here is what invited the reading that the completions were current evidence).
 *
 * Every figure is still read from the canonical portfolio + banked-ladders artifacts — no hardcoded numbers.
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
  /*
   * The OFFICIAL gate stays: portfolio.json marks which completed ladders the owner considers officially
   * settled, and a panel that showed an unofficial completion would be a claim the owner has not made.
   * The dated rows below come from banked-ladders.json, which is where the step dates live.
   */
  const officialCount = (p.completedLadders ?? []).filter((l: any) => l.official).length;
  if (officialCount < 1) return null;
  /*
   * The ladders' EXACT DATES, read from the owner's own step dates / completedDate — the C3 decision
   * requires them beside the figure, and a panel that cannot source them shows no date rather than a
   * guessed one. `banked` may be absent (its read is allowed to fail), in which case there is no dated
   * legacy context to show and the panel declines to render at all.
   */
  const ladderRows = (banked?.ladders ?? [])
    .filter((l: any) => typeof l.final === "number" && Number.isFinite(l.final))
    .map((l: any) => {
      const dates = (l.steps ?? []).map((s: any) => s.date).filter(Boolean).sort();
      const from = dates[0] ?? null;
      const to = l.completedDate ?? dates[dates.length - 1] ?? null;
      return { label: l.label ?? "Completed ladder", start: l.start ?? 100, final: l.final, from, to, key: l.ladder ?? l.final };
    })
    .filter((r: any) => r.from && r.to);
  if (ladderRows.length < 1) return null;
  const spanFrom = ladderRows.map((r: any) => r.from).sort()[0];
  const spanTo = ladderRows.map((r: any) => r.to).sort().at(-1);
  const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section
      aria-label="Completed ladders — legacy history"
      className="rounded-2xl px-4 py-3 sm:px-5 sm:py-4"
      style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* The label the C3 decision requires: historical, explicit, and carrying the era in the heading itself. */}
          <p className="font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
            Completed ladders · legacy history
          </p>
          <h2 className="font-display tracking-tight mt-0.5" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
            {ladderRows.length === 1 ? "One" : `${ladderRows.length}×`} $100 → $10K paper ladder{ladderRows.length === 1 ? "" : "s"} completed in {monthLabel(spanFrom)}
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            {spanFrom === spanTo ? dayLabel(spanFrom) : `${dayLabel(spanFrom)} – ${dayLabel(spanTo)}, ${new Date(`${spanTo}T00:00:00Z`).getUTCFullYear()}`}
            {" · "}run under the June multi-sport operator process, graded leg-by-leg from official results.
            <span className="ml-1" style={{ color: "var(--vault-text-faint)" }}>
              A different era from the Bank Builder running today — historical record, not evidence for the
              current methodology, and not part of the current record. Paper-only · educational · not betting advice.
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ladderRows.map((l: any) => (
            <span
              key={l.key}
              className="rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold"
              title={`${l.label} · ${l.from} → ${l.to}`}
              style={{ color: "var(--vault-text)", background: "var(--vault-wash)", border: "1px solid var(--vault-rule)" }}
            >
              {usd(l.start)} → {usd(l.final)}
              <span className="ml-1.5 font-normal" style={{ color: "var(--vault-text-faint)" }}>{dayLabel(l.to)}</span>
            </span>
          ))}
          <Link href="/mr-dub" className="vault-press rounded-full px-3 py-1 font-mono uppercase tracking-[0.08em] text-[10px]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", textDecoration: "none" }}>
            Full ledger →
          </Link>
        </div>
      </div>
    </section>
  );
}
