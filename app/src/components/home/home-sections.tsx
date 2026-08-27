/**
 * Home landing sections 4–7 — compact, prop-driven, presentational blocks for `/`:
 *   • SlateSummary   (4) — a COMPACT preview of today's slate (NOT the full board).
 *   • TrustStrip     (5) — record · paper bankroll · peak · open exposure · pending-vs-settled.
 *   • HowItWorks     (6) — 3–4 honest steps (deterministic artifacts, official-only settlement).
 *   • FooterCta      (7) — Simulate / Today's Picks / Results.
 *
 * None of these read data or hardcode a dollar value / record / step — every figure is a pre-formatted
 * string/number prop supplied by the server page. Vault tokens only; mobile-first (~390px, ≥44px taps).
 */
import Link from "next/link";

// ── 4 · Today's slate summary (compact preview, not the board) ───────────────
export interface SlateSummaryProps {
  /** Human slate date, e.g. "Tuesday, July 8". */
  dateLabel: string;
  /** MLB games count for the slate (0 when no board). */
  mlbGames: number;
  /** MLB model leans count (0 when no board). */
  mlbLeans: number;
  /** Top Model Picks count — pass null to omit (only shown when real). */
  topPicks: number | null;
  /** Bank Builder status line (pre-formatted upstream), e.g. "No-play, awaiting the next rung". */
  bankBuilderStatus: string;
  /** Longshot / Moonshot status line, e.g. "No-play today". */
  moonshotStatus: string;
}

function SlateRow({ label, value, tone }: { label: string; value: string; tone?: "gold" | "mute" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: "1px solid var(--vault-rule)" }}>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{label}</span>
      <span className="font-mono text-right" style={{ color: tone === "gold" ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 12, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export function SlateSummary({ dateLabel, mlbGames, mlbLeans, topPicks, bankBuilderStatus, moonshotStatus }: SlateSummaryProps) {
  return (
    <section aria-label="Today's slate summary" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>Today&rsquo;s slate</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{dateLabel}</span>
      </div>
      <div className="rounded-[14px] px-4 py-3" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
        <SlateRow label="MLB games" value={mlbGames > 0 ? `${mlbGames} games · ${mlbLeans} model leans` : "No board yet"} tone={mlbGames > 0 ? "gold" : "mute"} />
        {topPicks != null && topPicks > 0 ? <SlateRow label="Top model picks" value={`${topPicks} ranked`} tone="gold" /> : null}
        <SlateRow label="Bank Builder" value={bankBuilderStatus} />
        <SlateRow label="Longshot / Moonshot" value={moonshotStatus} />
        <div className="pt-2.5">
          <Link href="/today" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
            Open Today&rsquo;s Picks →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── 5 · Trust / receipts strip ───────────────────────────────────────────────
export interface TrustStripProps {
  recordLabel: string | null;       // paper record W–L (formatted upstream)
  bankrollLabel: string | null;     // current paper bankroll (formatted upstream)
  peakLabel: string | null;         // peak / crown paper bankroll (formatted upstream)
  openExposureLabel: string;        // open exposure (formatted upstream)
  pendingLabel: string | null;      // pending-vs-settled note (e.g. "N pending, M settled")
}

function TrustTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
      <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-gold-bright)", fontSize: 17, fontWeight: 800, lineHeight: 1.05 }}>{value}</span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</span>
    </div>
  );
}

export function TrustStrip({ recordLabel, bankrollLabel, peakLabel, openExposureLabel, pendingLabel }: TrustStripProps) {
  return (
    <section aria-label="Track record and receipts" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>Transparent receipts</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Official settlement only · pending is not a loss</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {recordLabel ? <TrustTile value={recordLabel} label="Paper record (W–L)" /> : null}
        {bankrollLabel ? <TrustTile value={bankrollLabel} label="Current paper bankroll" /> : null}
        {peakLabel ? <TrustTile value={peakLabel} label="Peak paper bankroll" /> : null}
        <TrustTile value={openExposureLabel} label="Open exposure" />
      </div>
      <p className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {pendingLabel ? `${pendingLabel} — ` : ""}every card is graded from official box scores; pending cards are not counted as losses.
      </p>
    </section>
  );
}

// ── 6 · How it works ─────────────────────────────────────────────────────────
const STEPS: { n: string; title: string; body: string }[] = [
  { n: "1", title: "Model artifacts generated", body: "Each slate's games are turned into deterministic, precomputed model artifacts — committed once, read by everyone." },
  { n: "2", title: "You run the same simulation", body: "Open a game and run the precomputed simulation. It's deterministic — the same output for every user, no re-rolling." },
  { n: "3", title: "Picks + risks shown honestly", body: "Every model pick shows why it could hit and what the risk is. On a thin slate the model holds — no-play discipline over forcing a card." },
  { n: "4", title: "Results settled officially", body: "Cards settle only against official finals. Wins and losses both stay on the page; pending is never counted as a loss." },
];

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>How it works</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Deterministic artifacts · same output for every user</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-3 rounded-[12px] px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)", border: "1px solid var(--vault-rule)" }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display" style={{ background: "var(--vault-success-dim)", color: "var(--vault-success)", fontSize: 13, fontWeight: 800 }}>{s.n}</span>
            <span className="flex flex-col gap-1">
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{s.title}</span>
              <span className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{s.body}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 7 · Footer CTA ───────────────────────────────────────────────────────────
export function FooterCta() {
  const links: { href: string; label: string; primary?: boolean }[] = [
    { href: "/simulate", label: "Start with Simulate", primary: true },
    { href: "/today", label: "Review Today's Picks" },
    { href: "/results", label: "Check Results" },
  ];
  return (
    <section aria-label="Get started" className="flex flex-col items-center gap-3 rounded-[16px] px-5 py-7 text-center"
      style={{ border: "1px solid var(--vault-border-strong)", background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-crown) 6%, transparent), color-mix(in srgb, var(--vault-scrim-base) 35%, transparent))" }}>
      <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px,4.4vw,28px)", fontWeight: 800, lineHeight: 1.08 }}>
        Run a simulation. See the picks. Follow the results.
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
            style={{
              minHeight: 44,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              ...(l.primary
                ? { background: "var(--vault-gold-bright)", color: "var(--vault-on-accent-deep)" }
                : { border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }),
            }}
          >
            {l.label} →
          </Link>
        ))}
      </div>
    </section>
  );
}
