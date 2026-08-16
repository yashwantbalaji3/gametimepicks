"use client";

/**
 * HowToRead — a compact, expandable "How to read this" legend. Renders a preset (or an explicit list) of
 * glossary terms so every major surface can explain edge / EV / confidence / market % / model % / no-play
 * / pending / paper-only in one consistent place. Short definitions show by default; the full detail is a
 * native <details> disclosure (keyboard-accessible, no JS state needed for correctness).
 *
 * Pure presentation over the shared glossary — no data fetching, no predictions, safe to drop anywhere.
 */
import { legendPreset, type GlossaryTerm, type LEGEND_PRESETS } from "../lib/glossary";

export default function HowToRead({
  preset,
  terms,
  title = "How to read this",
}: {
  preset?: keyof typeof LEGEND_PRESETS;
  terms?: GlossaryTerm[];
  title?: string;
}) {
  const items = terms ?? (preset ? legendPreset(preset) : []);
  if (!items.length) return null;

  return (
    <details
      className="gtp-how-to-read rounded-[10px] my-3"
      style={{ border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.5)" }}
    >
      <summary
        className="cursor-pointer select-none px-4 py-2.5 flex items-center gap-2 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 11, minHeight: 44 }}
      >
        <span aria-hidden>ⓘ</span>
        {title}
        <span className="ml-auto font-sans normal-case tracking-normal" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
          paper-only · educational
        </span>
      </summary>
      <dl className="px-4 pb-3 pt-1 grid gap-2.5" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        {items.map((t) => (
          <div key={t.id} className="grid gap-0.5">
            <dt className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>{t.term}</dt>
            <dd className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              {t.short}
              {t.long && t.long !== t.short && (
                <span className="block mt-0.5 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>{t.long}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
