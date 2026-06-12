/**
 * PlayerAvatar — the single place that decides real headshot vs fallback monogram.
 *
 * Honesty: renders a REAL image ONLY when given a real URL (api-sports WC portraits,
 * official MLB Static CDN headshots derived from real player IDs). With no URL it falls
 * back to an initials monogram in the gold vault tone — clearly a generated placeholder,
 * never a fabricated photo. Fixed dimensions avoid layout shift; alt text is the name.
 */
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
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
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
        background: "rgba(240,199,94,0.12)",
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
