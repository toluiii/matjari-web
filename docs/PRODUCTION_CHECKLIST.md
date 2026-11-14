# Production launch gate

The code is a deployment-oriented foundation, not evidence that a live service is production-ready.

- [ ] Run all Rust, PostgreSQL integration, frontend, browser and accessibility checks in CI.
- [ ] Review the schema and authorization model against the real business requirements.
- [ ] Provision separate migration and non-owner runtime database roles; verify RLS with tests.
- [ ] Set the canonical HTTPS site URL, API origin, strong independent secrets and trusted proxy boundary.
- [ ] Deploy the API container and managed PostgreSQL; do not deploy Actix as a Vercel function.
- [ ] Configure Vercel's server-only API_INTERNAL_URL and PROXY_SHARED_SECRET.
- [ ] Confirm Secure/HttpOnly cookies, CSRF, logout/revocation and rate limits on the actual domains.
- [ ] Configure backups/PITR, alerting, uptime checks, error reporting and a tested restore procedure.
- [ ] Decide currency rounding, tax, receipt legal requirements, debt accounting and order reservation semantics.
- [ ] Integrate a real payment provider or approve the manual billing CLI process; verify webhook/reconciliation design if automated.
- [ ] Publish reviewed privacy/terms/contact information; enable indexing only on the canonical production host.
- [ ] Validate Search Console, sitemap, hreflang, structured data, social previews and Core Web Vitals with real measurements.
- [ ] Perform dependency/license review, load tests, tenant-isolation tests and an independent security review.
- [ ] If migrating old data, obtain the actual schema/export and write a verified, reversible migration. Never guess tenant ownership.

No paid plan prices, customer testimonials, uptime guarantees or compliance claims are invented by this repository.
