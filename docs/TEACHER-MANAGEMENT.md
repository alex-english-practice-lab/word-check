# Teacher management

The protected teacher dashboard now includes student profile and assignment management.

- Select a student, then expand 学生档案与作业管理. Edit their display name and comma-separated login aliases. The UUID and historical records remain unchanged. Removed aliases remain reserved to their original owner.
- Disable stops student authentication, assignment opening and submissions. Disabling also deletes the student's existing sessions in the same transaction. Re-enable requires a fresh login; unexpired, unrevoked assignment links work again.
- New assigned links default to 30 days; the teacher setup supports 1–90 days. Existing assignments can have their expiration changed to a future time within 90 days. The dashboard uses the device's local timezone.
- Revoke permanently disables that link. It cannot be restored by extending expiration. Previously submitted records remain readable, including through the assignment filter.
- Expiration/revocation is checked when opening and submitting. Already rendered questions are not remotely removed. Offline work uploaded after closure is refused and remains local. Other valid records continue syncing. Extend an expired assignment to allow retry; revoked assignments require a new link.
- The dashboard lists the latest 200 assignments for the selected student, consistent with the existing endpoint limit. Original bearer links cannot be recovered because the server stores only token hashes.

Deployment requires additive D1 migration `0003_assignment_revocation.sql` before the new Worker code. The existing backend deploy script applies migrations first. Do not edit or delete existing student/record tables.

Validation: student API, assigned-cloud and teacher-dashboard unit tests; teacher-management browser test against the actual Worker handler, signed teacher JWT and in-memory SQLite. The browser test covers edits, alias collision, disabling/re-enabling, expiration, revocation, retained historical results, mobile width and a rejected record not blocking another upload. Browser requests are fulfilled in-process, so it does not test production Access/network configuration.
