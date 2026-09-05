# Meta WhatsApp Business Management Review Video

Purpose: demonstrate the real reviewer-visible use of `whatsapp_business_management` through Meta Embedded Signup. Keep the recording focused on onboarding and authorized WhatsApp business assets.

## Recording setup

- Production application: `https://automate.afrointelligent.co.za`
- Use a dedicated client review workspace and platform-admin account.
- Prepare one safe onboarding document and an eligible Meta review WABA/phone number.
- Hide passwords, cookies, authorization codes, app secrets, tokens, database URLs, and private customer data.
- Record one continuous video at readable scale.

## Script

1. Open the AfroIntelligent client workspace.
2. Open **Business Setup**, complete the basic business profile, and show that documents are explicitly optional and are not automatically submitted to Meta.
3. Leave the workspace with zero uploaded documents to demonstrate that documents are not a connection prerequisite.
4. Open **Messaging Connection** and show Meta/WABA/WhatsApp as **Not Connected** and the available **Connect WhatsApp Business** button.
5. Click **Connect WhatsApp Business**.
6. Show the real Meta Embedded Signup window. Authenticate directly with Meta without exposing credentials.
7. Select or create the review WhatsApp Business Account and select its eligible phone number, then authorize AfroIntelligent. Meta handles its own verification and authorization requirements.
8. After returning to AfroIntelligent, show **Meta Business Connection: Connected**, **WhatsApp Number: Connected**, the display phone number, and **WABA: Connected**.
9. Return briefly to the admin review centre and show the connection status and display phone number for the same workspace. If optional documents exist, explain that their internal review status is independent of the Meta connection.
10. Stop recording.

## Reviewer explanation

AfroIntelligent uses `whatsapp_business_management` only after the client authenticates directly with Meta. The application retrieves the authorized WABA's phone-number list to validate the selected phone and retrieve its display details, then subscribes AfroIntelligent to that WABA's webhook events. The WABA and phone connection are stored for the client's isolated workspace. The client never provides a Meta password or access token to AfroIntelligent manually.

## Do not claim or show

- Do not describe AfroIntelligent's optional internal document review as Meta verification, Meta approval, or a prerequisite for Embedded Signup.
- Do not claim documents are uploaded or submitted to Meta.
- Do not claim message-template, Facebook Page, Instagram, Ads, or unrelated asset management.
- Do not expose WABA tokens, authorization codes, app secrets, encryption keys, passwords, or session cookies.
