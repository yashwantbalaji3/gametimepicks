import path from "node:path";

import Link from "next/link";
import { getMeta } from "@/lib/data";
import { buildInfoFromEnv } from "@/lib/build-clock";
import { formatTimestamp } from "@/lib/format";
import FooterFreshness from "./footer-freshness";
import BrandMark from "./brand-mark";
import SupportEntry from "./support-entry";
import { resolveSupportConfig } from "@/lib/support/support-config.mjs";
import { LEGAL_ROUTES, legalRouteIsPublic } from "@/lib/legal/texts.mjs";

/* The legal pages are INTERNAL routes until their text is approved, and a link to one would be a nav
   P0. The route comes from the legal table and the filter admits it only once it may publish; the
   built-output guard (lib/legal/legal-export.test.mjs) checks the exported footer carries no link
   while it may not. */
const LEGAL_LINKS = [
  { id: "terms" as const, label: "Terms of Use" },
  { id: "privacy" as const, label: "Privacy" },
].filter((l) => legalRouteIsPublic(l.id)).map((l) => ({ ...l, href: `${LEGAL_ROUTES[l.id]}/` }));
import { destinationsFor, FOOTER_COLUMNS, FOOTER_COLUMN_LABEL, footerColumnOf } from "@/lib/navigation";
import { liveDataSources, type DataSource } from "@/lib/data-sources";

const FOOTER_DESTINATIONS = destinationsFor("footer");

export default function Footer() {
  const meta = getMeta();
  const build = buildInfoFromEnv();
  /*
   * Support is fail-closed by design: SupportEntry returns null unless a real destination is
   * configured. Wrapping it in an unconditional <li> therefore shipped an EMPTY list item into the
   * exported markup on every page. Read the same config the component reads, so the row is omitted
   * rather than emptied.
   */
  const supportConfigured = resolveSupportConfig(process.env).enabled;
  /*
   * P251-F12: the source list is DERIVED from the sports actually publishing, not read from the
   * legacy meta.json — which credited "nba_api" and two operator-override lanes on every page,
   * months after NBA became a settled archive and long after any override fed a live surface.
   * See lib/data-sources.ts. In demo mode the bundled fallback is still named, because that IS
   * the source then.
   */
  const visibleSources: DataSource[] = meta.isDemo
    ? meta.dataSources.map((s) => ({ name: s.name, description: s.description ?? "", url: s.url ?? "" }))
    : liveDataSources(path.join(process.cwd(), "public", "data"));
  return (
    <footer
      className="relative z-10 mt-24"
      style={{
        borderTop: "1px solid var(--vault-border)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-base) 0%, transparent) 0%, color-mix(in srgb, var(--vault-scrim-cocoa) 55%, transparent) 100%)",
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
            {/* Overnight 2026-10-28: the mark carried a "MODEL LAB" marker — the name of one page (/models), painted as
                the site's brand on every route. The brand is GameTimePicks; the wordmark alone says it. */}
            <BrandMark variant="compact" ambient />
          </Link>
          <span
            className="text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {/* Just what this is, in words true of every sport the site covers: forecasts, game simulations and a
                record of how they did. ("Simulation-first model picks" promised picks from every simulation, which not
                every sport has.) The About block below states the paper-only, not-advice position (pinned by
                footer-identity.test); saying it a third time inside one footer added no disclosure, only noise. */}
            Sports forecasts, game simulations and a public record of how they did.
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
          {/* Overnight 2026-10-28: four columns that say what is in them — Sports · Picks & parlays · Results · About &
              legal (lib/navigation.ts footerColumnOf). Every destination the footer carried before is still here. */}
          {FOOTER_COLUMNS.map((column) => {
            const items = FOOTER_DESTINATIONS.filter((d) => footerColumnOf(d) === column);
            const legal = column === "about";
            if (!items.length) return null;
            return (
              <div key={column}>
                <div
                  className="vault-quiet-label mb-3"
                  style={{ color: "var(--vault-text-faint)", letterSpacing: "0.06em" }}
                >
                  {FOOTER_COLUMN_LABEL[column]}
                </div>
                <ul className="ft-list list-none p-0">
                  {items.map((d) => (
                    <li key={d.href}>
                      <Link href={d.href} className="ft-link">
                        {d.label}
                        {d.note ? (
                          /* Coverage state. MLB and EPL are both sports and are NOT the same kind
                             of thing; a sitemap that lists them identically implies they are. */
                          <span className="ft-note">{` \u00b7 ${d.note}`}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                  {/* Terms and Privacy appear only once they may publish — a link to a 404, or to an
                      unapproved draft, is worse than no link. */}
                  {legal ? LEGAL_LINKS.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="ft-link">{l.label}</Link>
                    </li>
                  )) : null}
                  {legal && supportConfigured ? (
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
            {/* P213 R-A: the About prose (and its STALE coverage claim — "MLB is the one sport
                currently modelled" survived EPL forecasts and UFC predictions going live) moved to
                /about, its one owner. The footer keeps the ONE approved educational sentence. */}
            <p className="leading-relaxed max-w-prose">
              GameTime Picks — paper-only simulations, picks and settled results.{" "}
              <a href="/about/" style={{ color: "var(--vault-text)", textDecoration: "underline" }}>About the project</a>.
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

        {/* SITE BUILD — one small line for operators, under its own label (overnight 2026-10-28): the data mode, the
            build stamp and its freshness, which ops reads ("live data", "last build" and "freshness" are pinned by
            e2e/navigation.spec.ts and e2e/freshness.spec.ts). The export is exactly as fresh as its build; each product
            states its own data date where it matters (product-state.mjs). */}
        <p
          className="mt-10 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          <span style={{ color: "var(--vault-text-mute)" }}>Site build</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: meta.isDemo ? "var(--vault-warn)" : "var(--vault-success)" }} />
            <span>{meta.isDemo ? "demo data" : "live data"}</span>
          </span>
          {/* P251-F12: the legacy app-version chip is gone (a number that meant nothing to a reader). v1.7: the stamp is
              the build's own clock, never the dead legacy pipeline's "last refresh". */}
          <span>
            last build{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>
              {build?.builtAt ? formatTimestamp(build.builtAt) : "unknown"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span>freshness</span>{" "}
            <FooterFreshness lastRun={build?.builtAt ?? null} />
          </span>
        </p>

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
