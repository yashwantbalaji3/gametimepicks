"use client";

/**
 * ClientRedirect — a static-export-safe redirect. Next's server `redirect()` does NOT work under
 * `output: "export"` (it emits an error shell, not a redirect), so alias routes redirect on the client:
 * replace the history entry on mount, with a visible fallback link for no-JS users.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function ClientRedirect({ to, label }: { to: string; label?: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div className="vault-page-shell px-4 py-20 flex flex-col items-center gap-3 text-center">
      <p style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
        Redirecting to {label ?? to}…
      </p>
      <Link href={to} className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 12 }}>
        Continue →
      </Link>
    </div>
  );
}
