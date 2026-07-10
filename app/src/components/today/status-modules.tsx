/**
 * Daily Model Hub status modules — Sections 5–10, compact and prop-driven. NONE of these read fs/data or
 * hardcode a count, dollar value, step, or record: every figure arrives pre-formatted from the server
 * page's canonical loaders.
 *
 *   5 · BuildAPickModule   — daily builder status + suggested-card count → /picks (label "Build-a-Pick").
 *   6 · BankBuilderStatus  — step + status + stake/rolled + open exposure + no-play reason → /bank-builder.
 *   7 · LongshotLabStatus  — no-play / unavailable / active + reason → /moonshot (label "Longshot Lab").
 *   8 · NoPlayNotes        — trust-building discipline notes (no-play is a decision, not a failure).
 *   9 · ResultsReminder    — record + pending-vs-settled + official-settlement-only → /results.
 *  10 · SecondaryLinks     — compact link cards out to the rest of the site.
 */
import Link from "next/link";

// ── Shared compact status card ───────────────────────────────────────────────
function StatusCard({
  eyebrow,
  title,
  value,
  valueTone = "gold",
  lines,
  ctaLabel,
  ctaHref,
  accent = "var(--gtp-bank-heat)",
}: {
  eyebrow: string;
  title: string;
  value: string;
  valueTone?: "gold" | "mute" | "success";
  lines: string[];
  ctaLabel: string;
  ctaHref: string;
  accent?: string;
}) {
  const vColor = valueTone === "mute" ? "var(--vault-text-mute)" : valueTone === "success" ? "var(--vault-success)" : "var(--vault-gold-bright)";
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-[14px] px-5 py-4"
      style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${accent}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{eyebrow}</span>
        <Link href={ctaHref} className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10, textDecoration: "none" }}>{ctaLabel} →</Link>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span className="font-display tracking-tight" style={{ color: vColor, fontSize: 15, fontWeight: 800 }}>{value}</span>
      </div>
      {lines.map((l, i) => (
        <span key={i} style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.3 }}>{l}</span>
      ))}
    </section>
  );
}

// ── 5 · Build-a-Pick module ──────────────────────────────────────────────────
export function BuildAPickModule({ status, suggestedLine, note }: { status: string; suggestedLine: string; note: string }) {
  return (
    <StatusCard
      eyebrow="Build a card"
      title="Picks Lab"
      value={status}
      valueTone={/no|none|0/i.test(status) ? "mute" : "gold"}
      lines={[suggestedLine, note]}
      ctaLabel="Open Picks Lab"
      ctaHref="/picks"
    />
  );
}

// ── 6 · Bank Builder status ──────────────────────────────────────────────────
export function BankBuilderStatus({ statusValue, stepLine, exposureLine, reason }: { statusValue: string; stepLine: string; exposureLine: string; reason: string }) {
  return (
    <StatusCard
      eyebrow="The disciplined ladder"
      title="Bank Builder"
      value={statusValue}
      valueTone={/no-play|no active|awaiting/i.test(statusValue) ? "mute" : "success"}
      lines={[stepLine, exposureLine, reason]}
      ctaLabel="View Bank Builder"
      ctaHref="/bank-builder"
      accent="var(--vault-gold)"
    />
  );
}

// ── 7 · Longshot Lab status ──────────────────────────────────────────────────
export function LongshotLabStatus({ statusValue, reason }: { statusValue: string; reason: string }) {
  return (
    <StatusCard
      eyebrow="High-variance lane"
      title="Moonshot"
      value={statusValue}
      valueTone={/no-play|unavailable|no active/i.test(statusValue) ? "mute" : "gold"}
      lines={[reason]}
      ctaLabel="View Moonshot"
      ctaHref="/moonshot"
      accent="#6d5fd0"
    />
  );
}

// ── 8 · No-play / unavailable notes ──────────────────────────────────────────
export function NoPlayNotes({ notes }: { notes: string[] }) {
  return (
    <section aria-label="No-play and unavailable notes" className="flex flex-col gap-2 rounded-[14px] px-5 py-4" style={{ border: "1px solid var(--vault-rule)", background: "rgba(26,16,11,0.35)" }}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>Discipline notes</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>No-play is a decision, not a failure</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-2" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.35 }}>
            <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>·</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 9 · Results / settlement reminder ────────────────────────────────────────
export function ResultsReminder({ recordLabel, pendingLine }: { recordLabel: string | null; pendingLine: string | null }) {
  return (
    <section aria-label="Results and settlement reminder" className="flex flex-col gap-2 rounded-[14px] px-5 py-4" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.55)", borderTop: "2px solid var(--vault-success)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Transparent receipts</span>
        <Link href="/results" className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10, textDecoration: "none" }}>View Results →</Link>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Track record</span>
        {recordLabel ? (
          <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-gold-bright)", fontSize: 17, fontWeight: 800 }}>{recordLabel}</span>
        ) : null}
      </div>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.35 }}>
        {pendingLine ? `${pendingLine} — ` : ""}every card is graded from official box scores only. Pending cards are never counted as losses, and both wins and losses stay on the page.
      </span>
    </section>
  );
}

// ── 10 · Secondary links ─────────────────────────────────────────────────────
export interface SecondaryLink { href: string; label: string; sub: string }

export function SecondaryLinks({ links }: { links: SecondaryLink[] }) {
  return (
    <section aria-label="More on GameTime Picks" className="flex flex-col gap-2.5">
      <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Explore the rest</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="vault-glow-hover vault-press rounded-[12px] px-3 py-3 flex flex-col gap-0.5"
            style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none", minHeight: 44 }}
          >
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{l.label}</span>
            <span className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{l.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
