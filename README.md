# Afro Intelligent WhatsApp SaaS

Canonical production URL: `https://automate.afrointelligent.co.za`

Render root directory: `services/whatsapp-api`  
Build command: `npm run build`  
Start command: `npm start`  
Health check: `https://automate.afrointelligent.co.za/health`

The production root serves the **Never Miss a Client** SaaS landing page. Meta's production webhook callback is:

`https://automate.afrointelligent.co.za/webhooks/whatsapp`

Copy `.env.example` to `.env` for local development and fill in private values locally. Generate a verification secret with `npm run generate:verify-token`. The `WHATSAPP_VERIFY_TOKEN` value in Render must exactly match the value entered in Meta. Never commit it.

## Local development

Run `npm install`, then `npm run dev`, and open `http://localhost:3001`. A temporary ngrok URL may be used only for local webhook development; it is not a production or Meta-review URL.

Incoming message IDs are durably deduplicated in MongoDB. Incoming messages and delivery statuses are tenant-scoped by the recipient WhatsApp phone-number ID. POST webhook payloads require a valid `X-Hub-Signature-256` generated with `META_APP_SECRET` in production.

See the `META_*.md` files for the production configuration and review checklist.
