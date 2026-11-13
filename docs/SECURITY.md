# Security model and operator responsibilities

## Implemented boundaries

- Server-derived organization/store context; no tenant selection from request bodies.
- Membership and active-user checks on every authenticated request.
- Owner/employee permissions and subscription feature/quotas checked server-side.
- PostgreSQL RLS on business tables; runtime DB role must not own tables or have BYPASSRLS.
- Argon2id owner passwords; peppered employee access codes; no plaintext credentials at rest.
- Hashed, expiring, revocable opaque sessions; HttpOnly cookies, Secure in production.
- Exact Origin validation, custom header and CSRF double-submit protection on mutations.
- Parameterized SQL; bounded JSON bodies; typed inputs; pagination limits.
- Database-backed authentication throttling, including account and network scopes.
- Idempotency records for financial mutations; immutable stock/sale history.
- Request IDs and structured logs without passwords, cookies, tokens or customer notes.
- Private app/API responses are not cached publicly; marketing indexing is opt-in.

## Required secrets

Generate independent random values for the database passwords, `AUTH_PEPPER` (at least 32 bytes), and `PROXY_SHARED_SECRET` (at least 32 bytes). Never commit them, reuse them across environments, or expose them with a `NEXT_PUBLIC_` prefix. Rotating the employee-code pepper requires reissuing employee codes. Session-token hashing does not require a reusable signing key.

## Proxy trust

Only the Next.js server may reach the API in the recommended deployment. It forwards the platform's client IP and authenticates with `PROXY_SHARED_SECRET`. Do not expose the API port publicly without equivalent trusted-proxy handling. Configure Vercel/platform forwarding correctly; arbitrary user-supplied X-Forwarded-For is not trusted.

## Data lifecycle

Back up PostgreSQL with PITR, test restores, define retention with the business, and restrict operator access. Soft deletion/archive is not erasure. Account/export/erasure workflows need an explicit retention policy before public launch. Audit records are append-only through the application; database administrators can still alter data.

## Not a security certification

This repository has not received an independent penetration test. Run CI, dependency scanning, integration tests against the deployed PostgreSQL version, restore drills, TLS/cookie tests and abuse tests before launch. Add MFA, verified contact details, a privacy policy and a payment provider where required. Do not describe the software as certified, audited or guaranteed secure.
