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

Node 20+ is needed only for development tests:

```sh
npm test
```

Optional real-browser regression against upstream commit `08e12ef`:

```sh
npm install --no-save --package-lock=false playwright@1.51.1
npx playwright install chromium
npm run test:browser
```

Playwright is an optional development tool, not a website dependency. Use the
version reported in the development report for the exact baseline test setup;
screenshots compare before/after in the SAME installed browser, not with old
images from another browser version. The test starts and closes its own local
HTTP server, tests the `/word-check/` project subpath, and writes ignored
`test-artifacts/` screenshots. It requires Git history containing the baseline.

`practice-records.js` remains pure tested Phase 1 data logic and is not connected
to a backend. The V3 pilot saves its own isolated practice state in localStorage;
it does not implement accounts, cross-device sync, or the general Phase 2 record
system.

