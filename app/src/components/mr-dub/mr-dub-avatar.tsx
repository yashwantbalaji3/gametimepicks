/**
 * MrDubAvatar — Mr. Dub's first-party character mark: a lab-coat scientist with goggles and a ledger
 * clipboard, in GameTime Picks lava colors. Pure inline SVG (no external/unlicensed assets), themable
 * via CSS variables, accessible (role=img + title). Used on the /mr-dub hero, nav, and link cards.
 */
export default function MrDubAvatar({ size = 56, title = "Mr. Dub — paper-portfolio scientist" }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <defs>
        <linearGradient id="mrdub-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(225,29,42,0.30)" />
          <stop offset="100%" stopColor="rgba(212,175,55,0.18)" />
        </linearGradient>
      </defs>
      {/* badge ring */}
      <circle cx="32" cy="32" r="31" fill="url(#mrdub-bg)" stroke="var(--vault-gold-bright, #d9a441)" strokeWidth="1.5" />
      {/* head */}
      <circle cx="32" cy="24" r="9" fill="#f2d3a8" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      {/* hair */}
      <path d="M23 22c0-6 5-9 9-9s9 3 9 9c-3-2-6-3-9-3s-6 1-9 3z" fill="#3a2a1a" />
      {/* goggles */}
      <g stroke="var(--gtp-bank-heat, #e11d2a)" strokeWidth="1.6" fill="rgba(110,231,168,0.25)">
        <circle cx="28" cy="24" r="3.2" />
        <circle cx="36" cy="24" r="3.2" />
        <path d="M31.2 24h1.6" />
        <path d="M24.8 24l-2.2-1.4M39.2 24l2.2-1.4" />
      </g>
      {/* lab coat body */}
      <path d="M20 52c0-9 4-15 12-15s12 6 12 15z" fill="#f4f6f8" stroke="rgba(0,0,0,0.2)" strokeWidth="0.6" />
      {/* lapels */}
      <path d="M32 37l-4 7 4 3 4-3z" fill="#e9edf1" stroke="var(--gtp-bank-heat,#e11d2a)" strokeWidth="0.8" />
      {/* clipboard / ledger */}
      <g>
        <rect x="36" y="40" width="11" height="14" rx="1.5" fill="#1a120c" stroke="var(--vault-gold-bright,#d9a441)" strokeWidth="1" transform="rotate(8 41 47)" />
        <path d="M39 45h7M39 48h7M39 51h4" stroke="var(--vault-gold-bright,#d9a441)" strokeWidth="0.9" transform="rotate(8 41 47)" />
      </g>
      {/* lava flask accent */}
      <path d="M16 44l1.5-3v-3h3v3l1.5 3a1.4 1.4 0 0 1-1.3 2h-3.4a1.4 1.4 0 0 1-1.3-2z" fill="var(--gtp-bank-heat,#e11d2a)" opacity="0.85" />
    </svg>
  );
}
