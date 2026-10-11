# Survey data protection implementation plan

**Goal:** Close anonymous database access, read all records for admin/export, and enforce the submission cooldown across Vercel instances.

**Architecture:** Both HTTP entrypoints use shared storage and client-identity modules. Supabase accepts writes through a service-only RPC which atomically enforces a 15-second cooldown and inserts a response. Local file storage remains available without Supabase.

**Constraints:** Node 20+, no production packages, preserve the survey response format, do not migrate live data or expose secrets. User will configure the server key and run SQL after receiving instructions.

## Tasks

- [x] Write regression tests for rejecting public database keys, pagination above the API row cap, and trusted client identity.
- [x] Implement `createStorage(options)` in `lib/storage.mjs`: private key validation, paginated reads, atomic RPC submissions, local-file fallback only outside Vercel.
- [x] Implement `clientHash(req, options)` in `lib/client-identity.mjs`: Vercel platform header or local socket address, HMAC hashing, reject missing trusted cloud identity.
- [x] Apply shared storage/identity to `server.mjs` and `api/index.js`; return 429 with Retry-After, fix newest-record ordering, retain validation and admin authentication.
- [x] Add SQL migration creating a private rate-limit table and service-only submission RPC; revoke anonymous/authenticated table access and old public policies without deleting submissions.
- [x] Verify migration permissions, repeat application, rollback on failed inserts, cooldown, and retry after cooldown in an embedded PostgreSQL test database.
- [x] Update example environment variables and rollout instructions: server key first, SQL migration second, redeploy reviewed code third.
- [x] Run all tests and syntax checks and request code review (19/19 passing; review clear).
- [ ] Push branch and create draft PR with rollout prerequisites.

## Review focus

- Missing/private key configuration must fail closed without filesystem fallback in cloud.
- Pagination must continue when Supabase's configured row cap is below requested page size.
- Rate limiting and insertion must be atomic; failed insert must not consume cooldown.
- Clients cannot select/write data or call the submission RPC directly using the public key.
- No raw IP addresses, server keys, or production survey data enter source/test logs.
