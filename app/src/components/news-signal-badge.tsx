import type { NewsSignal } from "@/lib/types";

interface Props {
  signals: NewsSignal[];
}

/**
 * NewsSignalBadge — displays manual-override signals attached to a lean.
 *
 * Phase 7B-1: only manual overrides are supported, so every signal here
 * has manuallyConfirmed=true. Each badge shows source name + tag the
 * user can verify the URL for.
 */
export default function NewsSignalBadge({ signals }: Props) {
  if (!signals || signals.length === 0) return null;

  // Show the highest-impact signal first
  const sorted = [...signals].sort((a, b) => {
    const impactRank = { high: 3, medium: 2, low: 1 } as const;
    return impactRank[b.impact] - impactRank[a.impact];
  });

  return (
    <div className="mt-2 flex flex-col gap-1">
      {sorted.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-2 rounded-[2px] px-2 py-1.5 border-l-2"
          style={{
            borderLeftColor:
              s.impact === "high"
                ? "var(--rose)"
                : s.impact === "medium"
                ? "var(--amber)"
                : "var(--text-faint)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-faint)] mt-0.5 shrink-0">
            {s.manuallyConfirmed ? "manual" : "auto"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[var(--text-mute)] leading-snug">
              <span className="font-semibold text-[var(--text)]">
                {s.sourceName}
              </span>
              {s.updateType !== "other" && (
                <span className="font-mono text-[10px] text-[var(--text-faint)] uppercase tracking-wider ml-1.5">
                  · {s.updateType}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--text-mute)] leading-snug mt-0.5 truncate">
              {s.note}
            </div>
            {s.sourceUrl && (
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-faint)] hover:text-[var(--lime)] mt-0.5 inline-block"
              >
                source ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
