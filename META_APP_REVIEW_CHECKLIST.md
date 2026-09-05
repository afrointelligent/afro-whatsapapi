# Meta App Review Checklist

- [ ] `https://automate.afrointelligent.co.za` returns HTTP 200 and the SaaS landing page.
- [ ] `/privacy`, `/terms`, and `/data-deletion` return HTTP 200 publicly.
- [ ] `/health` returns `status: ok` and `service: afro-intelligent-whatsapp`.
- [ ] `/readiness` reports `embeddedSignupConfigured: true` and `credentialEncryptionKeyConfigured: true` without returning configuration values.
- [ ] A client submission is clearly described as an AfroIntelligent internal review and is not presented as a Meta application.
- [ ] Reviewing one document does not approve the overall business.
- [ ] The platform admin explicitly approves the business for onboarding.
- [ ] The approved client sees **Connect WhatsApp Business**.
- [ ] Meta Embedded Signup opens and the client authenticates directly with Meta.
- [ ] Cancelling Embedded Signup leaves the workspace unconnected.
- [ ] Successful signup validates the selected phone against the authorized WABA and subscribes the app to WABA webhooks.
- [ ] The workspace shows Meta Business and WhatsApp Number as connected only after all completion steps and database persistence succeed.
- [ ] The admin can see the internal decision, connection status, WABA connected state, and display phone number.
- [ ] Correct webhook verify token returns the supplied challenge.
- [ ] Wrong webhook verify token is rejected with HTTP 403.
- [ ] POST webhook without a valid Meta signature is rejected.
- [ ] Valid POST webhook resolves the tenant from the recipient phone-number ID.
- [ ] Message IDs are durably deduplicated.
- [ ] Incoming messages and delivery statuses persist in MongoDB.
- [ ] The tenant inbox displays genuine inbound messages.
- [ ] A dashboard reply reaches the real Meta test recipient.
- [ ] Take Over and Resume AI are verified.
- [ ] Render contains secrets only as server-side environment variables.
- [ ] Render has an independent 32+ character `CREDENTIAL_ENCRYPTION_KEY`.
- [ ] Production CORS permits `https://automate.afrointelligent.co.za` and does not use a wildcard.
- [ ] The authenticated account-deletion workflow has been tested safely with a disposable tenant.

These checks establish technical readiness only. They do not mean Meta has approved the app.
