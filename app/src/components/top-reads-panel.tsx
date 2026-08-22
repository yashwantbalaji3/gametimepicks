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
  set, reads, eyebrow, title, sub,
}: {
  set: TopReadsSet;
  reads: TopRead[];
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  if (reads.length === 0) return null;
  const sports = [...new Set(reads.map((r) => r.sport))];
  return (
    <section className="mt-8" id="top-reads">
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        sub={sub ?? "What each simulation is most confident about today, ranked by the model's own probability — not by any gap against a sportsbook price. A watchlist, not a bet."}
      />
      <div className="mt-3 rounded-[12px] overflow-hidden" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
        {reads.map((r, i) => <ReadRow key={`${r.sport}-${r.market}-${r.subject}-${i}`} r={r} />)}
      </div>

      {/* WHAT EACH MODEL HAS ACTUALLY PROVEN — beside the numbers, not beneath a fold. */}
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

      <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. Nothing here is a pick or a recommendation to wager, and no stake is
        filled in anywhere on this site.
      </p>
    </section>
  );
}
