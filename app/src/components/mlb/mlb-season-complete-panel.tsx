/**
 * The MLB off-season panel — one component for /mlb, /mlb/board and /homer-nukes, so every MLB surface says the same
 * thing in the same words once the season is over. Server component; every fact comes from
 * lib/mlb/season-complete.mjs (committed season-state, schedule captures and graded finals) — none is written here.
 */
import Link from "next/link";

import StatusPill from "@/components/status-pill";
import type { MlbSeasonCompleteCopy } from "@/lib/mlb/season-complete-data";

export default function MlbSeasonCompletePanel({ copy, headingLevel = "h2" }: { copy: MlbSeasonCompleteCopy; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <section
      data-mlb-season-complete
      aria-label="MLB season status"
      className="rounded-[8px] px-5 py-5 flex flex-col gap-2"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill kind="settled" label={copy.pill} />
      </div>
      <Heading className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
        {copy.headline}
      </Heading>
      <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13.5, lineHeight: 1.6 }}>
        {copy.finalLine ? <>{copy.finalLine} </> : null}
        No MLB games are left to play. {copy.returnsLabel}
      </p>
      {copy.recordLine ? (
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
          {copy.recordLine}
        </p>
      ) : null}
      <Link href="/results/mlb" className="font-mono uppercase tracking-[0.14em] no-underline" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        See the full MLB record →
      </Link>
    </section>
  );
}
