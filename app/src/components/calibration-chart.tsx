/**
 * CalibrationChart — predicted vs actual probability for the model.
 *
 * Each point is a probability bucket: x = mean predicted prob, y = observed
 * hit rate. A perfectly calibrated model lies on y=x. Buckets above the
 * line mean we under-predicted; buckets below mean we over-predicted.
 *
 * Pure SVG. Bucket size scales by sample count.
 */
import type { CalibrationBucket } from "@/lib/types";

interface Props {
  buckets: CalibrationBucket[];
  size?: number;
}

export default function CalibrationChart({ buckets, size = 280 }: Props) {
  if (!buckets || buckets.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px] text-[var(--text-faint)] font-mono">
        No calibration data yet.
      </div>
    );
  }

  // Domain: 0.40 to 0.80 (the realistic range for de-vigged binary probs)
  const xMin = 0.40, xMax = 0.80;
  const yMin = 0.40, yMax = 0.80;
  const pad = 32;
  const inner = size - pad * 2;

  const xFor = (p: number) =>
    pad + ((p - xMin) / (xMax - xMin)) * inner;
  const yFor = (p: number) =>
    pad + inner - ((p - yMin) / (yMax - yMin)) * inner;

  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const radiusFor = (count: number) => {
    const norm = totalCount > 0 ? count / totalCount : 0;
    return 4 + norm * 12;   // 4-16 px
  };

  const ticks = [0.4, 0.5, 0.6, 0.7, 0.8];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} role="img" aria-label="Model calibration: predicted vs actual probability">
        {/* Grid */}
        {ticks.map((t) => (
          <g key={`grid-${t}`}>
            <line
              x1={xFor(t)} y1={pad}
              x2={xFor(t)} y2={pad + inner}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
            <line
              x1={pad} y1={yFor(t)}
              x2={pad + inner} y2={yFor(t)}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          </g>
        ))}

        {/* Y=X reference line */}
        <line
          x1={xFor(xMin)} y1={yFor(yMin)}
          x2={xFor(xMax)} y2={yFor(yMax)}
          stroke="var(--text-faint)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Axis labels */}
        {ticks.map((t) => (
          <text
            key={`x-tick-${t}`}
            x={xFor(t)}
            y={pad + inner + 14}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill="var(--text-faint)"
          >
            {(t * 100).toFixed(0)}%
          </text>
        ))}
        {ticks.map((t) => (
          <text
            key={`y-tick-${t}`}
            x={pad - 6}
            y={yFor(t) + 3}
            textAnchor="end"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill="var(--text-faint)"
          >
            {(t * 100).toFixed(0)}%
          </text>
        ))}

        {/* X axis label */}
        <text
          x={pad + inner / 2}
          y={size - 4}
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--text-faint)"
          style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          predicted
        </text>
        {/* Y axis label (rotated) */}
        <text
          x={10}
          y={pad + inner / 2}
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--text-faint)"
          transform={`rotate(-90, 10, ${pad + inner / 2})`}
          style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          actual
        </text>

        {/* Buckets */}
        {buckets.map((b, i) => (
          <g key={i}>
            <circle
              cx={xFor(b.predictedAvg)}
              cy={yFor(b.actualAvg)}
              r={radiusFor(b.count)}
              fill="var(--lime)"
              fillOpacity={0.3}
              stroke="var(--lime)"
              strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>

      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        bucket size = sample count · dashed line = perfect calibration
      </div>
    </div>
  );
}
