/**
 * Phase 13 — newsletter adapter.
 *
 * Static-export-friendly. NO server endpoints (the site uses
 * `output: "export"` in next.config.js, so API routes won't work).
 *
 * Approach:
 *   - When no provider is configured, the signup form shows a graceful
 *     "thanks, we'll let you know when this launches" state. Nothing
 *     gets stored. We don't pretend we collected the email.
 *   - When a provider IS configured (one constant edit in this file),
 *     the form posts directly to the provider's PUBLIC form endpoint —
 *     no API keys exposed because public form endpoints don't need them.
 *
 * Supported provider patterns documented in docs/NEWSLETTER.md:
 *   - Buttondown   (https://buttondown.email/api/embed-subscribe/<USERNAME>)
 *   - Beehiiv      (https://api.beehiiv.com/v2/...) — requires server-side
 *   - Mailchimp    (https://*.list-manage.com/subscribe/post?u=...&id=...)
 *   - Loops        (https://app.loops.so/api/newsletter-form/<id>) — requires server-side
 *
 * For pure static export, Buttondown and Mailchimp work without secrets;
 * Beehiiv and Loops would need a serverless adapter (out of Phase 13 scope).
 */

export type NewsletterProvider = "none" | "buttondown" | "mailchimp_form";

export interface NewsletterConfig {
  provider: NewsletterProvider;
  /** Provider-specific identifier (username, list ID, etc.). */
  endpoint: string | null;
  /** Optional honeypot field name to swap in if the provider expects one. */
  honeypotField?: string;
}

/**
 * EDIT THIS to wire a real provider.
 *
 * Default: "none" — form shows graceful "coming soon" state. No data captured.
 *
 * To enable Buttondown:
 *   provider: "buttondown",
 *   endpoint: "https://buttondown.email/api/emails/embed-subscribe/<your-username>",
 *
 * Buttondown's embed-subscribe endpoint is designed for public forms.
 * It does NOT require an API key. See docs/NEWSLETTER.md for details.
 *
 * Phase 18: the endpoint can also be set via the build-time env var
 * NEXT_PUBLIC_BUTTONDOWN_USERNAME — Vercel users can set it in
 * Project Settings → Environment Variables and skip editing this file.
 */
function resolveButtondownEndpoint(): string | null {
  // Build-time env var takes precedence — operator can set in Vercel
  // dashboard without committing changes.
  const username =
    typeof process !== "undefined" &&
    process.env &&
    process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME;
  if (typeof username === "string" && username.trim().length > 0) {
    return `https://buttondown.email/api/emails/embed-subscribe/${username.trim()}`;
  }
  return null;
}

const BUTTONDOWN_ENDPOINT = resolveButtondownEndpoint();

export const NEWSLETTER_CONFIG: NewsletterConfig = BUTTONDOWN_ENDPOINT
  ? { provider: "buttondown", endpoint: BUTTONDOWN_ENDPOINT }
  : { provider: "none", endpoint: null };

// ---------------------------------------------------------------------------
// Email validation (minimal but robust)
// ---------------------------------------------------------------------------

/**
 * Returns true if the input looks like a valid email address. We use a
 * deliberately minimal pattern — strict RFC 5322 compliance is overkill
 * for a signup form, and overly strict patterns reject perfectly valid
 * emails. The actual provider handles canonical validation.
 */
export function isValidEmail(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 254) return false;
  // Pattern: local-part @ domain . tld
  // - at least one char before @
  // - at least one char between @ and .
  // - at least 2 chars after the last .
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export type SubmitResult =
  | { ok: true; mode: "captured_locally" | "submitted_to_provider"; message: string }
  | { ok: false; reason: string; message: string };

export async function submitNewsletter(email: string): Promise<SubmitResult> {
  if (!isValidEmail(email)) {
    return {
      ok: false,
      reason: "invalid_email",
      message: "Please enter a valid email address.",
    };
  }

  if (NEWSLETTER_CONFIG.provider === "none") {
    // Honest state: we don't have a provider configured, so we don't
    // pretend to capture the email. We also don't write to localStorage
    // (would feel deceptive — the user thinks they're subscribed).
    return {
      ok: true,
      mode: "captured_locally",
      message:
        "Thanks for your interest. Daily slate alerts aren't live yet — we'll announce when they are.",
    };
  }

  if (NEWSLETTER_CONFIG.provider === "buttondown" && NEWSLETTER_CONFIG.endpoint) {
    try {
      const formData = new FormData();
      formData.append("email", email.trim());
      // Buttondown's public embed endpoint accepts CORS POST.
      const res = await fetch(NEWSLETTER_CONFIG.endpoint, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        return {
          ok: false,
          reason: "provider_error",
          message:
            "Couldn't submit to the newsletter provider right now. Please try again later.",
        };
      }
      return {
        ok: true,
        mode: "submitted_to_provider",
        message:
          "Subscribed. Check your email for a confirmation link from Buttondown.",
      };
    } catch (err) {
      return {
        ok: false,
        reason: "network_error",
        message: "Network error. Please try again.",
      };
    }
  }

  if (NEWSLETTER_CONFIG.provider === "mailchimp_form" && NEWSLETTER_CONFIG.endpoint) {
    // Mailchimp's classic form-post endpoint accepts CORS form-encoded.
    try {
      const formData = new FormData();
      formData.append("EMAIL", email.trim());
      const res = await fetch(NEWSLETTER_CONFIG.endpoint, {
        method: "POST",
        body: formData,
        mode: "no-cors",
      });
      // Mailchimp's no-cors response is opaque; we can't verify status
      // but absence of throw means the request was accepted.
      return {
        ok: true,
        mode: "submitted_to_provider",
        message:
          "Subscribed. Check your email for a confirmation link from Mailchimp.",
      };
    } catch (err) {
      return {
        ok: false,
        reason: "network_error",
        message: "Network error. Please try again.",
      };
    }
  }

  // Should not reach here, but defensive
  return {
    ok: false,
    reason: "unconfigured",
    message:
      "Newsletter is not configured yet. Please come back soon.",
  };
}
