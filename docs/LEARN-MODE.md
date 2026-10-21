# Learn Mode — Phase A MVP

## Baseline and delivery boundary

Main was audited at `46f88434`. DET PR #7 remains open, with v6 implemented at
`db9128d585e8330172b7a60c3edf45886ce81520`. This feature is a separate branch/PR
stacked on that DET branch so its changes can be reviewed independently. Neither
branch is merged or deployed by this work. Merge DET first, then retarget this
PR to main if ancestry is preserved. If DET is squash-merged, rebase the Learn-only
commit onto the new main before retargeting, so DET does not appear twice.

Phase A supports **IELTS and DET spelling packs**. Daily Recognition/Synonym,
the independent teacher page, existing preset links v1–v6 and DET prefix sampling
remain Check features. Phase B is not implemented: no teacher word picker,
Learning Assignment link, Daily learning adapter or new preset version is added.
v6 remains DET scoped random; a future learning format must use an unoccupied
version (currently v7 is a candidate, not an implemented contract).

## Audit and integration

- `app.js`: legacy spelling selection, shuffle, `begin`, render, normalization,
  grading and results; no existing automatic spelling history storage.
- `vocabulary.js`: canonical Library → List → Word, registry and practice adapter.
- `practice-records.js`: pure v1 Attempt/Answer creation, validation and closure;
  previously schema/logic only. Reused for objective learning-pack checks.
- `home-v3.js` / `practice-core.js`: independent Daily question schema, grading,
  local history and teacher v5 links. No engine changes.
- `preset-links.js`: v1–v6 support retained without modification.
- `index.html` / `teacher/index.html`: shared Check markup, separate teacher entry.

The student homepage now starts with Learn and Check choices. Check opens the
existing settings; `#check` is also a direct entry. Teacher and `#preset=…`
links bypass the chooser as before. Learn uses isolated sections/controllers on
the same page, so it can hand the exact pack to the existing spelling engine even
when local storage is unavailable. No third-party framework or dependency added.

## Workflow and invariants

1. Choose library, one List/difficulty, new/old/needs-review/all, and count.
   Default count is 8; the limit is actual eligible words, not a hard-coded 8.
   Select randomly once without replacement. Save explicit IDs and a separate
   randomized learning order. Never reorder/copy the source vocabulary file.
2. New words start English → Chinese. Next is disabled until that card has been
   flipped. Going backward preserves exposure facts but does not introduce the
   next unseen word. All new cards must be exposed before Review becomes available.
3. Previously exposed words begin Chinese → English; mixed packs introduce only
   the unseen subset, then review the full pack. Review front has no phonetic or
   explicit English prompt. Native buttons support pointer, touch, Enter and Space.
4. Know/Again are enabled only after revealing the answer. Each rating is a
   separate self-assessment fact. Again is pending for the next round. Next round
   shuffles pending IDs and avoids the last card as its first when more than one
   remains. A one-word round stops at a summary, requiring an explicit continue.
5. Ending Review early retains all unrated cards as pending. Summary distinguishes
   self-rated known from still needing review; it never calls this a test score.
   Students can continue, pause or enter Check without an infinite loop.
6. Final Check loads the same exact library/version and IDs into existing Single
   spelling mode. Default: no hints and no timer; optional settings are saved in
   the pack. Source words, accepted variants, objective grading and result display
   are unchanged. Restart tests the same pack; retry tests that attempt's misses.

## Data and persistence

See `types/learning-v1.d.ts` for fields. Pure transitions and validation live in
`learn-core.js`; persistence is in `learn-store.js`; DOM integration in
`learn-ui.js`. `app.js` exposes a small pack-to-check bridge plus lifecycle hooks.

| Entity | Identity and purpose |
| --- | --- |
| LearningPack | UUID; library ID/version, exact Word IDs, explicit order, source, directions and final-check settings |
| LearningSession | UUID; local profile, pack ID, timestamps, stage/status, card/index/face, exposure facts, pending queue, rounds and check attempt IDs |
| FlashcardReview | UUID per rating; session/Word ID, direction, flipped, know/again, round and timestamp |
| LearningCheckBundle | Session ID + existing v1 PracticeAttempt and AttemptAnswers; snapshot prompts/accepted answers, actual responses, hints, skip/timeout and objective results |

LocalStorage keys are under `word-check.learn.v1.`:

- `identity`: random local profile/device UUIDs, no login identity.
- `active`: most recently saved session ID.
- `session.<id>`: pack + study session and self-rating facts.
- `check.<attemptId>`: objective attempt + answers, separate from self-ratings.

Every flip/navigation/rating is saved. Every submitted objective answer is saved.
Unseen means no compatible local study/check record. Exposure → Learning,
self-rating → Reviewing, a completed objective attempt → Checked. Checked means
tested at least once, **not** mastered. Needs-review follows study self-ratings;
formal wrong-answer history remains separate. These states use stable Word IDs
within the exact library version, never spelling strings or dates alone.
No long-term mastery or spaced-repetition score is inferred from Know.

On reload, the user explicitly resumes the saved pack/card/pending queue. An
interrupted Check resumes at a restart notice: a new same-pack attempt begins,
and the old attempt is marked abandoned while retaining submitted answers.
Unanswered words are never recorded as correct or completed. Objective question
order/prompts and results are frozen inside each attempt. A completed subset
retry does not falsely complete an entire pack. Historical attempts remain intact.

Malformed local records are skipped with a visible message. Exact-version or
missing-word mismatch blocks resume/check; it never samples replacement words.
Denied storage/quota exceptions fall back to in-page memory with a visible warning.
Clearing browser data loses records. Storage is local, not a backup or proof of
completion. Concurrent edits to the **same** session in multiple tabs are not a
supported synchronization workflow in this MVP; separate sessions have separate keys.

## Verification

- `npm test`: **48/48 pass**, including nine learning transition/storage tests.
- `WORD_CHECK_CHROMIUM=/path/to/chromium npm run test:browser`: existing Check
  regression harness: **passes**. It now clicks Check on the student landing screen.
- `WORD_CHECK_CHROMIUM=/path/to/chromium npm run test:learn-browser`: learning
  end-to-end suite: **passes** for desktop and 390×844 mobile viewport. Covers required flips,
  keyboard activation, pause/reload, pending Again, old-word direction, same-ID
  final check, a genuine 1/3 score after three Know ratings, interrupted answers,
  timer/assisted/timeout grades, storage denial/corruption and version mismatch.
- Screenshots in `test-artifacts/` (not committed); no physical Safari/iPhone test.

Changed files: `index.html`, `teacher/index.html`, `app.js`, `learn-core.js`,
`learn-store.js`, `learn-ui.js`, `learn.css`, `types/learning-v1.d.ts`,
`tests/learn.test.cjs`, `tests/learn-browser.cjs`, `tests/browser.cjs`,
`package.json` (test command only), and this document. Canonical vocabulary and
existing link codecs are unchanged. No known functional blocker remains in
Phase A after the above tests; Phase B features are deliberately not delivered.

## Phase B next steps (not started)

1. Add teacher selection of explicit Word IDs and pack settings using the same
   validator/resolver; keep teacher identity claims out of static links.
2. Allocate a new preset format after rechecking version occupancy. Pin library
   version and exact IDs/compact references, preserve v1–v6 decoding and fail closed.
3. Open shared learning packs directly, bypass setup; use local sessions per pack
   without implying cloud completion or teacher-visible results.
4. Build explicit Daily entry/sense/question adapters and verify fixed final
   Recognition/Synonym question mappings. Do not map entries by English text.
5. Add cross-browser and assignment-specific regression before considering merge.
