# PR15-A · Student identity and backend foundation

This branch starts from `main` at `6f907b7f`. It contains the identity and storage isolation layer only. Cloud learning/answer sync, assigned tokens, and teacher logs remain PR15-B/C. The current GitHub Pages site is unchanged until `student-config.js` is given a real API origin. **No real student account or historical record is created or uploaded by this PR.**

## What this phase changes

- Cloudflare Worker API and D1 migration for `students`, permanent `student_aliases`, and revocable, 30-day `student_sessions`.
- `zining` and `isabella` can map to the same UUID after a teacher creates the record. Matching uses Unicode NFKC, whitespace trimming, and case normalization. Unknown IDs fail; students cannot self-register. Removed aliases remain reserved for their original UUID.
- Student endpoints: `POST /api/student/select`, `GET /api/student/profile`, `POST /api/student/logout`. Select is rate limited. The returned opaque bearer token is held only in page memory; the saved default contains UUID, display name, and alias, then gets revalidated against the backend at load. The name-only model can be impersonated by anyone who knows an alias.
- Teacher endpoints: `GET/POST /api/teacher/students`, `PATCH /api/teacher/students/:uuid`. Every teacher route validates the signature and claims of a Cloudflare Access JWT against remote JWKS, the configured issuer/audience, and one configured teacher email. A client-supplied header without a valid signature does not grant access. No admin credential is sent to students.
- When activated, Learn, spelling, Daily V3, and the separate `practice.html` page use storage keys under the Student UUID. Guest uses memory only. Preexisting `word-check.learn.v1.*` and `wordcheck.v3.practice.local.v1` records stay where they are and are never assigned to a name automatically. Switching students reloads controllers; unfinished records remain within the previous UUID's namespace. A Guest does not read them.
- Existing v1–v7 teacher links continue to run as regular unassigned links. When the API is not configured, the old local-only site remains active on devices that never enabled identity. A device that has enabled identity remains Guest-only if API config is later removed, to avoid showing the old shared legacy record namespace.

Identity selection **does not sync learning records yet**. The UI calls this “本机记录” and does not claim cloud submission. PR15-B must add immutable sync and assigned links before switching production to named mode.

## Cloudflare setup (not performed by this PR)

1. Create a Cloudflare account and D1 database: from `backend/`, run `npx wrangler d1 create word-check-classroom`. Replace the all-zero `database_id` in `wrangler.jsonc` with the returned UUID. Do not deploy with the placeholder.
2. Create a Cloudflare Access self-hosted application protecting the Worker teacher API path, limited to the teacher's own email. Copy the **team domain** (`https://<team>.cloudflareaccess.com`) and the application's **AUD tag**. The Worker independently verifies the JWT even if a route is accidentally exposed. Restrict or disable public indexing of the teacher page; the actual data protection is the Worker validation.
3. Configure server-only variables with `npx wrangler secret put ACCESS_ISSUER`, `npx wrangler secret put ACCESS_AUD`, and `npx wrangler secret put TEACHER_EMAIL`. Never add actual values or Access JWTs to this repository. Verify the Access application issues a JWT for the same AUD and email.
4. Apply migrations to the local test D1 first: `npx wrangler d1 migrations apply word-check-classroom --local`. Run `npx wrangler dev` and test the API. Back up the production D1, then run `npx wrangler d1 migrations apply word-check-classroom --remote` only after review.
5. Deploy with `npx wrangler deploy`. Test `/api/health`, rate limiting, unknown Student ID, student logout, and teacher API denial without an Access JWT. To enable the student identity UI later, set `apiBase` in root `student-config.js` to the deployed HTTPS Worker origin and publish GitHub Pages. The Worker allows only the configured `FRONTEND_ORIGIN` in browser CORS; use a separate local Wrangler config for localhost testing.

The D1 UUID and Access values are account-specific. Until configured and verified, this repository cannot truthfully claim a deployed or secured backend. The checked-in Worker has no student seed data. Add the 2–3 real students **only after** the teacher validates the service and decides the desired aliases; sample names in tests use an in-memory SQLite database.

## Rollback and migration

- First export/back up D1 and preserve browser data. Revert the Worker deployment if needed; keep the database and secrets intact for recovery.
- Disable the named UI by clearing `apiBase`. Previously activated browsers then run Guest in memory and do not expose the pre-identity shared storage. Browsers that never activated identity retain their previous local-only flow.
- Do not delete existing local records or silently upload them. PR15-B may offer an opt-in migration tied to an explicitly selected UUID with deduplication; shared-device history cannot be attributed safely without a person checking it.
- D1 migration `0001_students.sql` is additive. Rolling back the application does not require dropping tables. Restore from a D1 backup only for database corruption; never drop student data as part of a code rollback.

## Verification

`npm test` uses an in-memory SQLite D1-compatible adapter to execute the actual migration and route SQL. It checks alias equivalence/conflicts, JWT signature/issuer/audience/email, disabled accounts, rate limiting, Guest and UUID storage separation, and legacy fallback. Existing vocabulary/preset suites continue to run.

With Chromium and Playwright installed separately, `npm run test:student-identity-browser` checks desktop and mobile identity selection, switching, Guest, and record isolation against a mocked API. A real Cloudflare D1/Access staging deployment must be validated before production, followed by PR15-B and C.

Official setup references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Worker rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
