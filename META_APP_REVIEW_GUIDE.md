# Meta App Review Guide

Use the deployed product at `https://automate.afrointelligent.co.za`. The reviewer must see the real Afro Intelligent WhatsApp SaaS, not seed-only or mocked integration behavior.

## Reviewer path

1. Open the public landing page and confirm **Never Miss a Client** is visible.
2. Open `/privacy`, `/terms`, and `/data-deletion` without authentication.
3. Sign in to the supplied review workspace.
4. Show the tenant-scoped inbox and business configuration.
5. Send a genuine message from the registered Meta test recipient to the Meta test number.
6. Show the signed webhook event routed by phone-number ID, persisted in MongoDB, and displayed in the correct tenant inbox.
7. Reply from the dashboard and show delivery to the real WhatsApp recipient.
8. Demonstrate Take Over and Resume AI without claiming functionality that has not been tested.

## Production Meta fields

- App Domain: `automate.afrointelligent.co.za`
- Webhook Callback: `https://automate.afrointelligent.co.za/webhooks/whatsapp`
- Privacy: `https://automate.afrointelligent.co.za/privacy`
- Terms: `https://automate.afrointelligent.co.za/terms`
- Data Deletion: `https://automate.afrointelligent.co.za/data-deletion`

Do not submit App Review or switch the app to Live until the production-domain checks and genuine WhatsApp round trip have passed.
