import type { ReactNode } from "react";

/**
 * Honest "what the model learned" card.
 *
 * Lives at the bottom of Results experiences (global + per-sport) so
 * the audit page surfaces a few specific lessons the model encoded
 * from settled slates. Strictly factual — every claim must trace back
 * to settled W-L/decisive counts. No betting hype copy. No invented
 * patterns.
 *
 * Use approved language only ("clean leans", "model anomaly",
 * "risk-aware", etc.). Caller passes the bullets so we can tailor to
 * each sport without rebuilding the component.
 */
export interface ModelLesson {
  /** Short eyebrow above the lesson, e.g. "MLB · model anomaly cap" */
  eyebrow: string;
  /** Lesson statement — what the audit showed. */
  text: ReactNode;
  /** Optional caveat — sample size, scope, single-slate disclaimer. */
  caveat?: ReactNode;
  /** Tone for the eyebrow tint. */
  tone?: "gold" | "success" | "warn";
}

export default function ModelLessonsCard({
  title = "Model lessons from settled slates",
  lessons,
  footnote,
}: {
  title?: string;
  lessons: ModelLesson[];
  footnote?: ReactNode;
}) {
  if (lessons.length === 0) return null;
  return (
    <section className="mt-10">
      <div
        className="rounded-[6px] px-5 py-5"
        style={{
          background: "rgba(7, 11, 26, 0.55)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 6px rgba(240, 199, 94, 0.4)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            {title}
          </span>
        </div>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {lessons.map((l, i) => {
            const eyebrowColor =
              l.tone === "success"
                ? "var(--vault-success)"
                : l.tone === "warn"
                  ? "var(--vault-warn)"
                  : "var(--vault-gold-bright)";
            return (
              <li
                key={i}
                className="rounded-[4px] px-4 py-3"
                style={{
                  background: "rgba(7, 11, 26, 0.45)",
                  border: "1px solid var(--vault-rule)",
                }}
              >
                <div
                  className="font-mono uppercase tracking-[0.14em] mb-1"
                  style={{ color: eyebrowColor, fontSize: 9 }}
                >
                  {l.eyebrow}
                </div>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--vault-text)" }}
                >
                  {l.text}
                </p>
                {l.caveat && (
                  <p
                    className="mt-1 text-[11px] leading-relaxed"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    {l.caveat}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {footnote && (
          <p
            className="mt-3 text-[11px] leading-relaxed"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
