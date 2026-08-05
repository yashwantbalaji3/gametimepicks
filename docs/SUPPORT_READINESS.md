# Support readiness — state, contract, and the exact founder action

**Status as of 2026-08-05 (Program 137): NOT_CONFIGURED — deliberately, and no support UI ships.**

## What was found

A repository-wide search for a support destination found nothing: no `support@`/`contact@`/`hello@`
address, no `mailto:` anywhere in `app/src/`, no `GTP_SUPPORT_*` variable in `.env.example`, in any
workflow, or in Vercel, and no owner named in any operations doc. There is no support channel to
wire up, and none was ever approved.

## Why nothing was shipped anyway

The obvious "progress" here would be a contact form or a `mailto:` link. Both would be worse than
the current state:

- A form in a **static export** has no server to receive it. It would collect a user's problem and
  silently discard it.
- A `mailto:` to an unmonitored inbox is the same failure with extra steps.
- Any "we reply within X" line invents an SLA nobody agreed to and cannot keep.

A user with a real problem is worse off believing they have been heard than knowing they have not.
So the honest state — no support entry point — ships until a real destination exists.

## What was built instead

`app/src/lib/support/support-config.mjs` — a **fail-closed configuration contract**. The public
surface renders a support entry point only when all three of these resolve:

| Variable | Meaning | Required |
|---|---|---|
| `GTP_SUPPORT_DESTINATION` | `mailto:…` or `https://…` | yes |
| `GTP_SUPPORT_OWNER` | the human or rota who answers | yes |
| `GTP_SUPPORT_RESPONSE` | the response expectation to publish, **verbatim** | yes |

The resolver refuses, and renders nothing, when:

- any of the three is missing (state `INVALID`, not "good enough")
- the destination is a placeholder (`example.com`, `your-email@…`, `noreply@…`, `TODO`, …)
- the destination is plaintext `http://` — support traffic carries personal detail
- the response expectation is a placeholder

`GTP_SUPPORT_RESPONSE` is passed through verbatim and is **never defaulted**. There is no code path
that produces an SLA the founder did not write.

Guards: `app/src/lib/support/support-config.test.mjs` (8 tests). One of them scans the built export
for any `mailto:` link, so a future hardcoded address fails the suite rather than reaching users.

## FOUNDER ACTION — provide a real support destination

|  |  |
|---|---|
| **Owner** | Founder |
| **Blocks** | `operations-support` launch gate (currently PARTIAL); private beta |
| **Estimated founder time** | 15–30 minutes |
| **Dependency** | A mailbox or helpdesk that a human actually reads |
| **Cost** | £0 with an email alias; a helpdesk tier is optional and not required |

**Recommended:** a dedicated alias on the existing domain (e.g. `support@gametimepicks.com`)
forwarding to the founder's inbox. It is free, needs no new vendor, is portable to a helpdesk later,
and keeps the personal address off the public site.

**Alternatives:** (a) a hosted helpdesk (Zendesk/Front/Crisp) — better queueing and history, but a
new vendor, a monthly cost, and a privacy review; (b) a public GitHub Issues tracker — free and
transparent, but requires a GitHub account and is inappropriate for anything personal.

### Steps

1. Create the alias/mailbox and confirm a test message arrives.
2. Decide the response expectation in your own words. Publish only what you will actually meet —
   "I read every message and usually reply within a few days" is fine and true; "24-hour response"
   is not, for a solo operator.
3. Set the three variables in the Vercel project **gametime-picks** (Production and Preview):
   ```
   GTP_SUPPORT_DESTINATION = mailto:support@gametimepicks.com
   GTP_SUPPORT_OWNER       = <who answers>
   GTP_SUPPORT_RESPONSE    = <your exact wording>
   ```
4. Tell engineering. The entry point is then wired into the footer through the existing design
   system, with an accessible label, and an end-to-end send/receipt test is run.

### Acceptance evidence

- `resolveSupportConfig(process.env).state === "CONFIGURED"` in a production build
- a real message sent from the public entry point and **received** at the destination, with the
  receipt recorded
- the gate then moves PARTIAL → PASS. Note the resolver reports `PASS_PENDING_DELIVERY_TEST` on
  configuration alone: **configuration is not delivery**, and the gate does not pass on config.

### Consequence of delay

No user-reachable way to report a broken page, a wrong number, or a settlement dispute. For a
product whose entire claim is transparency about its own record, having no channel for "your record
is wrong" is a credibility problem before it is a support problem. It does not block internal alpha
(the operator is the only user); it does block any beta with real users.
