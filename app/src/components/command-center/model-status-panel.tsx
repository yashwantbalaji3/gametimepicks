/**
 * ModelStatusPanel — the full P309 surface for a sport hub: every status family with its evidence sentence and a
 * "What does this mean?" disclosure, in the same public vocabulary the homepage chips use. Purely presentational:
 * items arrive from lib/command-center/model-status.ts; this file holds no figure and no rule.
 */
import Link from "next/link";
import type { ModelStatusItem } from "@/lib/command-center/contract";
import { PUBLIC_STATE_LABEL, PUBLIC_STATE_MEANING } from "@/lib/command-center/contract";
import ModelStatusChip from "./model-status-chip";

export default function ModelStatusPanel({ items, sportLabel, id = "model-status" }: { items: ModelStatusItem[]; sportLabel: string; id?: string }) {
  if (!items.length) return null;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 flex flex-col gap-2 rounded-[12px] px-4 py-3.5" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id={`${id}-h`} className="font-mono uppercase tracking-[0.14em] m-0" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Model status · {sportLabel}</h2>
        <Link href="/methodology/#model-status" className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>What the statuses mean →</Link>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{s.family}</span>
              <ModelStatusChip state={s.state} label={PUBLIC_STATE_LABEL[s.state]} />
            </div>
            <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{s.headline}</span>
            <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{s.detail}</p>
            <details>
              <summary className="cursor-pointer list-none font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>What does this mean?</summary>
              <p className="m-0 mt-1 text-[12px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{PUBLIC_STATE_MEANING[s.state]}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
