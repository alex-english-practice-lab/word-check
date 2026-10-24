# Word Check

Vocabulary checking website for students. The default IELTS vocabulary list is included and loads automatically.

## GitHub Pages

Publish from the `main` branch and the repository root in **Settings → Pages**.

## Phase 1 architecture

The root app loads `data/catalog.json` and the versioned default library through
`vocabulary.js`. The original TXT, checking rules, modes, sampling, and layout
are preserved. `github-word-check/` is an untouched duplicate legacy upload,
not the Phase 1 app.

Teachers can generate a preset student link from the setup panel. It stores the
exact stable Word IDs selected for that assignment, so every student receives
the same word set while question order is reshuffled whenever the link opens.
The link also fixes the per-question time limit and whether hints are allowed.
When a timer reaches zero, the answer is revealed and the question is recorded
as timed out; the student advances manually. Preset links support built-in
libraries, validate the library version and link fingerprint, and open directly
in a locked assignment flow. Version 3 links encode sorted, delta-compressed
word positions within the exact library version, then resolve them back to
stable Word IDs when opened. This keeps a typical 50-word link below 500
characters without using a server. Version 1 and 2 preset links remain
compatible; version 1 uses the legacy defaults of no timer and hints allowed.
Because GitHub Pages is static hosting, this is UI locking and corruption
detection rather than server-backed authorization.

The home page also links to a separate **Daily Vocabulary V3** pilot. It keeps
the existing spelling checker untouched and provides:

- Recognition: 309 reviewed English-to-Chinese four-choice questions.
- Synonym: 46 contextual exact-set multiple-selection questions.
- A searchable preview of the 1,172-entry V3 master vocabulary.
- Browser-local attempt history and a review pool; no account or cloud sync.

The V3 data review and pilot limitations are recorded in
[`docs/V3-REVIEW.md`](docs/V3-REVIEW.md).

The temporary TXT-import controls are hidden from the setup page for now. The
parser and import wiring remain in the code so the entry point can be restored
without rebuilding the feature.

- [Architecture, fields, IDs, migration, interfaces, and Phase 2 plan](docs/ARCHITECTURE.md)
- [Audit of the actual upstream source](docs/AUDIT.md)
- [Development and validation report](docs/PHASE1-REPORT.md)
- [Plain JSON type definitions](types/schema-v1.d.ts)

No build or runtime packages are required. Serve the repository root over HTTP
(for example `python3 -m http.server 8000`) and open localhost. Do not open the
HTML with `file://`: vocabulary loading uses fetch. No production deployment is
part of this branch.

## Tests

Node 20+ is needed only for development tests. Playwright is a pinned development
dependency; Chromium is downloaded to the developer's Playwright browser cache,
not bundled with the static website:

```sh
npm ci
npm run setup:browser
npm run test:all
```

For a system-managed Chromium, set `WORD_CHECK_CHROMIUM` to the actual executable
path before `npm run test:all`. The default Playwright cache installation does
not require this variable. Run an individual suite with `npm test` or one of
`test:browser`, `test:learn-browser`, `test:learning-assignment-browser`,
`test:progress-browser`, `test:student-identity-browser`, and
`test:assigned-cloud-browser`.
`test:assigned-cloud-browser` exercises assigned links and cross-browser sync using
the Worker handler with an in-memory SQLite test database. See
`docs/PR15-B-ASSIGNED-SYNC.md` for the data model and staging gate.

The legacy visual comparison in `test:browser` uses Git history containing
upstream commit `08e12ef`.

Screenshots compare before/after in the same installed browser. Browser suites
start and close local HTTP servers, exercise desktop and mobile viewports, and
write ignored `test-artifacts/` screenshots.

`practice-records.js` remains pure data logic. With a configured backend,
student-scoped spelling and V3 records can be synchronized; without it the
existing local practice flow remains available. The Worker and its D1 database
must be deployed separately from this static site.

