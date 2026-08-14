# Afro Intelligent WhatsApp API

Render root directory: `services/whatsapp-api`  
Build command: `npm run build`  
Start command: `npm start`  
Health check: `/health`

Copy `.env.example` to `.env` and fill in your Meta values. Generate a verification secret with `npm run generate:verify-token`, put it in `WHATSAPP_VERIFY_TOKEN`, and enter exactly the same value in Meta.

For local development run `npm install`, then `npm run dev`. Expose it with `ngrok http 3001`; Meta's callback URL is `https://YOUR-NGROK-DOMAIN/webhooks/whatsapp`.

To send a verified test-recipient message in development:

```powershell
Invoke-RestMethod http://localhost:3001/api/dev/send-message -Method Post -ContentType application/json -Body '{"to":"27XXXXXXXXX","message":"Hello from Afro Intelligent"}'
```

Incoming message IDs are deduplicated in memory. Use a database-backed repository before horizontally scaling the service.
