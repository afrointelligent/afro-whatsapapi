# Meta App Review Checklist

- [ ] `https://automate.afrointelligent.co.za` returns HTTP 200 and the SaaS landing page.
- [ ] `/privacy`, `/terms`, and `/data-deletion` return HTTP 200 publicly.
- [ ] `/health` returns `status: ok` and `service: afro-intelligent-whatsapp`.
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
- [ ] Production CORS permits `https://automate.afrointelligent.co.za` and does not use a wildcard.
- [ ] The authenticated account-deletion workflow has been tested safely with a disposable tenant.

These checks establish technical readiness only. They do not mean Meta has approved the app.
