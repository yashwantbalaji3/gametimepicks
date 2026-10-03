/**
 * /feedback — the friends-beta feedback form (Session 9 · I6). Static shell; the form is client-only and
 * signed-in only, so nothing personal is ever in the exported HTML. NOINDEX.
 */
import BetaFeedbackForm from "@/components/accounts/beta-feedback-form";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = {
  ...withRouteMetadata("/feedback/", {
    title: "Beta feedback · GameTime Picks",
    description: "Tell the GameTimePicks team what broke, what looked wrong, or what you would change.",
  }),
  robots: { index: false, follow: false },
};

export default function FeedbackPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-5" style={{ maxWidth: 760 }}>
      <header className="flex flex-col gap-1.5">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Friends beta</span>
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800 }}>Send feedback</h1>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6, maxWidth: "62ch" }}>
          What broke, what looked wrong, what confused you. Your report is private to you and the GameTimePicks team.
        </p>
      </header>
      <BetaFeedbackForm />
    </div>
  );
}
