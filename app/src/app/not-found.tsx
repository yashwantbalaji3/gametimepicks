/**
 * THE PAGE A MISTYPED URL REACHES (P293).
 *
 * There was no `not-found`, so the static export's `404.html` was Next's built-in error page: a bare
 * "404 | This page could not be found." with its own inline stylesheet setting
 * `body{color:#000;background:#fff}`. This site has no light theme — `globals.css` contains not one
 * `prefers-color-scheme` rule and paints a fixed dark ground — so on a light-preference device the
 * only white page on the site was the one that said something had gone wrong. It offered no way
 * onward either: the two links on it belonged to the layout's freshness strip.
 *
 * A 404 is not an error state to a reader, it is a navigation moment: they followed a stale link, a
 * shared URL from before a route moved, or they typed. So this says plainly what happened, does not
 * apologise, and hands them the primary destinations.
 *
 * The destinations are READ from the nav contract (`destinationsFor("top")`), never listed here. A
 * hand-kept copy on the one page nobody visits deliberately is a list that goes stale first — and the
 * nav is already the canonical owner of what the primary destinations are.
 */
import Link from "next/link";

import PageHero from "@/components/page-hero";
import { destinationsFor } from "@/lib/navigation";

export default function NotFound() {
  const primary = destinationsFor("top");
  return (
    <div className="vault-page-shell px-3 sm:px-6 lg:px-8 py-5 sm:py-10 md:py-14 overflow-x-hidden">
      <PageHero
        eyebrow="Not found"
        title="That page isn’t here"
        sub="The link may be from before a route moved, or the address may have a typo. Nothing is broken — here is everywhere you can go from here."
      />

      <nav aria-label="Primary destinations" className="mt-7 max-w-2xl flex flex-col gap-2">
        {primary.map((d) => (
          <Link
            key={d.href}
            href={d.href.endsWith("/") ? d.href : `${d.href}/`}
            className="flex items-baseline gap-3 rounded-[10px] px-3.5 py-3 no-underline"
            style={{
              border: "1px solid var(--vault-border)",
              background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
            }}
          >
            {/* No glyph: navigation.ts documents it as "the rail is the only surface that shows one",
                and quietly widening a stated single-surface convention is how contracts erode. */}
            <span className="min-w-0">
              <span className="block font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>
                {d.label}
              </span>
              {d.desc ? (
                <span className="block" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>
                  {d.desc}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden
              className="ml-auto font-mono"
              style={{ color: "var(--gtp-bank-heat)", fontSize: 11 }}
            >
              →
            </span>
          </Link>
        ))}
      </nav>

      <p className="mt-6 max-w-2xl" style={{ color: "var(--vault-text-faint)", fontSize: 12.5, lineHeight: 1.6 }}>
        Everything on this site is paper-only and educational. If you reached this page from a link on
        the site itself, that is a defect worth telling us about.
      </p>
    </div>
  );
}
