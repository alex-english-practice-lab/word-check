# DET Progressive Sampling

## Baseline and scope

Based on `main` commit `46f88434bc6f2e8e109d82cf240443e0da0b0d22`.
Only DET spelling gains a prefix selector. IELTS, Daily Recognition/Synonym,
grading, question timers, hints and results continue to use their existing engines.
No vocabulary data was edited. No runtime or package dependency was added.

## Teacher workflow

Open `/teacher/`, choose 多邻国词库, select only 难度 100, then choose
Vocabulary Scope → First N Words → 60. Choose total sampling and enter 20.
Keep the desired Full/Single mode, seconds per question and hint setting.
Select fixed test or random practice, then generate the student link.
The public homepage also supports the same scope for ordinary practice.

All Words remains the default. Selecting multiple groups resets the scope to All
and hides the prefix control; the group instructions explain that First N needs
one selected group. Changing libraries also resets the scope. N is validated
against that group's real size. Question counts are revalidated after changes.
Total count 0 means all eligible words, including all N words in prefix mode.
The existing per-list count 0 still means skip that list.
Links retain the existing maximum of 100 actual questions.
After a library-load failure, previously loaded words remain available as before,
but link creation is blocked until a library is successfully loaded again.

## Sampling and canonical boundary

Before: filter selected lists, then call `sampleMixed` or `sampleByList`, then
shuffle the resulting queue at `begin`.

Now, for prefix mode only: filter the one selected group, sort by canonical
`Word.order` (with the adapter's existing ID tie-break), slice first N, then use
the same samplers and queue shuffle. Never truncate a shuffled preview or sort
alphabetically. The original arrays are not mutated.
`vocabulary.js` now carries the canonical `order` onto each PracticeWord.
`core.prefixPool(words, listNumber, count)` is the shared pure eligibility query;
the UI passes a scope object `{type:'prefix', list, prefixCount}`. Additional
scope types can later be resolved before sampling without changing the samplers.

Library `lib:difficulty-100-120` v1.0.0 has 550 entries in 难度 100.
Its internal `list.number` is **1**, not 100.

| Position | Word | Stable Word ID |
| --- | --- | --- |
| 60 (order 59) | bulky | `lib:difficulty-100-120/word/43d1ec3e-12fc-4192-836f-1b9a00f6b069` |
| 61 (order 60) | burden | `lib:difficulty-100-120/word/1cc1fe6b-3a3b-4883-87c2-b32c89e49c26` |

The first is eligible for First 60; the second is never eligible.

## Link contract

Fixed prefix assignments keep **v3**: sample once from the eligible pool and
encode the selected words using the existing compact, version-pinned indexes.
Opening or restarting preserves the Word ID set and shuffles its order.
The scope need not be reconstructed because the selected questions are fixed.

Random prefix practice uses **v6**:

```json
{"v":6,"l":"lib:difficulty-100-120","lv":"1.0.0","m":"full","r":1,"p":60,"n":20,"t":15,"h":true}
```

| Field | Meaning |
| --- | --- |
| v | 6; implies prefix scope and total random sampling |
| l / lv | Library ID / exact library version |
| m | full or single |
| r | One actual internal list number |
| p | Positive integer prefix size, no larger than the selected group |
| n | Question count; 0 means all eligible words |
| t / h | Seconds per question / hints allowed |

Opening, refreshing or choosing another round reconstructs and samples the same
eligible scope anew. Wrong-answer retry retains that attempt's wrong words as
before. Separate rounds may overlap. v1/v2/v3 fixed links, full-list v4 random
links and Daily v5 links retain their existing decoders. v4 never reads scope
from the setup UI. Library/version mismatch, missing groups, invalid prefix,
excess counts and corrupt tokens fail closed.
The existing SHA-256 checksum detects corruption; it is not authentication.

## Changed files

| Files | Change |
| --- | --- |
| `vocabulary.js`, `types/schema-v1.d.ts`, `docs/ARCHITECTURE.md` | Preserve/document canonical practice-word order |
| `core.js` | Shared validated prefix pool |
| `preset-links.js` | v6 validation, encoding/decoding dispatch and scoped random sampling |
| `app.js` | Scope state, validation, normal practice, teacher links, student replay and failed-load guard |
| `index.html`, `teacher/index.html`, `category.css` | Matching compact scope controls and cache versions |
| `tests/scoped-sampling.test.cjs`, `tests/browser.cjs` | Data, compatibility and end-to-end regressions |
| `docs/teacher-links.md`, this document | Link contract and delivery report |

Browser regression also exposed an existing 8px Daily first-mode top margin
misalignment. A single CSS rule aligns it with the other setup controls; no Daily
practice logic changed.

## Verification

- `npm test`: 39 tests pass, including six new scoped-sampling tests. Coverage
  includes actual boundary IDs, reversed input order, unique 20-of-60 samples,
  count 0, v6 round-trip/resampling, fixed v3 identity, invalid inputs and
  unchanged full-group v4 eligibility. Existing v1–v5 tests remain in the suite.
- Browser harness: `WORD_CHECK_CHROMIUM=/path/to/chromium npm run test:browser`.
  Uses externally installed Playwright/Chromium, with no dependency changes.
  Covers ordinary DET practice, teacher fixed/random generation, repeated opens,
  replay, Full/Single, timer/hints, invalid N/count, load failure/retry, desktop
  setup and 390×844 mobile teacher/student interaction. Existing IELTS grading,
  TXT imports, Daily links, Recognition/Synonym and layout regression paths run
  in the same harness. Screenshots are generated in `test-artifacts/`.
- Syntax checks and `git diff --check` pass.

No known functional blockers remain after these checks. Mobile testing uses a
Chromium viewport, not a physical iPhone/Safari. This branch does not publish a
preview or production deployment and must be reviewed before merging.
