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
2. Open **Business Setup** and briefly show: “Your information and documents are submitted to AfroIntelligent for internal review and onboarding” and “These documents are not automatically submitted to Meta.”
3. Show the submitted business information and safe review document.
4. Open the AfroIntelligent platform-admin review centre.
5. Show the business profile summary and that Meta/WABA/WhatsApp are not connected.
6. Mark the document reviewed. Point out that this does not approve the business.
7. Separately click **Approve business onboarding**.
8. Return to the client workspace and show **AfroIntelligent Review: Approved** while Meta and WhatsApp remain **Not Connected**.
9. Click **Connect WhatsApp Business**.
10. Show the real Meta Embedded Signup window. Authenticate directly with Meta without exposing credentials.
11. Select the review WhatsApp Business Account and eligible phone number, then authorize AfroIntelligent.
12. After returning to AfroIntelligent, show **Meta Business Connection: Connected**, **WhatsApp Number: Connected**, the display phone number, and **WABA: Connected**.
13. Return briefly to the admin review centre and show the connected status and display phone number for the same workspace.
14. Stop recording.

## Reviewer explanation

AfroIntelligent uses `whatsapp_business_management` only after the client authenticates directly with Meta. The application retrieves the authorized WABA's phone-number list to validate the selected phone and retrieve its display details, then subscribes AfroIntelligent to that WABA's webhook events. The WABA and phone connection are stored for the client's isolated workspace. The client never provides a Meta password or access token to AfroIntelligent manually.

## Do not claim or show

- Do not describe AfroIntelligent's internal document review as Meta verification or Meta approval.
- Do not claim documents are uploaded or submitted to Meta.
- Do not claim message-template, Facebook Page, Instagram, Ads, or unrelated asset management.
- Do not expose WABA tokens, authorization codes, app secrets, encryption keys, passwords, or session cookies.
