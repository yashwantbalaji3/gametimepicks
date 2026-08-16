"use client";

/**
 * PlayerAvatar (plain variant) — thin delegate over the canonical fallback policy
 * (Program 147 · consolidation step 2).
 *
 * HISTORY, HONESTLY. This file was one of three sibling avatar implementations. Its success-path
 * markup is preserved BYTE-FOR-BYTE below (plain rounded image with the rule border; crimson-tint
 * monogram disc with gold initials at size*0.32) — 14 call sites depend on that look and pixel
 * parity was verified on the live renderings. What changed is the FAILURE path: the old version
 * had no onError, so a dead photo URL rendered the browser broken-image icon — the exact founder
 * observation the identity system exists to prevent, and a risk the ratchet's earlier comment
 * wrongly claimed was absent. A failed load now falls to the same monogram the no-photo path uses.
 *
 * Kept as a wrapper rather than migrating 14 call sites onto the canonical component: the two
 * render DIFFERENT designs on purpose (vault glow + team chip vs plain rounded), and pretending
 * they are one look would change money surfaces. One fallback POLICY, two appearances.
 */
import { useState } from "react";

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function PlayerAvatar({
  name,
  photo,
  size = 34,
}: {
  name: string;
  photo?: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);

  if (photo && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setErrored(true)}
        className="rounded-full shrink-0"
        style={{ objectFit: "cover", border: "1px solid var(--vault-rule)" }}
      />
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: "rgba(52, 211, 153, 0.12)",
        border: "1px solid var(--vault-rule)",
        color: "var(--vault-gold-bright)",
        fontSize: size * 0.32,
        fontWeight: 700,
      }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
