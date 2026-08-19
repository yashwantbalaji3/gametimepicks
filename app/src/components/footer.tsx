import Link from "next/link";
import { getMeta } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import FooterFreshness from "./footer-freshness";
import BrandMark from "./brand-mark";
import SupportEntry from "./support-entry";
import { resolveSupportConfig } from "@/lib/support/support-config.mjs";
import { destinationsFor, NAV_GROUP_LABEL } from "@/lib/navigation";

const FOOTER_DESTINATIONS = destinationsFor("footer");

export default function Footer() {
  const meta = getMeta();
  /*
   * Support is fail-closed by design: SupportEntry returns null unless a real destination is
   * configured. Wrapping it in an unconditional <li> therefore shipped an EMPTY list item into the
   * exported markup on every page. Read the same config the component reads, so the row is omitted
   * rather than emptied.
   */
  const supportConfigured = resolveSupportConfig(process.env).enabled;
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
          "linear-gradient(180deg, rgba(11, 18, 14, 0) 0%, rgba(10, 6, 4, 0.55) 100%)",
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
            {/* Just what this is. The About block below describes the product and the legal line
                under it states the paper-only, not-advice position (pinned by footer-identity.test).
                Saying "paper-only, educational" a third time inside one footer — on all 16 routes —
                added no disclosure, only noise. */}
            Simulation-first model picks.
          </span>
        </div>

        {/*
          Sitemap, DERIVED. P185 put the footer on the canonical destination list — it was the last
          navigation surface still hand-maintained, and it had drifted the same way the three shells
          had before P196: it omitted UFC, a LIVE sport, along with EPL, Moonshot, Homer Nukes and
          Mr. Dub. A footer that promises a sitemap and lists two thirds of the site is worse than
          no footer, because it reads as the complete answer.

          Grouped by the registry's own four questions, so the footer, the rail and the top nav
          describe one site rather than three.
        */}
        <nav
          aria-label="Site map"
          className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mb-10 text-[13px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {(["now", "sports", "products", "record"] as const).map((group) => {
            const items = FOOTER_DESTINATIONS.filter((d) => d.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <div
                  className="vault-quiet-label mb-3"
                  style={{ color: "var(--vault-text-faint)", letterSpacing: "0.06em" }}
                >
                  {NAV_GROUP_LABEL[group]}
                </div>
                <ul className="space-y-2 list-none p-0">
                  {items.map((d) => (
                    <li key={d.href}>
                      <Link href={d.href} style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}>
                        {d.label}
                        {d.note ? (
                          /* Coverage state. MLB and EPL are both sports and are NOT the same kind
                             of thing; a sitemap that lists them identically implies they are. */
                          <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{` \u00b7 ${d.note}`}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                  {group === "record" && supportConfigured ? (
                    /* Renders nothing unless a real support destination is configured — see
                       SupportEntry. A dead "Contact support" link is worse than none, so there is
                       no placeholder here — and no empty <li> either, which is what an
                       unconditional wrapper left behind in the exported markup. */
                    <li><SupportEntry compact /></li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </nav>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-10 text-[13px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <div>
            <div
              className="vault-quiet-label mb-3"
              style={{ color: "var(--vault-text-faint)", letterSpacing: "0.06em" }}
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
              style={{ color: "var(--vault-text-faint)", letterSpacing: "0.06em" }}
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
