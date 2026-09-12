/**
 * /account — your own bet record (P266).
 *
 * The only surface on the site that holds anything about a person, and it holds it for them alone:
 * row-level security keys every row to the signed-in id, the slip images live in a private bucket
 * under one folder per person, and nothing here ever reaches the site's published record.
 *
 * NOINDEX. A personal surface has no business in search results, and signed out it shows nothing but
 * an explanation.
 */
import AccountExperience from "@/components/accounts/account-experience";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = {
  ...withRouteMetadata("/account/", {
    title: "Your bets · GameTime Picks",
    description: "Sign in to keep your own record: add a slip you placed, check what we read from it, and see how it has actually gone.",
  }),
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-5" style={{ maxWidth: 860 }}>
      <header className="flex flex-col gap-1.5">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Your account</span>
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800 }}>Your bets</h1>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6, maxWidth: "66ch" }}>
          Add the bets you actually placed and keep one honest record of them: what you repeat, how you weight risk, and
          how it has gone. Your slips are visible only to you, and they never enter the site&rsquo;s published record.
        </p>
      </header>
      <AccountExperience />
    </div>
  );
}
