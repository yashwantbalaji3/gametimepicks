/**
 * Retrospective model replay section on /results.
 *
 * Honest contract: every visible element of this section is
 * explicitly labeled "Replay · not official". Numbers shown here are
 * **never** counted in the lifetime hit rate; they exist so users
 * can see what the model would have suggested with the same-game
 * cap relaxed for a single-game slate. The rule diff is shown
 * inline, not hidden in a tooltip.
 *
 * Collapsed by default. The summary line is the only thing that
 * shows when collapsed.
 */
import type { ReplayPayload } from "@/lib/data-replay";

interface Props {
  replay: ReplayPayload;
}

export default function ReplaySection({ replay }: Props) {
  const { date, replayMeta, summary, slips } = replay;
  const wins = slips.filter((s) => s.status === "win");
  const losses = slips.filter((s) => s.status === "loss");
  const pending = slips.filter((s) => s.status === "pending");
  return (
    <section
      aria-label={`Retrospective model replay for ${date}`}
      className="rounded-[8px] p-4 flex flex-col gap-2"
      style={{
        background: "rgba(7,11,26,0.4)",
        border: "1px solid var(--vault-warn)",
        borderStyle: "dashed",
      }}
    >
      <details>
        <summary
          className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-warn)", fontSize: 10 }}
            >
              Retrospective model replay · {date} · not official
            </span>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 14 }}
            >
              {summary.wins}W · {summary.losses}L · {summary.pending} pending ·{" "}
              {(summary.hitRate * 100).toFixed(1)}% hit rate on{" "}
              {summary.decisive} decisive
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {" "}({slips.length} replay slips)
              </span>
            </span>
          </div>
          <span
            className="font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-full shrink-0"
            style={{
              color: "var(--vault-warn)",
              border: "1px solid var(--vault-warn)",
              fontSize: 10,
            }}
          >
            Replay · not official
          </span>
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          <p
            className="text-[12px] leading-snug"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {replayMeta.label}
          </p>

          <details
            className="rounded-[4px] p-2"
            style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--vault-rule)" }}
          >
            <summary
              className="font-mono uppercase tracking-[0.14em] cursor-pointer"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              Why this exists + exact rule diff
            </summary>
            <p
              className="mt-2 text-[12px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {replayMeta.rationale}
            </p>
            <ul
              className="mt-2 flex flex-col gap-1 text-[12px] font-mono"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {Object.entries(replayMeta.ruleOverrides).map(([prof, diff]) => (
                <li key={prof} className="flex gap-2">
                  <span style={{ color: "var(--vault-text-faint)" }}>
                    {prof}:
                  </span>
                  <span>
                    max_legs_per_game{" "}
                    <span style={{ color: "var(--vault-text-faint)" }}>
                      {diff.max_legs_per_game.official} →{" "}
                    </span>
                    <span style={{ color: "var(--vault-warn)" }}>
                      {diff.max_legs_per_game.replay}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>

          {Object.keys(summary.byProfile).length > 0 && (
            <div className="flex flex-col gap-1">
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                Replay by profile
              </span>
              <ul className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                {Object.entries(summary.byProfile).map(([prof, c]) => {
                  const dec = c.wins + c.losses;
                  const rate = dec ? (c.wins / dec) * 100 : 0;
                  return (
                    <li key={prof} className="flex gap-2 font-mono">
                      <span style={{ color: "var(--vault-text-faint)", minWidth: 90 }}>
                        {prof}
                      </span>
                      <span>
                        {c.wins}-{c.losses}
                        {c.pending > 0 ? ` (+${c.pending} pending)` : ""} ·{" "}
                        {rate.toFixed(1)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {wins.length > 0 && (
            <SlipsBlock label="Replay hits" tone="success" slips={wins} />
          )}
          {losses.length > 0 && (
            <SlipsBlock label="Replay misses" tone="warn" slips={losses} collapsed />
          )}
          {pending.length > 0 && (
            <SlipsBlock label="Replay pending" tone="muted" slips={pending} collapsed />
          )}

          <p
            className="text-[11px] leading-snug"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Not included in official public hit rate. The official 5/26
            suggested-parlay record remains 0 slips because the live
            model's same-game cap (1 per profile) prevented any 2+ leg
            stack on a one-game slate. See the rule diff above for the
            exact relaxation applied for this replay.
          </p>
        </div>
      </details>
    </section>
  );
}

function SlipsBlock({
  label,
  tone,
  slips,
  collapsed = false,
}: {
  label: string;
  tone: "success" | "warn" | "muted";
  slips: ReplayPayload["slips"];
  collapsed?: boolean;
}) {
  const color =
    tone === "success"
      ? "var(--vault-success)"
      : tone === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-text-faint)";
  return (
    <details open={!collapsed}>
      <summary
        className="font-mono uppercase tracking-[0.14em] cursor-pointer"
        style={{ color, fontSize: 10 }}
      >
        {label} · {slips.length}
      </summary>
      <ul className="mt-1 flex flex-col gap-1.5">
        {slips.map((s) => (
          <li
            key={s.slipId}
            className="px-2.5 py-1.5 rounded-[4px] flex flex-col gap-1"
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--vault-rule)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                {s.profile} · {s.sport} · {s.legs.length} legs
                {s.sameGame ? " · same-game" : ""}
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{ color, fontSize: 10 }}
              >
                {s.status}
              </span>
            </div>
            <ol className="flex flex-col gap-0.5">
              {s.legs.map((l, i) => (
                <li
                  key={i}
                  className="font-mono"
                  style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
                >
                  {l.playerName ?? "?"} · {l.market ?? "?"} {l.side ?? ""}{" "}
                  {l.line ?? "?"}
                  {l.finalStat != null ? ` → ${l.finalStat}` : ""}
                  {l.result ? ` · ${l.result}` : ""}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </details>
  );
}
