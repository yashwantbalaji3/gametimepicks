/**
 * WcBracketContext — honest "path to the final" for the knockout endgame. Shows the REAL semifinals
 * (from the committed projection) advancing to a Final and a Third-place playoff whose participants are
 * TBD until the semifinals are played. NEVER invents a finalist or a matchup before it's decided.
 *
 * Pure/presentational: it renders the fixtures + dates it is handed. Finalists are always shown as TBD.
 */

export interface BracketFixture {
  home: string;
  away: string;
  /** e.g. "Tue, Jul 14". */
  dateLabel: string;
}

export interface WcBracketContextProps {
  /** Real semifinal fixtures (from the projection). Up to two. */
  semifinals: BracketFixture[];
  /** Final date label, e.g. "Jul 19" (from the public tournament calendar). */
  finalDateLabel?: string;
  /** Third-place date label, e.g. "Jul 18". */
  thirdPlaceDateLabel?: string;
}

function Node({ title, line, sub, tone = "text" }: { title: string; line: string; sub?: string; tone?: "text" | "gold" | "faint" }) {
  const color = tone === "gold" ? "var(--vault-gold)" : tone === "faint" ? "var(--vault-text-faint)" : "var(--vault-text)";
  return (
    <div className="rounded-[10px] px-3 py-2.5 flex flex-col gap-0.5" style={{ background: "rgba(11, 18, 14,0.5)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{title}</span>
      <span style={{ color, fontSize: 13, fontWeight: 600 }}>{line}</span>
      {sub ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{sub}</span> : null}
    </div>
  );
}

export default function WcBracketContext({ semifinals, finalDateLabel, thirdPlaceDateLabel }: WcBracketContextProps) {
  return (
    <section aria-label="Path to the final" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
          Path to the final
        </h2>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Each semifinal winner advances to the final; the two losers meet in the third-place playoff. Finalists
          are <span style={{ color: "var(--vault-text)" }}>TBD until the semifinals are played</span> — no matchup
          is shown before it&rsquo;s decided.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="flex flex-col gap-2">
          {semifinals.length > 0 ? (
            semifinals.map((s, i) => (
              <Node key={`${s.home}-${s.away}`} title={`Semifinal ${i + 1}`} line={`${s.home} vs ${s.away}`} sub={s.dateLabel} tone="gold" />
            ))
          ) : (
            <Node title="Semifinals" line="Fixtures pending" sub="awaiting the quarterfinal results" tone="faint" />
          )}
        </div>
        <Node
          title="Final"
          line="Winner SF1 vs Winner SF2"
          sub={`TBD${finalDateLabel ? ` · ${finalDateLabel}` : ""} — set after the semifinals`}
          tone="faint"
        />
        <Node
          title="Third-place playoff"
          line="Loser SF1 vs Loser SF2"
          sub={`TBD${thirdPlaceDateLabel ? ` · ${thirdPlaceDateLabel}` : ""} — set after the semifinals`}
          tone="faint"
        />
      </div>
    </section>
  );
}
