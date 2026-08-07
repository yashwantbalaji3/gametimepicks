import Link from "next/link";
import { getMeta } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import FooterFreshness from "./footer-freshness";
import BrandMark from "./brand-mark";
import SupportEntry from "./support-entry";

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
          "linear-gradient(180deg, rgba(26, 16, 11, 0) 0%, rgba(14, 21, 48, 0.55) 100%)",
      }}
    >
      {/* PR #114: replaced the running-dots "Vegas marquee" with a
          static, subtle gold gradient divider. The animated dotted
          line was reading as noisy / immature and competed with the
          MarketTicker up top. Mature premium look now. */}
      <div
        aria-hidden
        className="h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--vault-border-strong) 50%, transparent)",
          opacity: 0.85,
        }}
      />
      <div className="mx-auto max-w-[1440px] px-6 sm:px-8 py-14">
        {/* Brand row — premium wordmark + a quiet tagline. Sits above
            the existing two-column About / Data Sources grid. */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <Link
            href="/"
            aria-label="GameTimePicks home"
            className="vault-glow-hover rounded-[4px] py-1 px-1 -ml-1"
          >
            <BrandMark variant="compact" marker="model lab" ambient />
          </Link>
          <span
            className="text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Simulation-first model picks · paper-only, educational.
          </span>
        </div>

        {/* Secondary navigation — every destination not in the slim primary nav.
            Casual users don't need to see these in the header; power users
            still want them one click away. */}
        <nav
          aria-label="Site map"
          className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8 mb-10 text-[13px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              Coverage
            </div>
            {/* One live sport, one settled archive — and nothing else. The schedule-only leagues (NHL,
                IPL, WNBA, MLS) no longer have public destinations, so there is nothing here to label
                "pending": a link that promises future coverage is still a promise. */}
            <ul className="space-y-2 list-none p-0">
              <li>
                <Link href="/mlb" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>
                  MLB <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>· live</span>
                </Link>
              </li>
              <li>
                <Link href="/results/nba" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>
                  NBA <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>· settled archive</span>
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              Products
            </div>
            <ul className="space-y-2 list-none p-0">
              <li><Link href="/simulate" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Simulate</Link></li>
              <li><Link href="/today" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Today</Link></li>
              <li><Link href="/bank-builder" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Bank Builder</Link></li>
              <li><Link href="/results" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Results</Link></li>
              <li>
                <Link href="/results/model-audit" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>
                  Deep-dive track record
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              Explore &amp; learn
            </div>
            <ul className="space-y-2 list-none p-0">
              <li><Link href="/learn" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>How It Works</Link></li>
              <li><Link href="/methodology" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Methodology</Link></li>
              <li><Link href="/market-guide" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Market Guide</Link></li>
              <li><Link href="/system-status" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>System status</Link></li>
              <li><Link href="/research" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Research engine</Link></li>
              <li><Link href="/responsible-use" style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>Responsible use</Link></li>
              {/* Renders nothing unless a real support destination is configured — see SupportEntry.
                  A dead "Contact support" link is worse than none, so there is no placeholder here. */}
              <li><SupportEntry compact /></li>
            </ul>
          </div>
        </nav>

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
              GameTime Picks is a simulation-first, paper-only sports model. Run
              deterministic game simulations, review today&rsquo;s model slate, and track
              every result against official settlement — the same model output for every
              user. MLB is the one sport currently modelled; the NBA archive is settled history only.
            </p>
            <p
              className="mt-3 text-[12px]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Not betting advice. No promises of results. Paper-only — educational and research use only.
            </p>
          </div>

          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-gold)", letterSpacing: "0.06em" }}
            >
              Data sources
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0">
              {visibleSources.map((src) => (
                <li key={src.name}>
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener"
                      className="gtp-source-chip"
                    >
                      <span>{src.name}</span>
                      <span
                        aria-hidden
                        style={{ color: "var(--vault-text-faint)" }}
                      >
                        ↗
                      </span>
                    </a>
                  ) : (
                    <span
                      className="gtp-source-chip"
                      style={{ color: "var(--vault-text-faint)" }}
                    >
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
