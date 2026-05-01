import Link from "next/link";
import { getBoard, getHitRates, getMeta } from "@/lib/data";
import { formatPercent, formatDateLong } from "@/lib/format";
import KpiTile from "@/components/kpi-tile";

export default function HomePage() {
  const board = getBoard();
  const hitRates = getHitRates();
  const meta = getMeta();

  const leansToday = board.leans.filter((l) => l.lean !== "No Play").length;
  const highConfidence = board.leans.filter(
    (l) => l.lean !== "No Play" && l.confidence === "High"
  ).length;

  const highConfBucket = hitRates.byConfidence.find((b) => b.label === "High");

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:py-20">
      {/* Hero */}
      <section className="reveal">
        <div className="eyebrow mb-5 flex items-center gap-2">
          <span className="live-dot" />
          model board live · {formatDateLong(board.generatedFor)}
        </div>
        <h1 className="font-display text-[44px] md:text-[72px] leading-[0.95] tracking-tightest font-semibold text-[var(--text)] max-w-4xl">
          Transparent model leans on{" "}
          <span style={{ color: "var(--lime)" }}>NBA player props.</span>
        </h1>
        <p className="mt-6 text-[var(--text-mute)] text-[16px] md:text-[18px] max-w-2xl leading-relaxed">
          GametimePicks compares model projections against sportsbook lines,
          surfaces edges with explanations, and tracks every result publicly.
          Educational analytics — not betting advice.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] bg-[var(--lime)] text-[var(--bg)] font-medium text-[14px] tracking-tight hover:bg-[#B5EE52] transition-colors"
          >
            View today's board
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] border border-[var(--border-strong)] text-[var(--text)] font-medium text-[14px] tracking-tight hover:bg-[var(--hover)] transition-colors"
          >
            How the model works
          </Link>
        </div>
      </section>

      {/* KPI strip */}
      <section className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="leans today" value={String(leansToday)} delay={1} />
        <KpiTile label="high confidence" value={String(highConfidence)} delay={2} />
        <KpiTile
          label="overall hit rate"
          value={formatPercent(hitRates.overall.hitRate)}
          sub={`across ${hitRates.overall.total} leans`}
          delay={3}
        />
        <KpiTile
          label="high-conf hit rate"
          value={highConfBucket ? formatPercent(highConfBucket.hitRate) : "—"}
          delay={4}
        />
      </section>

      {/* Three-up explanation */}
      <section className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        <ExplainerCard
          n="01"
          title="Compare projection to line"
          body="For each NBA player prop, the model produces a projected stat value and over/under probability. We pull the sportsbook line and convert the odds to an implied probability."
          delay={1}
        />
        <ExplainerCard
          n="02"
          title="Quantify the edge"
          body="Edge = model probability minus implied probability. Positive edge means the model thinks the market is mispricing the prop. We surface only edges that clear a transparent threshold."
          delay={2}
        />
        <ExplainerCard
          n="03"
          title="Track every result"
          body="Every lean is logged before tipoff and settled after the box score. Hit rate, calibration, and breakdown by market and confidence tier are all public."
          delay={3}
        />
      </section>

      {/* Demo banner if applicable */}
      {meta.isDemo && (
        <section className="mt-16 surface px-6 py-5 reveal">
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-[var(--amber)] font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[var(--amber-dim)]">
              demo data
            </div>
            <div className="flex-1 min-w-[280px] text-[13px] text-[var(--text-mute)] leading-relaxed">
              This deployment is running on bundled demo data for offline development
              and previews. Configure <span className="font-mono text-[var(--text)]">ODDS_API_KEY</span>{" "}
              in <span className="font-mono text-[var(--text)]">.env</span> and run{" "}
              <span className="font-mono text-[var(--text)]">scripts/run_pipeline.sh</span>{" "}
              to generate a live board.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ExplainerCard({
  n,
  title,
  body,
  delay,
}: {
  n: string;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <div className={`surface p-6 reveal reveal-d${delay}`}>
      <div className="font-mono text-[11px] text-[var(--lime)] tracking-wider mb-3">
        {n}
      </div>
      <h3 className="font-display text-[20px] font-semibold tracking-tight mb-2">
        {title}
      </h3>
      <p className="text-[14px] text-[var(--text-mute)] leading-relaxed">{body}</p>
    </div>
  );
}
