"use client";
/**
 * TeamMark — a team's visual mark with an honest fallback chain:
 *   1. REAL provider logo URL when the artifact carries one (e.g. the World Cup
 *      projections' api-sports `homeLogo`/`awayLogo` — the same provider family
 *      as the player portraits already in use);
 *   2. country flag from a real ISO code (FlagBadge);
 *   3. initials monogram.
 * Never a fabricated/licensed logo — only artifact URLs render as images.
 */
import { useState } from "react";

import FlagBadge from "@/components/flag-badge";

const SIZE = { sm: 18, md: 24, lg: 32, xl: 44 } as const;

export default function TeamMark({
  name,
  logoUrl,
  flagCode,
  size = "md",
}: {
  name?: string | null;
  logoUrl?: string | null;
  flagCode?: string | null;
  size?: keyof typeof SIZE;
}) {
  const px = SIZE[size];
  /* P214 R-E: the chain fell back on ABSENCE only — a 404/network failure past the presence check
     still showed the native broken icon. onError now walks the same chain (flag, then monogram). */
  const [errored, setErrored] = useState(false);
  if (logoUrl && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        onError={() => setErrored(true)}
        src={logoUrl}
        alt={name ?? "team"}
        width={px}
        height={px}
        loading="lazy"
        className="shrink-0"
        style={{ objectFit: "contain" }}
      />
    );
  }
  if (flagCode) {
    return <FlagBadge code={flagCode} size={size === "lg" || size === "xl" ? "lg" : size === "sm" ? "sm" : "md"} ariaLabel={name ?? flagCode} />;
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-[5px] shrink-0 font-bold"
      style={{ width: px, height: px, fontSize: px * 0.45, background: "rgba(248,244,233,0.08)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)" }}
      aria-label={name ?? "team"}
    >
      {(name ?? "??").slice(0, 2).toUpperCase()}
    </span>
  );
}
