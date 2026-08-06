/**
 * MODEL / MARKET COMPARISON — Game Report section (Sprint 030 · Phase 1).
 *
 * Renders the canonical `GameIntelligence` object built by lib/markets/game-intelligence — the SAME
 * builder that powers /markets. No sportsbook math happens here, and no eligibility decision either:
 * this component never chooses whether a comparison is allowed, it only draws what the pairing
 * layer already decided. That is what keeps the report and Market Center from disagreeing about the
 * same event.
 *
 * A difference is a neutral percentage-point gap. Per lib/mlb/model-calibration-status no
 * GameTimePicks model has been validated to out-predict the sportsbook, so a gap is a disagreement
 * worth reading, never an advantage — and there is deliberately no helper here that ranks a side.
 */
import type { GameIntelligence } from "@/lib/markets/game-intelligence";

const pct = (p: number | null | undefined, digits = 1) =>
  typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : "—";

const odds = (o: number | null | undefined) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0 ? (o > 0 ? `+${o}` : `${o}`) : "—";

function Gap({ points }: { points: number }) {
  return (
    <span className="font-mono" style={{ fontSize: 11, color: Math.abs(points) < 1 ? "var(--vault-text-mute)" : "var(--vault-text)" }}>
      {points > 0 ? "+" : ""}
      {points.toFixed(1)} pp
    </span>
  );
}

function Line({
  label,
  model,
  market,
  price,
  gap,
}: {
  label: string;
  model?: string;
  market?: string;
  price?: string;
  gap?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2" style={{ padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{label}</span>
      <span className="flex items-baseline gap-3 font-mono" style={{ fontSize: 12 }}>
        {model ? <span style={{ color: "var(--vault-text)" }}>{model}</span> : null}
        {market ? <span style={{ color: "var(--vault-text-mute)" }}>{market}</span> : null}
        {price ? <span style={{ color: "var(--vault-text-faint)" }}>{price}</span> : null}
        {typeof gap === "number" ? <Gap points={gap} /> : null}
      </span>
    </div>
  );
}

