# Meta Tech Provider Setup

Canonical application origin: `https://automate.afrointelligent.co.za`

Configure the Meta App Domain as `automate.afrointelligent.co.za`. Configure the WhatsApp webhook callback as `https://automate.afrointelligent.co.za/webhooks/whatsapp`. Use the private value stored in Render's `WHATSAPP_VERIFY_TOKEN` as the Verify Token.

Embedded Signup must follow Meta's current official flow. Do not promise number eligibility before Meta checks it. Store resulting business portfolio, WABA and phone-number identifiers tenant-by-tenant. Tokens and app secrets must remain server-side and encrypted where stored.

Required public policies:

- `https://automate.afrointelligent.co.za/privacy`
- `https://automate.afrointelligent.co.za/terms`
- `https://automate.afrointelligent.co.za/data-deletion`

Before enabling customer onboarding, verify the domain, HTTPS, CORS, signed webhooks, tenant routing, durable deduplication, inbox persistence, outbound reply and account deletion. If Meta requires a step to be completed directly in Meta Business Manager, guide the customer to that step rather than representing it as completed by Afro Intelligent.
