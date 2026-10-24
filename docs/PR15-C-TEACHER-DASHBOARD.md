# PR15-C · Teacher Dashboard

This PR is stacked on PR #16 (`feature/assigned-links-cloud-sync`), which is still a draft. It does not deploy, migrate a remote database, or enable the API origin. Merge PR #16 first, then retarget this PR to `main` and rerun the verification gate before merging. The static GitHub Pages teacher page is public HTML; the data endpoint requires a signed Cloudflare Access JWT with the configured issuer, audience and teacher email.

## Read path

The teacher settings page links to `teacher/dashboard.html`. The dashboard loads the teacher-only student roster (including disabled students for historical records), allows filtering by student and assigned task, and pages backward through submitted records. It displays the latest Learn session checkpoint and separate Know / Again self ratings, spelling Attempt/Answer details, and Daily Recognition/Synonym answers. Formal scores are labelled **client submitted**. A refreshed checkpoint replaces the earlier one under the same session ID; exact repeated final submissions are stored once. No unsubmitted local or Guest activity is visible.

| Endpoint | Access | Result |
| --- | --- | --- |
| `GET /api/teacher/assignments?studentId=<UUID>` | Verified teacher Access | Up to 200 recent assignment IDs and dates for this student. It does not return preset hashes or bearer link tokens. |
| `GET /api/teacher/records?studentId=<UUID>&assignmentId=<optional UUID>&before=<optional cursor>` | Verified teacher Access | Up to 25 records, student metadata, next cursor. Assignment filter must belong to selected student. |

`before` is a descending SQLite rowid cursor. It remains stable when a Learn checkpoint updates `updated_at`. The dashboard renders data with DOM `textContent` and never injects answer text as HTML. API responses contain the full submitted payload including student answers and canonical word snapshots; keep the Worker behind Access, use HTTPS and `Cache-Control: no-store`, and configure `FRONTEND_ORIGIN` to the deployed GitHub Pages origin. The GitHub Pages route itself cannot be protected by the Worker; an unauthorized viewer sees an empty shell and an access error.

## Verification and limits

`npm test` covers student isolation, assignment ownership, pagination, checkpoint updates, deduplication and unauthorized teacher routes. `test:assigned-cloud-browser` uses signed mock Access and the actual Worker handler; it covers authorized and unauthorized views, student/assignment filters, empty results, loaded answer details, pagination, request failure/retry, and mobile layout. Existing browser suites are run as regression checks.

Scores and times originate from the student's browser. Neither the Worker nor this dashboard verifies that a student personally completed the work, and an assigned link or name-only Student ID can be used by anyone possessing it. Record delivery may be delayed while the student's browser is offline. No claim of teacher remote completion monitoring is made for sessions without submitted records.

Before exposing the teacher view to real students, complete the PR15-B staging gate: D1 backup and migration, real Cloudflare Access/CORS tests from the Pages origin, desktop and phone checks with actual Worker+D1, and a careful review of the identity and client-submitted-result limitations. `student-config.js` remains unset.
