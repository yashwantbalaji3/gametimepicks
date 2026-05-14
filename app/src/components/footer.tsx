import { getMeta } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import FooterFreshness from "./footer-freshness";

export default function Footer() {
  const meta = getMeta();
  // Phase 13: when the site is running in live mode, hide any "demo data"
  // entries from meta.dataSources so users don't see "demo data" listed
  // alongside a "live data" status — the previous behavior was confusing.
  const visibleSources = meta.isDemo
    ? meta.dataSources
    : meta.dataSources.filter((s) => !/demo/i.test(s.name));
  return (
    <footer
      className="relative z-10 mt-24"
      style={{
        borderTop: "1px solid var(--vault-border)",
        background:
          "linear-gradient(180deg, rgba(7, 11, 26, 0) 0%, rgba(14, 21, 48, 0.55) 100%)",
      }}
    >
      {/* Soft gold edge accent at the very top of the footer chrome */}
      <div
        aria-hidden
        className="h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--vault-border-strong), transparent)",
        }}
      />
      <div className="mx-auto max-w-[1440px] px-6 sm:px-8 py-14">
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-10 text-[13px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              About
            </div>
            <p className="leading-relaxed max-w-prose">
              GametimePicks is an educational sports prop analytics project.
              It compares model projections against market lines for NBA player
              props using real player data and compliant odds sources.
            </p>
            <p
              className="mt-3 text-[12px]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Not betting advice. No guarantees. Educational and research use only.
            </p>
          </div>

          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              Data sources
            </div>
            <ul className="space-y-1.5">
              {visibleSources.map((src) => (
                <li key={src.name}>
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener"
                      className="transition-colors"
                      style={{ color: "var(--vault-text-mute)" }}
                    >
                      {src.name}{" "}
                      <span style={{ color: "var(--vault-text-faint)" }}>↗</span>
                    </a>
                  ) : (
                    <span style={{ color: "var(--vault-text-faint)" }}>
                      {src.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Status: demoted from a third column to a single quiet inline row.
            Version + last refresh + freshness sit together at low visual
            weight; mode chip becomes a small dot indicator. */}
        <div
          className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: meta.isDemo
                  ? "var(--vault-warn)"
                  : "var(--vault-success)",
              }}
            />
            <span style={{ color: "var(--vault-text-mute)" }}>
              {meta.isDemo ? "demo data" : "live data"}
            </span>
          </span>
          <span>
            version{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>
              {meta.version}
            </span>
          </span>
          <span>
            last refresh{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>
              {formatTimestamp(meta.lastPipelineRun)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span>freshness</span>{" "}
            <FooterFreshness lastRun={meta.lastPipelineRun} />
          </span>
        </div>

        <div
          className="mt-10 pt-6 flex flex-wrap justify-between gap-3 text-[11px] font-mono uppercase tracking-[0.15em]"
          style={{
            borderTop: "1px solid var(--vault-rule)",
            color: "var(--vault-text-faint)",
          }}
        >
          <span>© 2026 Yashwant Balaji</span>
          <span>
            built as a portfolio analytics project ·{" "}
            <a
              href="https://yashwantbalaji.com"
              target="_blank"
              rel="noopener"
              className="transition-colors"
              style={{ color: "var(--vault-text-mute)" }}
            >
              yashwantbalaji.com
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