function Block({ title, mode, children }: { title: string; mode: string; children: React.ReactNode }) {
  const tone =
    mode === "FULL_COMPARISON"
      ? "var(--vault-success)"
      : mode === "SPORTSBOOK_ONLY"
        ? "var(--vault-text-mute)"
        : "var(--vault-text-faint)";
  return (
    <div style={{ border: "1px solid var(--vault-rule)", borderRadius: 8, padding: 10 }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
        <span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 9.5, color: "var(--vault-gold)" }}>
          {title}
        </span>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 8.5, color: tone }}>
          {mode === "FULL_COMPARISON" ? "Model + market" : mode === "SPORTSBOOK_ONLY" ? "Market only" : mode === "MODEL_ONLY" ? "Model only" : "Not available"}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function ModelMarketComparison({
  intel,
  isHistorical,
}: {
  intel: GameIntelligence;
  isHistorical?: boolean;
}) {
  const { moneyline, runLine, total } = intel;
  const anyComparison = Boolean(moneyline.comparison || runLine.comparison || total.comparison);

  return (
    <div className="flex flex-col gap-3">
      {/* Snapshot provenance — artifact-level. Never a per-row "updated N minutes ago". */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ fontSize: 9.5, color: isHistorical ? "var(--vault-warn)" : "var(--vault-success)" }}
        >
          {isHistorical
            ? `Snapshot from ${intel.snapshot.freshness?.artifactDate ?? "an earlier slate"}`
            : "Current snapshot"}
        </span>
        {intel.snapshot.captureLabel ? (
          <span style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>{intel.snapshot.captureLabel}</span>
        ) : null}
        {intel.snapshot.bookmaker ? (
          <span style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>· {intel.snapshot.bookmaker}</span>
        ) : null}
      </div>

      {isHistorical ? (
        <div
          style={{
            border: "1px solid var(--vault-warn)",
            background: "rgba(240, 199, 94, 0.06)",
            borderRadius: 8,
            padding: 10,
            fontSize: 11.5,
            color: "var(--vault-text-mute)",
          }}
        >
          These prices are from an earlier slate, not today&rsquo;s market.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Block title="Moneyline" mode={moneyline.intelligence.mode}>
          {moneyline.model && moneyline.sportsbook ? (
            <>
              <Line
                label={intel.homeTeam}
                model={pct(moneyline.model.homeWinProb)}
                market={pct(moneyline.sportsbook.homeNoVigProb)}
                price={odds(moneyline.sportsbook.homeOdds)}
                gap={moneyline.comparison?.home.differencePoints}
              />
              <Line
                label={intel.awayTeam}
                model={pct(moneyline.model.awayWinProb)}
                market={pct(moneyline.sportsbook.awayNoVigProb)}
                price={odds(moneyline.sportsbook.awayOdds)}
                gap={moneyline.comparison?.away.differencePoints}
              />
            </>
          ) : moneyline.sportsbook ? (
            <>
              <Line label={intel.homeTeam} market={pct(moneyline.sportsbook.homeNoVigProb)} price={odds(moneyline.sportsbook.homeOdds)} />
              <Line label={intel.awayTeam} market={pct(moneyline.sportsbook.awayNoVigProb)} price={odds(moneyline.sportsbook.awayOdds)} />
            </>
          ) : (
            <Muted>No comparable market</Muted>
          )}
        </Block>

        <Block title="Run line" mode={runLine.intelligence.mode}>
          {runLine.model && runLine.sportsbook ? (
            <Line
              label={`${intel.homeTeam} ${runLine.homeLine != null && runLine.homeLine > 0 ? "+" : ""}${runLine.homeLine}`}
              model={pct(runLine.model.homeCoverProb)}
              market={pct(runLine.sportsbook.homeCoverNoVigProb)}
              price={odds(runLine.sportsbook.homeOdds)}
              gap={runLine.comparison?.home.differencePoints}
            />
          ) : runLine.sportsbook ? (
            <Line
              label={`${intel.homeTeam} ${runLine.homeLine ?? ""}`}
              market={pct(runLine.sportsbook.homeCoverNoVigProb)}
              price={odds(runLine.sportsbook.homeOdds)}
            />
          ) : (
            <Muted>No comparable market</Muted>
          )}
          {runLine.intelligence.blockedBy.includes("THRESHOLD_UNSUPPORTED") ? (
            <Muted>The simulation did not publish a cover probability at this line, so no comparison is shown.</Muted>
          ) : null}
        </Block>

        <Block title="Total" mode={total.intelligence.mode}>
          {total.model && total.sportsbook ? (
            <>
              <Line
                label={`Over ${total.line}`}
                model={pct(total.model.overProbExcludingPush)}
                market={pct(total.sportsbook.overNoVigProb)}
                price={odds(total.sportsbook.overOdds)}
                gap={total.comparison?.over.differencePoints}
              />
              <div style={{ fontSize: 10.5, color: "var(--vault-text-faint)", marginTop: 4 }}>
                Simulated median {total.model.medianTotal} · p10&ndash;p90 {total.model.p10}&ndash;{total.model.p90}
                {total.model.pushProb > 0 ? ` · lands exactly on ${total.line} in ${pct(total.model.pushProb)}` : ""}
              </div>
            </>
          ) : total.sportsbook ? (
            <Line label={`Over ${total.line}`} market={pct(total.sportsbook.overNoVigProb)} price={odds(total.sportsbook.overOdds)} />
          ) : (
            <Muted>No comparable market</Muted>
          )}
        </Block>
      </div>

      <p className="m-0" style={{ fontSize: 11, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        {anyComparison ? (
          <>
            Model figures are this game&rsquo;s simulation. Market figures are no-vig probabilities GameTimePicks
            derives from the sportsbook&rsquo;s posted prices &mdash; they are not the book&rsquo;s own numbers. A
            difference is shown in percentage points only: our simulations have not been shown to out-predict the
            sportsbook, so a gap is a disagreement to read, not a recommendation.
          </>
        ) : (
          <>
            No model/market comparison is available for this game. Where the sportsbook posts a market we do not
            model &mdash; or the simulation cannot evaluate the exact posted line &mdash; the price is shown as
            market context only.
          </>
        )}
      </p>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10.5, color: "var(--vault-text-faint)", marginTop: 4 }}>{children}</div>
);
