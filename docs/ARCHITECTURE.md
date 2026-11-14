# Matjari architecture

## Product boundary

Matjari is an Arabic-first retail operations service for Tunisia. The existing product covers products, stock receipts/losses, point of sale, manual orders, customer debts, employees, stores, financial summaries and manual subscription renewal. The original repository contains only a Vite client and an opaque external API URL; it does **not** contain that API's source or a database migration history.

The replacement is a monorepo:

- `web/`: Next.js App Router, TypeScript, server-rendered bilingual marketing/guides, private retail workspace.
- `backend/`: Actix Web HTTP API, SQLx, PostgreSQL, explicit migrations.
- `deploy/`: container build and reverse-proxy configuration.
- `.github/workflows/`: reproducible CI checks.

## Trust boundaries

The browser is untrusted. Prices, stock, roles, organization/store membership, subscription entitlements and totals are validated or calculated by the API. The client never supplies a trusted tenant ID. A session resolves to one user and one active store; every request rechecks membership, account status and subscription. PostgreSQL row-level security is a second boundary for business records.

Authentication uses random opaque session tokens. Only SHA-256 token digests are stored. Session cookies are HttpOnly; production cookies are Secure and host-only. Mutations require an allowed Origin, a custom client header and a double-submit CSRF token. Passwords use Argon2id. Employee six-digit codes use a secret pepper and constant-time verification, with distributed login throttling.

## Data and money

Organizations own stores and users. Store-scoped records carry both organization and store IDs. Foreign keys are composite where practical so a child cannot reference another tenant's product/order/debt.

TND amounts are integer **milliemes** (`1 TND = 1000`). Quantities are integers. API fields end in `_milliemes`; clients must not send floating-point dinars to the API. Database checks constrain amounts and quantities; Rust uses checked arithmetic. Sale lines snapshot product name, unit selling price and unit cost. Receipts update weighted-average cost. Stock changes and financial writes are atomic and idempotent.

Order stock is checked and deducted at delivery, not reserved at creation. Delivery atomically creates a sale. Delivery fees are revenue but are excluded from merchandise gross profit because their carrier cost is not modeled. Customer debts are a separate manual ledger, not an accounts-receivable integration. This is not a tax filing or certified invoicing system.

## Subscription boundary

The existing renewal workflow is contact-based. No payment processor or verified price list was supplied. The rebuild records renewal requests and provides an authenticated, audit-logged operator CLI for granting a plan against an external payment reference. It does not pretend to charge a card. Plan quotas and feature flags are enforced by the API, not localStorage.

## Delivery topology

Deploy Next.js on Vercel and Actix Web as a long-running container beside managed PostgreSQL. Browser API calls use same-origin `/api/*`; a server-only Next.js route proxies to `API_INTERNAL_URL`. The proxy attaches a shared secret and a platform-provided client IP. The backend rejects direct untrusted forwarding headers. TLS terminates at the platform/proxy. The API is not a Vercel serverless function.

## Deliberate exclusions

No fabricated reviews, revenue, customers, contribution history or payment confirmations. No offline POS conflict resolution, accounting certification, SMS delivery, automated payment collection, or unsupported data migration is claimed. See PRODUCTION_CHECKLIST.md before handling real customer data.
