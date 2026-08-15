# Meta Configuration

## Canonical production values

- App Domain: `automate.afrointelligent.co.za`
- Public SaaS URL: `https://automate.afrointelligent.co.za`
- Webhook Callback: `https://automate.afrointelligent.co.za/webhooks/whatsapp`
- Privacy: `https://automate.afrointelligent.co.za/privacy`
- Terms: `https://automate.afrointelligent.co.za/terms`
- Data Deletion: `https://automate.afrointelligent.co.za/data-deletion`

The App Domain is a hostname only. Do not include `https://` in Meta's App Domain field.

## Webhook

`GET /webhooks/whatsapp` validates `hub.mode`, `hub.verify_token` and returns `hub.challenge` only when the token matches `WHATSAPP_VERIFY_TOKEN`. `POST /webhooks/whatsapp` validates `X-Hub-Signature-256` with `META_APP_SECRET` before parsing tenant events.

The verify token is a private value created for webhook verification. It is not a Meta access token and must not be committed or displayed.

## Environment

Configure these server-side values in Render: `PRODUCT_BASE_URL`, `API_BASE_URL`, `FRONTEND_URL`, `PUBLIC_API_URL`, `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `MONGODB_URI`, `MONGO_DB_NAME`, and `INTERNAL_API_KEY` as applicable. Do not expose secrets in browser variables.

Localhost remains supported for development. Do not place localhost, ngrok, Render-generated or Vercel URLs into production Meta settings.
