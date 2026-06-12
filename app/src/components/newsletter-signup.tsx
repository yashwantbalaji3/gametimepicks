"use client";

/**
 * NewsletterSignup — Phase 13.
 *
 * Two variants:
 *   variant="full"     → larger card, hero-friendly, uses on home page
 *   variant="compact"  → single-line inline form, fits in board/results footers
 *
 * Honest behavior:
 *   - When no provider is configured (default state), we tell the user
 *     "daily slate alerts aren't live yet — we'll announce when they are."
 *     We do NOT pretend we collected their email.
 *   - When a provider IS configured, we submit directly to the provider's
 *     public form endpoint. Their double-opt-in handles confirmation.
 *
 * Validation is client-side only (the provider revalidates).
 * No localStorage, no cookies, no fingerprinting.
 */

import { useState, type FormEvent } from "react";
import {
  isValidEmail,
  submitNewsletter,
  NEWSLETTER_CONFIG,
} from "@/lib/newsletter";

type Variant = "full" | "compact";

interface Props {
  variant?: Variant;
}

export default function NewsletterSignup({ variant = "full" }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "idle" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const isUnconfigured = NEWSLETTER_CONFIG.provider === "none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!isValidEmail(email)) {
      setResult({
        kind: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    setBusy(true);
    setResult({ kind: "idle" });
    const r = await submitNewsletter(email);
    setBusy(false);
    if (r.ok) {
      setResult({ kind: "success", message: r.message });
      setEmail("");
    } else {
      setResult({ kind: "error", message: r.message });
    }
  }

  if (variant === "compact") {
    return (
      <div className="w-full">
        <CompactForm
          email={email}
          setEmail={setEmail}
          busy={busy}
          result={result}
          onSubmit={onSubmit}
          isUnconfigured={isUnconfigured}
        />
      </div>
    );
  }

  return (
    <section
      className="rounded-[3px] p-5 sm:p-6"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
        style={{ color: "var(--vault-gold)" }}
      >
        free daily slate alerts
      </div>

      <h3
        className="font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-[1.1] mb-2"
        style={{ color: "var(--vault-text)" }}
      >
        Get a daily email when today's model board is refreshed.
      </h3>

      <p
        className="text-[13px] md:text-[14px] leading-relaxed mb-5 max-w-xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Educational analytics only — not betting advice. Unsubscribe anytime.
      </p>

      <FullForm
        email={email}
        setEmail={setEmail}
        busy={busy}
        result={result}
        onSubmit={onSubmit}
        isUnconfigured={isUnconfigured}
      />

      <p
        className="mt-3 font-mono text-[10px] tracking-wider"
        style={{ color: "var(--vault-text-faint)" }}
      >
        no spam · no paid picks · no profitability claims · responsible-use first
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form variants
// ---------------------------------------------------------------------------

interface FormProps {
  email: string;
  setEmail: (v: string) => void;
  busy: boolean;
  result:
    | { kind: "idle" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string };
  onSubmit: (e: FormEvent) => void;
  isUnconfigured: boolean;
}

function FullForm({ email, setEmail, busy, result, onSubmit, isUnconfigured }: FormProps) {
  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="email address"
          autoComplete="email"
          disabled={busy}
          className="flex-1 px-4 py-3 rounded-[3px] text-[14px]"
          style={{
            background: "var(--vault-panel-elevated)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text)",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-3 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors disabled:opacity-50"
          style={{
            background: "var(--vault-gold)",
            color: "#0A0705",
          }}
        >
          {busy ? "Submitting…" : isUnconfigured ? "Notify me" : "Subscribe"}
        </button>
      </form>
      <ResultBlock result={result} />
    </>
  );
}

function CompactForm({ email, setEmail, busy, result, onSubmit, isUnconfigured }: FormProps) {
  return (
    <div
      className="rounded-[3px] p-4"
      style={{
        background: "var(--vault-panel)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)" }}
        >
          daily slate alerts
        </div>
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          · educational, not betting advice
        </span>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="email address"
          autoComplete="email"
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-[2px] text-[13px]"
          style={{
            background: "var(--vault-panel-elevated)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text)",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50"
          style={{
            background: "var(--vault-gold)",
            color: "#0A0705",
          }}
        >
          {busy ? "…" : isUnconfigured ? "Notify me" : "Subscribe"}
        </button>
      </form>
      <ResultBlock result={result} compact />
    </div>
  );
}

function ResultBlock({
  result,
  compact = false,
}: {
  result: FormProps["result"];
  compact?: boolean;
}) {
  if (result.kind === "idle") return null;
  const color =
    result.kind === "success"
      ? "var(--vault-gold-bright)"
      : "var(--vault-warn)";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-${compact ? 2 : 3} text-[${compact ? 11 : 12}px] leading-relaxed`}
      style={{ color }}
    >
      {result.message}
    </div>
  );
}
