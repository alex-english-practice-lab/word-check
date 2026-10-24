# PR15-B · Assigned links and cloud record sync

This branch starts from `main` `f1734be` (merged PR15-A). It adds an optional backend path to the existing static GitHub Pages client. `student-config.js` still has an empty API origin. No Cloudflare database, student, Access policy, or production deployment is created here. Teacher Dashboard and teacher logs are PR15-C.

## Teacher and student flow

- The teacher page retains ordinary v1–v7 links. When the Worker is configured and a teacher passes Cloudflare Access, its student selector loads active students from the teacher-only API. Selecting a student wraps a **fixed** existing preset in a server assignment; random Checking links must use the ordinary unassigned path. Learning links already contain fixed Word IDs.
- The resulting `#assigned=<random token>` URL does not contain the Student ID or vocabulary preset. The Worker stores only a SHA-256 token digest, a Student UUID, the original preset hash, and an expiry (default 30 days). The URL itself is a bearer credential: anyone holding it can act as that student. Name-only Student ID entry has the same impersonation limit.
- Opening an assigned link requires the Worker. It restores the assigned UUID, loads the unchanged v1–v7 preset through the existing decoder, and starts the corresponding Check or Learn flow. Switching to a different UUID is rejected. “Continue Without Recording” is hidden on this route; Log Out exits the assignment. Ordinary links and Guest remain available.
- The client saves attempts locally first and synchronizes through `/api/student/records`. Results display an explicit pending/error message and a retry button if the server does not accept them. Local data is retained. A static page cannot force a student to finish, keep a browser open, or submit after intentionally blocking network requests. Dashboard data should be labelled client reported rather than server verified.

## Data and API

Migration `0002_assignments_records.sql` adds `assignments` and `student_records`. Records use `(student_id, kind, record_id)` as a unique key. `check` and `daily` facts are immutable: identical retries deduplicate, conflicting payloads fail with 409. `session` is a latest-checkpoint record and can advance only when `session.updatedAt` increases. Each record optionally carries an assignment ID that must belong to the bearer Student UUID. The server derives ownership from its session token, not from a submitted name.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /api/teacher/assignments` | Verified Cloudflare Access JWT | Bind an active Student UUID to an existing preset hash. |
| `POST /api/assignment/open` | Opaque assignment URL token, rate limited | Return the bound student, original preset, assignment ID, and a revocable student session. |
| `GET /api/student/records?after=...` | Student bearer token | Read that student's records in pages of 100. |
| `POST /api/student/records` | Student bearer token | Save one validated, idempotent record in that student's namespace. |

The client syncs Learn session checkpoints, terminal spelling Attempts/Answers, and terminal Daily Recognition/Synonym attempts. It downloads remote history before uploading newer local records. The existing local progress calculation is rebuilt from those facts. Guest uses memory only and never calls the records endpoint. Shared pre-identity history is not uploaded. A PR15-A **named** namespace with an older device profile gets a local byte-for-byte backup before its profile references are remapped to the stable Student UUID.

Server records reflect client answers and timestamps; the Worker does not independently reconstruct a quiz from its canonical vocabulary. This is not an exam integrity system. Failed writes leave the local record for a later retry, and the UI must not report cloud delivery when the request fails. A browser cleared before retry loses its unsent local facts.

## Verification and deployment gate

Run `npm ci`, `npm run setup:browser`, and `npm run test:all` (or point `WORD_CHECK_CHROMIUM` at the installed executable). New SQLite-backed unit tests cover binding, expiry, UUID isolation, immutable duplicates/conflicts, checkpoint advancement, pagination, route authorization, and named profile migration. The Playwright test uses the actual Worker handler with an in-memory D1-compatible SQLite adapter and mocked Cloudflare Access signing; it covers desktop/mobile fixed and Learning links, Learn progress resumed in another browser context, spelling/Daily history sync, wrong-student denial, Guest isolation, offline retry, and invalid/expired links. Existing browser suites still cover old preset versions and layouts.

Before enabling a production API origin: back up D1, apply migration `0002` in staging, verify Cloudflare Access cookies/CORS from the GitHub Pages teacher origin, test a real Worker + D1 + Access deployment on both phone and desktop, and inspect teacher/student identity and retry behaviour. This local test does **not** replace that staging gate. Keep `student-config.js` unset until it passes.

## PR15-C boundary

Teacher Dashboard should read these student-scoped submitted records through a verified teacher endpoint. Add browser tests for authorized/unauthorized teacher views, per-student filtering, empty and failed states, repeated submissions, and the distinction between self ratings and objective Check results. No Dashboard is implemented here.
