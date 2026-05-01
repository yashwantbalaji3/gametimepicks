import { getTrends, getMeta } from "@/lib/data";
import DataSourceBadge from "@/components/data-source-badge";
import TrendsClient from "@/components/trends-client";

export default function TrendsPage() {
  const data = getTrends();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12">
      <div className="reveal">
        <div className="eyebrow">player trends</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          Recent form and splits
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[14px] max-w-2xl leading-relaxed">
          Rolling averages, home/away splits, and recent game logs for players
          appearing on today's board. Sparkline shows the last games in the
          selected market.
        </p>
      </div>

      <div className="mt-6 reveal reveal-d1">
        <DataSourceBadge meta={meta} />
      </div>

      <TrendsClient players={data.players} />
    </div>
  );
}
