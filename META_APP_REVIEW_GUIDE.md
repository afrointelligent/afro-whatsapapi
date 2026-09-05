# Meta App Review Guide

Use the deployed product at `https://automate.afrointelligent.co.za`. The reviewer must see the real Afro Intelligent WhatsApp SaaS, not seed-only or mocked integration behavior.

## `whatsapp_business_management` reviewer path

1. Open the supplied client review workspace and sign in.
2. Open **Business Setup**, complete the basic business profile, and show that supporting documents are optional and are not submitted to Meta.
3. With zero documents uploaded, open **Messaging Connection** and click **Connect WhatsApp Business**.
4. In Meta Embedded Signup, authenticate directly with Meta, select or create the review WABA, and select its eligible WhatsApp phone number. AfroIntelligent never requests or receives the Meta password.
5. Complete Meta authorization and any verification Meta requires.
6. Return to AfroIntelligent and show **Meta Business Connection: Connected**, **WhatsApp Number: Connected**, the connected display phone number, and **WABA: Connected**.
7. Sign in to the supplied platform-admin account and show the same workspace's connection state. Optional document review, when used, is independent of this state.
8. Explain that AfroIntelligent used the authorization to retrieve the selected WABA's phone-number list, verify the selected phone belongs to that WABA, retrieve display details, and subscribe the app to WABA webhook events.

Document upload is optional AfroIntelligent functionality. It is not a prerequisite, does not submit anything to Meta, and is not evidence of `whatsapp_business_management` use. The real Embedded Signup and authorized WABA operations are the permission demonstration.

## Existing `whatsapp_business_messaging` renewal path

1. Open the public landing page and confirm **Never Miss a Client** is visible.
2. Open `/privacy`, `/terms`, and `/data-deletion` without authentication.
3. Sign in to the supplied messaging review workspace.
4. Show the tenant-scoped inbox and connected number.
5. Send a genuine message from the registered Meta test recipient to the connected number.
6. Show the signed webhook event routed by phone-number ID, persisted in MongoDB, and displayed in the correct tenant inbox.
7. Reply from the dashboard and show delivery to the real WhatsApp recipient.
8. Demonstrate Take Over and Resume AI only if it has been tested with that connection.

## Production Meta fields

- App Domain: `automate.afrointelligent.co.za`
- Webhook Callback: `https://automate.afrointelligent.co.za/webhooks/whatsapp`
- Privacy: `https://automate.afrointelligent.co.za/privacy`
- Terms: `https://automate.afrointelligent.co.za/terms`
- Data Deletion: `https://automate.afrointelligent.co.za/data-deletion`

Do not submit App Review or switch the app to Live until the production-domain checks and genuine WhatsApp round trip have passed.
