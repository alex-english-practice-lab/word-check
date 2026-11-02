# PR20 — Cloudflare deployment and acceptance

This branch prepares the existing Worker and teacher dashboard for a private classroom pilot. It does **not** enable the production student API. `student-config.js` remains empty until all live gates below pass. `backend/wrangler.jsonc` now identifies the provisioned `word-check-classroom` D1 database; deployment still requires authenticated migration and Worker steps.

## Current evidence

- Base: `main` at `2a28c804`, including Single Meaning PR #19.
- Local Wrangler 4.156.0 is unauthenticated (`wrangler whoami`). The Cloudflare dashboard shows a newly provisioned `word-check-classroom` D1 database with UUID `cecf28ba-6e8b-429a-b4ba-922592fe1b13`, zero tables, plus a connected `word-check-classroom-api` Workers Builds project targeting `feature/cloudflare-production-deployment`. The build root is `backend`, the deploy command is `npm run deploy`, and the build environment now has restricted Wrangler credentials supplied as secrets. Account plan, successful remote migrations, Zero Trust, Access application, teacher email, and Worker URL remain **unverified**.
- A deployment-trigger commit was pushed after the restricted build credentials were configured; its remote build result must be recorded before this evidence is upgraded.
- `npm ci`, `npm run setup:browser`, the project test suites, local D1 migrations, foreign key check, and `wrangler deploy --dry-run` are local checks only. A dry run does not prove that the remote D1 binding or deployed Worker is usable.
- `/api/health` now performs a D1 read (`SELECT 1`) instead of checking only that a binding object exists.
- Opening an assigned link temporarily selects its student in the current tab. The ordinary saved Student ID and the other student's local namespace are preserved. Navigation into or out of `#assigned=` reloads so the correct profile initializes.

## Account access required

Use a Cloudflare OAuth session in this development environment or provide a restricted Cloudflare API token through a secure secret environment. Do not paste tokens, JWTs, assignment links, or a Global API Key into a PR or chat. Confirm the actual teacher email privately when setting Worker secrets. Inspect the account plan and existing project resources before creating anything. Stop before a paid-plan change and obtain approval.

## D1 and Worker procedure

From `backend/`:

1. `npx wrangler whoami`; inspect `npx wrangler d1 list` and `npx wrangler deployments list --name word-check-classroom-api` (or the dashboard) for existing project resources. Confirm the account and Free Plan.
2. Reuse `word-check-classroom` if it belongs to this project; otherwise create it once with `npx wrangler d1 create word-check-classroom`. Put the **actual** UUID in `backend/wrangler.jsonc`, retaining binding `DB` and `SELECT_LIMITER`.
3. Inspect existing tables, migration history, and data. Back up any populated database first. `npm run db:migrate:remote` applies only unapplied versions through Wrangler and records them in `d1_migrations`; the production `npm run deploy` script runs this migration step before publishing. Verify tables, indexes, foreign keys, and a real D1 read/write. Never delete a populated database to fix a migration.
4. Configure one Cloudflare Access self-hosted application for the actual Worker hostname and **both** `/teacher/*` and `/api/teacher/*`, with one teacher-specific Include policy. Do not protect the whole Worker: `/api/student/*` and `/api/assignment/open` must remain reachable without Access. Confirm the application AUD and team-domain issuer from Cloudflare. Set `ACCESS_ISSUER`, `ACCESS_AUD`, and `TEACHER_EMAIL` with `wrangler secret put` without printing their values. The Worker verifies JWT signature, issuer, audience, expiry, and teacher email.
5. For Workers Builds, connect this repository, use `feature/cloudflare-production-deployment` during acceptance, set Root directory to `/backend`, leave Build command empty, and set Deploy command to `npm run deploy`. The script applies pending D1 migrations, copies the existing Dashboard to the Worker asset directory, generates a same-origin public `student-config.js` containing only `location.origin`, validates deployment config, and deploys the Worker. Record the **actual** HTTPS Worker origin and deployment version.
6. The protected Dashboard is at `<actual-worker-origin>/teacher/dashboard.html`. It calls `/api/teacher/*` on the same origin, avoiding third-party Access cookies and teacher CORS preflight. The student site stays on GitHub Pages. Its existing teacher dashboard URL remains a legacy route until a tested entry-point change is approved. Access must protect both the HTML/JS/CSS path and API path; the Worker also validates Access for these routes. Shared `style.css` and generated `student-config.js` are public but contain no private data.

Cloudflare's [Access CORS guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/) documents third-party cookie restrictions and OPTIONS behavior. [Worker static assets](https://developers.cloudflare.com/workers/static-assets/binding/) support the dashboard assets binding. [Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) define path matching; verify the actual configuration against the live hostname.

## Live acceptance, before any GitHub Pages API change

- `GET /api/health` returns `200 {"ok":true}` with real D1 available. Check D1 directly too; this route is a read check, not a migration or write check.
- Unauthenticated `/api/teacher/students`, `/api/teacher/records`, and `/teacher/dashboard.html` fail. A student Bearer token, fake Access header, expired JWT, and a token for another audience cannot read teacher data. The real teacher Access login opens the Worker-hosted dashboard and its student list.
- From the GitHub Pages origin, student login and record APIs have the exact CORS origin. Test cross-origin OPTIONS where applicable; teacher dashboard uses same-origin API. Test Chrome desktop, an Incognito session, and mobile Safari if available. Do not mark unavailable physical-browser scenarios as passed.
- Create **fictional** A and B students only through authenticated teacher API. Verify aliases map to A's same UUID; unknown IDs fail; A/B/Guest records isolate; assigned fixed and learning links bind A; cross-device Learn, Check, Single Meaning cue records, retry, and dedupe work in the real Worker/D1. Verify Dashboard shows completed versus pending facts accurately.
- Verify legacy v1–v7 links, DET prefix sampling, IELTS/DET/Daily/Core100, and desktop/mobile viewport. Record actual requests, responses, D1 rows, and browser results without exposing tokens or real student data.
- Only then set the actual Worker HTTPS origin in root `student-config.js` on this PR, update its cache key in HTML, and validate the resulting GitHub Pages bytes after merge/deploy. Do not put a sample origin in production. Create real students only after the pilot gates pass.

## Rollback and limitations

Keep the previous Worker deployment and a D1 restore point or export. On failure, stop new submissions, preserve browser local records and pending queues, and restore the previous Worker. Do not delete D1 or assume clearing `apiBase` exposes all previously scoped named history; test export/recovery before a frontend rollback. The current static site does not provide server-side proof of exam performance or teacher remote verification of incomplete offline work. Random checking recipes cannot be student-bound with the current assignment API.
