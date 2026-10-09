# Word Check

Vocabulary checking website for students. The default IELTS vocabulary list is included and loads automatically.

## GitHub Pages

Publish from the `main` branch and the repository root in **Settings → Pages**.

## Phase 1 architecture

The root app loads `data/catalog.json` and the versioned default library through
`vocabulary.js`. The original TXT, checking rules, modes, sampling, and layout
are preserved. `github-word-check/` is an untouched duplicate legacy upload,
not the Phase 1 app.

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

`practice-records.js` is pure tested data logic, intentionally NOT connected to
the page or a persistence backend in Phase 1. No learning records are saved yet.

