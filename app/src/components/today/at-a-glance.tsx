/**
 * TodayAtAGlance — Section 2 of the Daily Model Hub. 3–5 compact status cards, each a single canonical
 * figure + a short sub-line + a tap-through CTA (Simulations ready → /simulate, Top model reads → the
 * Top-picks section, Bank Builder → /bank-builder, Build-a-Pick → /picks, Results → /results).
 *
 * Presentational only: every `value`/`sub` is pre-formatted upstream by the server page from canonical
 * loaders. This component hardcodes no count, dollar value, step, or record. An in-page anchor href
 * (starting with "#") scrolls to a section rather than navigating.
 */
import Link from "next/link";

export interface GlanceCard {
  /** Short uppercase label, e.g. "Simulations". */
  label: string;
  /** The single canonical figure/status line, pre-formatted (e.g. "2 ready", "No-play"). */
  value: string;
  /** One-line context, pre-formatted (e.g. "awaiting Step 3 · $0"). */
  sub: string;
  /** Destination — a route ("/simulate") or an in-page anchor ("#top-model-picks"). */
  href: string;
  /** Muted tone for a no-play / empty figure; gold otherwise. */
  tone?: "gold" | "mute" | "success";
}

function valueColor(tone: GlanceCard["tone"]): string {
  if (tone === "mute") return "var(--vault-text-mute)";
  if (tone === "success") return "var(--vault-success)";
  return "var(--vault-gold-bright)";
}

function GlanceTile({ card }: { card: GlanceCard }) {
  const inner = (
    <>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{card.label}</span>
      <span className="font-display tracking-tight" style={{ color: valueColor(card.tone), fontSize: 16, fontWeight: 800, lineHeight: 1.1 }}>{card.value}</span>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.25 }}>{card.sub}</span>
    </>
  );
  const cls = "vault-glow-hover vault-press rounded-[12px] px-3 py-3 flex flex-col gap-1";
  const style = { background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", textDecoration: "none", minHeight: 44 } as const;
  // In-page anchors use a plain <a> (Next <Link> is for route navigation); routes use <Link>.
  return card.href.startsWith("#") ? (
    <a href={card.href} className={cls} style={style}>{inner}</a>
  ) : (
    <Link href={card.href} className={cls} style={style}>{inner}</Link>
  );
}

export default function TodayAtAGlance({ cards }: { cards: GlanceCard[] }) {
  return (
    <section aria-label="Today at a glance" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Today at a glance</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>paper-only</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {cards.map((c) => (
          <GlanceTile key={c.label} card={c} />
        ))}
      </div>
    </section>
  );
}
