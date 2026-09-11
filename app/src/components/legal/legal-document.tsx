/**
 * One legal document, rendered from lib/legal/texts.mjs. Server component; no client state.
 * When the document is not yet publishable (only reachable in an internal review build) a banner says
 * so above the text, and every undecided parameter shows as a bracketed marker in place.
 */
import { renderLegal } from "@/lib/legal/texts.mjs";

export default function LegalDocument({ id, publishable, reasons }: { id: "terms" | "privacy"; publishable: boolean; reasons: string[] }) {
  const doc = renderLegal(id);
  return (
    <article className="mx-auto max-w-[720px] px-4 sm:px-6 py-10">
      {!publishable ? (
        <div role="note" className="mb-8 rounded-lg px-4 py-3 text-[13px] leading-relaxed" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-soft)", color: "var(--vault-text-mute)" }}>
          <strong style={{ color: "var(--vault-text)" }}>Draft for review — not in effect.</strong> This text has not been approved and is not published on the public site.
          <ul className="mt-2 list-disc pl-5">
            {reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      ) : null}
      <h1 className="font-semibold tracking-tight" style={{ color: "var(--vault-text)", fontSize: 28 }}>{doc.title}</h1>
      <div className="mt-6 flex flex-col gap-7">
        {doc.sections.map((s: { heading: string; paragraphs: string[] }) => (
          <section key={s.heading}>
            <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>{s.heading}</h2>
            {s.paragraphs.map((p: string, i: number) => (
              <p key={i} className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{p}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
