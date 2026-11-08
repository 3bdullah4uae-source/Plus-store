# Plus Store API — development prototype

**Status:** backend source code only; no live database, login, payment, or IPA signing service has been deployed or verified. The existing `app.html` is an independent browser-only demo. It is **not connected** to this API.

## Setup (private developer environment)

1. Use Node.js 20+ and a private PostgreSQL database.
2. Run `database/schema.sql`, then `database/sessions.sql` against that database.
3. Set environment values:
   - `DATABASE_URL`: database connection string (secret).
   - `SESSION_SECRET`: cryptographically random secret at least 32 characters. Never commit it.
   - `PUBLIC_ORIGIN`: exact HTTPS frontend origin, e.g. `https://example.com`.
   - `NODE_ENV=production` for Secure cookies behind an HTTPS reverse proxy.
   - `PGSSL=require` only when the database provider's certificates are correctly configured.
   - `PORT`: assigned by hosting provider or default 3000.
4. Run `npm install` and `npm start`.
5. Verify `GET /api/health`. Do not expose customer registration before completing deployment security checks.

## API endpoints

- `POST /api/register`: `{ "email": "...", "password": "..." }`
- `POST /api/login`: same JSON; issue a server-side cookie session.
- `POST /api/logout`: revoke current session.
- `GET /api/me`: current user (authentication required).
- `GET /api/catalog`, `GET /api/plans`: published services and plans.
- `POST /api/orders`: create an **unpaid draft** with `itemId` and optional `planId`.
- `GET /api/orders`: own orders only.
- `GET /api/admin/orders`: admin-only order list.

**Security limitations before production:** no email verification, password reset, audit-write integration, proxy-aware distributed rate limiting, complete CSRF protection for multi-origin deployments, automated database migrations, integration tests, secure file upload or signing worker. Do not populate or advertise real plans until these are built and security-reviewed. Account creation always assigns customer role; admin must be granted through a separate trusted operational procedure.

**Business limitations:** The signing request database table is preparation only; no IPA signing or distribution is implemented. Apple certificate and profile rules must be followed. No payment integration is present. The API does not store Apple private keys.

## Deployment

`render.yaml` currently deploys the HTML **static preview only**. It does not deploy this Node backend or PostgreSQL. Create a separate private web service and database when ready; do not mistake the static preview for a live account system.
