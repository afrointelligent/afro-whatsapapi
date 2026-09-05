# Meta App Review Guide

Use the deployed product at `https://automate.afrointelligent.co.za`. The reviewer must see the real Afro Intelligent WhatsApp SaaS, not seed-only or mocked integration behavior.

## `whatsapp_business_management` reviewer path

1. Open the supplied client review workspace and sign in.
2. Open **Business Setup**. Show the notice that submitted information and documents go to AfroIntelligent for internal onboarding and are not automatically submitted to Meta.
3. Submit the prepared business onboarding application if it is not already submitted.
4. Sign in to the supplied platform-admin account at `/login`; it redirects to `/admin`.
5. Show the submitted business profile and document. Mark the document reviewed, then separately click **Approve business onboarding**.
6. Return to the client workspace. Show **AfroIntelligent Review: Approved** and **Meta Business Connection: Not Connected**.
7. Open **Messaging Connection** and click **Connect WhatsApp Business**.
8. In Meta Embedded Signup, authenticate directly with Meta, select the review WABA, and select its eligible WhatsApp phone number. AfroIntelligent never requests or receives the Meta password.
9. Complete Meta authorization.
10. Return to AfroIntelligent and show **Meta Business Connection: Connected**, **WhatsApp Number: Connected**, the connected display phone number, and **WABA: Connected**.
11. Explain that AfroIntelligent used the authorization to retrieve the selected WABA's phone-number list, verify the selected phone belongs to that WABA, retrieve display details, and subscribe the app to WABA webhook events.

The document upload in steps 2–5 is AfroIntelligent's internal onboarding process. It does not submit documents to Meta and is not evidence of `whatsapp_business_management` use. Steps 7–11 are the permission demonstration.

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
