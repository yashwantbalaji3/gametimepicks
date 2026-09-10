/**
 * THE MODEL'S STRONGEST READS — cross-sport on the homepage, per-sport on each hub.
 *
 * Ranked by the MODEL'S OWN probability, never by a gap against a price. A gap is a claim that the
 * market is wrong and we have not established that for any sport — MLB's markets were measured and
 * demoted to market context, EPL's model has never been scored against a line, and only UFC's has
 * cleared a preregistered bar. A probability is just what the simulator says.
 *
 * Every sport's proven state renders BESIDE its reads rather than in a footnote, because "62%" means
 * something different coming from a model that cleared its bar than from one that has never been
 * measured, and a ranked list that mixed them silently would average that difference away.
 */
import Link from "next/link";

import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import SectionHeader from "@/components/section-header";
import type { TopRead, TopReadsSet } from "@/lib/top-reads";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** "Sat, Sep 12" from an ET date string — UTC-noon math so the day never shifts. */
const shortEtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const SPORT_KEY: Record<string, "mlb" | "nfl" | "soccer"> = { mlb: "mlb", epl: "soccer" };

function ReadRow({ r }: { r: TopRead }) {
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {/* Identity by what the read IS: a fighter is a person, a game total is a matchup. */}
        {r.sport === "ufc" ? (
          <PlayerAvatar playerName={r.subject} photoUrl={r.photoUrl ?? undefined} size="xs" flat />
        ) : r.team && SPORT_KEY[r.sport] ? (
          <TeamLogo team={r.team} sport={SPORT_KEY[r.sport]} size="sm" ariaLabel={r.team} />
        ) : null}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--vault-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.headline}
          </span>
          <span className="font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            {/* A future read wears its date (P241 · A01): "today" panels may show what is next,
                but never as if it plays today. */}
            {r.timeframe === "upcoming" && r.eventEtDate ? (
              <span style={{ color: "var(--vault-gold-bright)", fontWeight: 700 }}>{shortEtDate(r.eventEtDate)} · </span>
            ) : null}
            {r.sportLabel} · {r.market}{r.context ? ` · ${r.context}` : ""}
          </span>
        </span>
      </span>
      <span className="font-mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--gtp-bank-cta)", flexShrink: 0 }}>{pct(r.probability)}</span>
    </>
  );
  const style = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: "1px solid var(--vault-rule)" } as const;
  return r.href ? <Link href={r.href} style={{ ...style, textDecoration: "none" }}>{body}</Link> : <div style={style}>{body}</div>;
}

export default function TopReadsPanel({
  set, reads, eyebrow, title, sub, groupBySport = false, compact = false, domId,
}: {
  set: TopReadsSet;
  reads: TopRead[];
  eyebrow: string;
  title: string;
  sub?: string;
  /**
   * P201 (charter C): render sport group headers with HONEST counts between the rows — the
   * per-sport Top 10 view over the same ranked set. One panel, one footer, one paper-only line;
   * grouping is presentation, never a second ranking.
   */
  groupBySport?: boolean;
  /**
   * P243 · A-1: when a page renders TWO panels (today + upcoming), the second omits the
   * provenance/excluded/paper-only boilerplate — it repeats the first panel's verbatim and blew
   * the homepage's frozen word budget. Compact is presentation only; the ranking is unchanged.
   */
  compact?: boolean;
  /**
   * The section's DOM id. Defaults to "top-reads", which is what today/top-reads-filter.tsx scrolls
   * to. P253: when the homepage renders both panels — today and upcoming — the hardcoded id
   * appeared TWICE in the built page. Two elements sharing an id is invalid, and the filter's
   * `#top-reads` jump resolved to whichever came first by accident rather than by intent. The
   * caller now says which one it is, and the anchor keeps meaning the today panel.
   */
  domId?: string;
}) {
  if (reads.length === 0) return null;
  const sports = [...new Set(reads.map((r) => r.sport))];
  const hasToday = reads.some((r) => r.timeframe === "today");
  return (
    <section className="mt-8" id={domId ?? "top-reads"}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        sub={sub ?? (hasToday
          ? "What each simulation is most confident about today, ranked by the model's own probability — not by any gap against a sportsbook price. A watchlist, not a bet."
          : "Nothing plays today — these are the model's next dated reads, ranked by its own probability. Not a gap against any sportsbook price; a watchlist, not a bet.")}
      />
      <div className="mt-3 rounded-[12px] overflow-hidden" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
        {reads.map((r, i) => (
          <span key={`${r.sport}-${r.market}-${r.subject}-${i}`} style={{ display: "contents" }}>
            {groupBySport && (i === 0 || reads[i - 1]!.sport !== r.sport) ? (
              <div
                className="font-mono uppercase tracking-[0.12em]"
                style={{ padding: "8px 12px 4px", fontSize: 10, color: "var(--vault-text-faint)", borderTop: i > 0 ? "1px solid var(--vault-rule)" : "none" }}
              >
                {r.sportLabel} — top {reads.filter((x) => x.sport === r.sport).length}
              </div>
            ) : null}
            <ReadRow r={r} />
          </span>
        ))}
      </div>

      {/* WHAT EACH MODEL HAS ACTUALLY PROVEN — beside the numbers, not beneath a fold. */}
      {compact ? null : (
      <div className="mt-3" style={{ display: "grid", gap: 6 }}>
        {set.provenance.filter((p) => sports.includes(p.sport as TopRead["sport"])).map((p) => (
          <p key={p.sport} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
            <strong style={{ color: "var(--vault-text-mute)", textTransform: "uppercase", fontSize: 10 }}>{p.sport}</strong> — {p.state}
          </p>
        ))}
        {/* A sport left out is NAMED, with the reason. Silence would read as "nothing to say today". */}
        {set.excluded.map((e) => (
          <p key={e.sport} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
            <strong style={{ color: "var(--vault-text-mute)", textTransform: "uppercase", fontSize: 10 }}>{e.sport}</strong> — not listed: {e.reason}
          </p>
        ))}
      </div>
      )}

      {compact ? null : (
      <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. Nothing here is a pick or a recommendation to wager, and no stake is
        filled in anywhere on this site.
      </p>
      )}
    </section>
  );
}
