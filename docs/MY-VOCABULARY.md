# My Vocabulary and local review (PR 3)

## Facts and derived state

The browser retains the existing `word-check.learn.v1.*` LearningSession and Practice Attempt/Answer records. Spelling checks started outside Learn now write the same Practice Attempt/Answer schema as Learn Final Check. Answers are saved when graded, then the attempt is closed as completed or abandoned; an unfinished attempt's submitted answers remain facts. Repeated practice creates another attempt, and stable answer IDs are deduplicated during projection.

Daily V3 Recognition and Synonym keep their existing `wordcheck.v3.practice.local.v1` store and its question-level wrong-only filter. The My Vocabulary projection reads those attempt snapshots directly, once, under their existing `word_id`, `question_type`, and library identity. It does **not** copy them into the spelling store. Recognition and Synonym retain their original selected/correct option IDs and context in the original snapshots. Flashcard exposures/Know/Again are independent self-assessments, never a formal correct answer.

`vocabulary-progress.js` derives one row per `(libraryId, wordId, mode)` from fact IDs and timestamps, then counts unique `(libraryId, wordId)` for the dashboard. Modes include `flashcard`, `full`, `single`, `recognition_single`, and `synonym_multi`. Identical spelling across different libraries cannot merge. A library revision may keep a stable Word ID; historic facts preserve their version and answer snapshots. Guest identity is local; the older Daily V3 store has no per-profile identity and belongs only to the current browser.

## Scheduling

An initial exposure is due the next day. The first, second, and third successful recall/independent correct events schedule +1, +4, and +8 days from the answer timestamp; further successes stay at +8. Again or an objectively wrong answer resets the interval and is due immediately. Assisted correct schedules the next day but is never counted independent. `dueAt` is derived from facts, so it can be rebuilt after a refresh. Due counts refer to distinct words; the mode rows retain their separate schedules. The dashboard's Needs More Practice count covers words whose most recent event in any mode was Again or wrong. Checked means at least one actual submitted answer, not mastery.

Today's New/Due/Needs buttons select a filter for the currently selected built-in Library and List; students may still choose other content. No account, cross-device merge, automatic background notification, server submission, or import from JSON is included. The JSON export contains the local profile identity, valid learning sessions, valid spelling attempts/answers, and Daily V3 practice store for backup. It can be inspected and preserved externally, but this release has no restore UI.

## Migration and limits

The storage keys and records remain compatible. Older Daily V3 releases kept only the most recent 100 attempt snapshots while keeping question-level aggregate progress. Removed facts cannot be reconstructed. New Daily V3 attempts are retained without that cap so future My Vocabulary totals can be rebuilt. The older wrong-only filter keeps its two-consecutive-correct rule; it is a question-level retry filter, whereas Today's Due is a word-and-mode schedule. These are deliberately labeled differently.

Damaged Learn records are omitted with a visible warning. A damaged/unreadable Daily V3 store is not silently overwritten by a new attempt. A failed save shows a warning and permits practice to continue in memory where applicable. Browser data deletion still removes local records; the backup export is the safeguard. A future sync service should assign immutable IDs to Daily V3 answers and a profile ID on ingestion, resolve device identity explicitly, and dedupe by attempt and answer IDs before deriving Word Progress; never upload an aggregate as a replacement for facts.

## Verification

`npm test` covers scheduling, mode isolation, ID deduplication, corrupted storage, cross-refresh records, and older preset compatibility. With a separately installed Chromium, `npm run test:progress-browser` covers desktop/mobile Learn, formal grading, refresh, and JSON export. The existing `test:browser`, `test:learn-browser`, and `test:learning-assignment-browser` cover the other student and teacher paths.
