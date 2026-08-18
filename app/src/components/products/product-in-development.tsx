/**
 * The destination for a signature product that is NAMED but NOT BUILT.
 *
 * A named product with no page is a dead end — the reader clicks a good name and nothing happens.
 * A named product with a page saying "coming soon" is worse, because it is a promise with no
 * content behind it and no way to tell whether it is a week away or a year.
 *
 * So this page shows the actual position: what the sport verifiably HAS on disk today, and every
 * stage of the pipeline still standing between that and a publishable read — taken from the same
 * twelve-stage gate the internal maturity assessment uses, so the public claim and the internal one
 * cannot diverge. When the stages go green the page changes on its own, because nothing on it is
 * written by hand.
 *
 * It states no probability, no pick and no projection, for the plain reason that there is no
 * validated model to state one from. Saying so precisely is the content.
 */
import Link from "next/link";
import type { SignatureProduct } from "@/lib/products/signature-products";
import type { ProductReadiness } from "@/lib/products/product-readiness";

const STATUS_COPY: Record<string, string> = {
  PROVEN: "Done",
  PARTIAL: "Part-way",
  UNPROVEN: "Not started",
  BLOCKED_EXTERNAL: "Blocked outside our control",
};

const STATUS_COLOUR: Record<string, string> = {
  PROVEN: "var(--vault-gold-bright)",
  PARTIAL: "var(--vault-gold)",
  UNPROVEN: "var(--vault-text-faint)",
  BLOCKED_EXTERNAL: "var(--vault-text-mute)",
};

export default function ProductInDevelopment({
  product, readiness, scheduleHref, scheduleLabel,
}: {
  product: SignatureProduct;
  readiness: ProductReadiness;
  scheduleHref: string;
  scheduleLabel: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pt-8 flex flex-col gap-7 overflow-x-hidden">
      <header className="flex flex-col gap-2.5">
        <span className="font-mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
          {product.sportLabel} · signature product · in development
        </span>
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800, margin: 0 }}>
          {product.name}
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--vault-text-mute)", margin: 0 }}>
          {product.question}
        </p>
        <p
          className="mt-1 rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", background: "rgba(7,11,9,0.5)", margin: 0 }}
        >
          <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>There are no picks on this page, and there will not be until the work below is finished.</strong>{" "}
          {product.basis}
        </p>
      </header>

      {readiness.haveNow.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>What exists today</h2>
          <ul className="flex flex-col gap-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {readiness.haveNow.map((f) => (
              <li key={f.label} className="flex flex-wrap items-baseline gap-x-2 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
                <span className="font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{f.label}</span>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
          <Link href={scheduleHref} className="font-mono uppercase tracking-[0.1em] text-[10.5px]" style={{ color: "var(--vault-gold)", textDecoration: "none" }}>
            {scheduleLabel} →
          </Link>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>
            What has to be true before it publishes
          </h2>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)", margin: 0 }}>
            {readiness.met.length} of {readiness.met.length + readiness.missing.length} stages complete. Every sport on this site
            passes the same list — the two that publish today did, and this one has not yet. A stage only counts as done when
            there is a receipt for it.
          </p>
        </div>

        <ol className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0, counterReset: "stage" }}>
          {[...readiness.met, ...readiness.missing].map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-1 rounded-lg px-3 py-2.5"
              style={{ border: "1px solid var(--vault-rule)", background: "rgba(7,11,9,0.4)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13.5px] font-semibold" style={{ color: "var(--vault-text)" }}>{s.name}</span>
                <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: STATUS_COLOUR[s.status] ?? "var(--vault-text-faint)" }}>
                  {STATUS_COPY[s.status] ?? s.status}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-faint)", margin: 0 }}>
                Counts as done when: {s.proof}.
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>Why it is not shipped early</h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", margin: 0 }}>
          A model that has never been checked against settled results can still produce confident-looking numbers — that is the
          easy part. Four models on this site were built, measured against a bar set in advance, and rejected for failing it;
          their write-ups are public. {product.name} gets the same treatment, which means it appears here when it earns a page,
          and not before.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {[{ href: "/methodology", label: "How everything is graded" }, { href: "/results", label: "The full record" }, { href: "/sports", label: "All sport coverage" }].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="gtp-pressable rounded-full px-3.5 py-1.5 font-mono uppercase tracking-[0.1em] text-[10.5px]"
              style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              {l.label} →
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
