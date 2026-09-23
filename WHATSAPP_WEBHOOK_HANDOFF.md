# WhatsApp inbound foundation: Meta configuration gate

The backend is implemented and tested locally. The production domain was reachable and its existing verification token passed a GET challenge. The new release has NOT been deployed by this task: Render credentials/CLI are unavailable and browser startup failed. No real WhatsApp message was sent and the Super Admin project was not inspected or edited.

## Deploy before the real-message test

Deploy the changed backend files and package lock to the existing Render service serving `https://automate.afrointelligent.co.za`. Keep its existing repository/root settings. Use `npm ci --include=dev && npm run build` for the build and `npm start` for startup. Node 22.20+ is compatible with the tested setup. Keep Render's assigned `PORT`. Use `/health` as the health check.

This release expects MongoDB transactions (replica set/Atlas). The configured cluster was checked and supports them. Startup awaits indexes and binds the phone to the explicitly configured EXISTING tenant; it refuses to steal a phone from another tenant or create a duplicate client. It also replaces the old global receipt index with tenant-scoped uniqueness. Keep the existing MongoDB URI/database. The internal tenant below was found in `afrointelligent_whatsapp`; if Render points at a different database, resolve the existing Afro Intelligent tenant there first rather than changing databases blindly.

Run a single Render instance for this release. Realtime rooms/outbox delivery currently run within that process; multiple instances require a shared Socket.IO adapter before scaling. MongoDB event receipts and messages remain durable across restarts.

## Render environment

Set these server-only variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `META_API_VERSION` | `v25.0` |
| `WHATSAPP_PHONE_NUMBER_ID` | `1429090213609492` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `2323102291782001` |
| `WHATSAPP_INTERNAL_TENANT_ID` | `6a80099b0c85c7272328824d` (existing Afro Intelligent Administration tenant) |
| `WHATSAPP_VERIFY_TOKEN` | Existing value from private `.env`; confirmed to match the live callback. Never commit it. |
| `META_APP_SECRET` | App Secret of the Meta app configuring this webhook. Keep private. |
| `WHATSAPP_ACCESS_TOKEN` | Credential authorized for this WABA/number. Temporary credential can be replaced here without code changes. Inbound storage does not require outbound access. |
| `MONGODB_URI` | Preserve the existing private connection URI. |
| `MONGO_DB_NAME` | Preserve the existing database; see tenant mapping note above. |
| `SESSION_SECRET` | Preserve existing secret, at least 32 characters. |
| `INTERNAL_API_KEY` | Preserve existing private server-to-server key. Never put it in frontend code. |
| `PUBLIC_API_URL` | `https://automate.afrointelligent.co.za` |
| `PRODUCT_BASE_URL` | `https://automate.afrointelligent.co.za` |
| `API_BASE_URL` | `https://automate.afrointelligent.co.za` |
| `FRONTEND_URL` | Keep trusted frontend origins, including `https://automate.afrointelligent.co.za`. Comma-separated. |
| `LOCAL_FRONTEND_PROXY_ENABLED` | `false` |

Retain existing `CREDENTIAL_ENCRYPTION_KEY`, `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, SMTP and other unrelated production settings. Do not rotate the encryption key: existing customer credentials depend on it. Embedded Signup, DeepSeek, test-recipient and payment variables are not prerequisites for receiving inbound messages.

After deploying, `/health` must show release `whatsapp-foundation-2026-09-22.1` and `/readiness/whatsapp` must return HTTP 200 with all checks true. The older `/readiness` checks unrelated Embedded Signup features as well. Run `node scripts/check-whatsapp-deployment.mjs` to check release, readiness and token verification without sending a WhatsApp message. This command intentionally fails against the old release.

## Meta settings

Callback URL: `https://automate.afrointelligent.co.za/webhooks/whatsapp`

Verify Token: copy the exact `WHATSAPP_VERIFY_TOKEN` from the private `.env` or matching Render setting. The token is omitted from this tracked document intentionally.

Object: `whatsapp_business_account`. Subscribe to **`messages`** (inbound messages and outbound message status receipts). No other fields are required for this inbound foundation. Select Graph API v25.0 where the dashboard requests a version.

Ensure this Meta app is subscribed to WABA `2323102291782001`. Meta's official [Subscribe to a WABA](https://www.postman.com/meta/whatsapp-business-platform/request/26gui66/subscribe-to-a-waba) documents `POST /v25.0/2323102291782001/subscribed_apps` with a bearer credential authorized for that WABA. You can check the association with GET at the same path. This task did not modify Meta subscriptions.

STOP HERE. The user configures Meta manually before a real incoming-message test. The Super Admin integration remains gated on that test succeeding.

## Backend API and realtime contract

- `GET /api/whatsapp/tenants`
- `GET /api/whatsapp/tenants/:tenantId/conversations?limit=50`
- `GET /api/whatsapp/tenants/:tenantId/conversations/:conversationId/messages?limit=50&before=<cursor>`

Browser requests use the existing HttpOnly signed session cookie. Active user and current membership are checked. Platform administrators may access other tenants. The server-to-server integration may use `Authorization: Bearer <INTERNAL_API_KEY>`; this key grants platform-wide access and stays on the consuming server.

Socket.IO is attached to the SAME HTTP service at `/socket.io`. Authenticate with the session cookie and optional `auth.tenantId` (validated server-side); server clients may use the authorization header. `whatsapp.ready` asks clients to refetch persisted inbox data. `whatsapp.event` carries only event ID, type, tenant ID, conversation ID, Meta message ID and optional status. Treat it as an invalidation notice and fetch authorized data; deduplicate notices by event ID. The transactional outbox retries after failures and is retained for seven days after publication. Reconnection requires a refetch rather than assuming every transient notification was seen.

The registered internal number defaults new conversations to `HUMAN_ACTIVE`; inbound processing does not call Meta to send messages or trigger paid messaging. Media metadata is retained, but media binary downloading is outside this phase. Existing document records remain in place and unchanged.

## Tests

`npm test` builds TypeScript and runs the suite. By default integration tests start an isolated local MongoDB replica set (first run downloads the MongoDB binary). Alternatively set `TEST_MONGODB_URI` to a test-capable replica-set URI. Tests create a random `whatsapp_test_...` database, exercise the real local HTTP server and Socket.IO clients, and delete only that generated database. They never send messages through Meta.

Coverage includes verification, signature rejection, malformed requests, internal tenant binding/conflict, contacts, conversations, message persistence, concurrent duplicates, atomic rollback and retry, non-text messages, delivery statuses, early receipts, cross-tenant message IDs, authenticated retrieval, pagination, tenant isolation, Socket.IO isolation and inbound readiness, plus existing authentication/onboarding tests.
