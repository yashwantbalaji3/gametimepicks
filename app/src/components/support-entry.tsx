/**
 * Support entry point — renders ONLY when a real, founder-approved destination is configured.
 *
 * This is the activation surface for `lib/support/support-config.mjs`. It exists so that when the
 * founder supplies a destination the channel goes live by setting three build-time variables, with
 * no second redesign — and, until then, it renders literally nothing.
 *
 * It deliberately does NOT render a disabled control, a "coming soon" line, or a greyed-out link.
 * A visible-but-dead support affordance is the failure the contract exists to prevent: a user with
 * a real problem clicks it, nothing happens, and they conclude the company is broken rather than
 * that support has not launched. Absent is honest; disabled is not.
 *
 * This is a server component. The static export has no request-time env, so configuration is read
 * at BUILD time — which is also why the kill switch is "unset the variable and rebuild".
 */
import { resolveSupportConfig } from "@/lib/support/support-config.mjs";

export default function SupportEntry({ compact = false }: { compact?: boolean }) {
  const support = resolveSupportConfig(process.env);
  if (!support.enabled) return null;

  // `destination` is validated to be `mailto:…` or `https://…` before it can reach here, and the
  // response wording is the founder's own text, passed through verbatim.
  const external = support.kind === "url";

  return (
    <div className={compact ? "" : "mt-1"}>
      <a
        href={support.destination ?? undefined}
        // A support link that opens a mail client or a new tab must say so — an unexplained context
        // switch is disorienting for screen-reader and keyboard users alike.
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
      >
        Contact support
        {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </a>
      {support.responseExpectation ? (
        <p style={{ color: "var(--vault-text-faint)", fontSize: 11, marginTop: 4, maxWidth: "42ch" }}>
          {support.responseExpectation}
        </p>
      ) : null}
    </div>
  );
}
