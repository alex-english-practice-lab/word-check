# Daily Vocabulary V3 review

Reviewed before integration on 2026-10-15. The source was the revised V3 data
package and its matching integration package. Matching SHA-256 hashes confirmed
that the three integrated JSON files are identical to the reviewed files.

## Verified inventory

| File | Verified content |
| --- | --- |
| `daily_v3_master.json` | 1,172 master entries |
| `recognition_v3_pilot.json` | 309 four-choice pilot questions |
| `synonyms_v3_questions.json` | 46 contextual multi-select questions |

The Recognition file intentionally covers only part of the master vocabulary.
The site therefore describes 309 usable questions rather than implying that all
1,172 entries already have a four-choice question.

## Structural checks

- Master word IDs are unique and are not derived from array positions.
- Canonical English terms have no case-insensitive duplicates.
- Master entries have non-empty meanings and senses.
- Recognition question IDs and prompts are unique.
- Each Recognition question has exactly four distinct options, one valid answer,
  a valid master word reference, and a valid tested-sense reference.
- Each Synonym question has distinct options and a non-empty, valid exact answer
  set. Fourteen questions have two answers, 29 have three, and three have four.
- All 46 Synonym questions are marked `ready_for_pilot`; 12 use independent
  stable word IDs rather than a related master-entry ID.
- Automated source validation, migration, snapshot, reference, and practice-core
  tests passed before integration.

## Editorial cautions for the pilot

Synonym questions test meaning similarity in the supplied context, not universal
grammatical interchangeability. The UI states this and grades an exact set.
Items such as `complex → sophisticated`, `provide → offer`, and
`confirm → double-check` remain useful pilot candidates but should be watched in
classroom feedback. Recognition entries `gulf` and `bay` both use the broad
Chinese answer “海湾”; this teaches recognition but not their distinction.

These issues do not invalidate the data structure or block a classroom pilot.
They should be considered content-review items before calling the bank final.

## Integration decision

V3 is exposed as a separate practice category/page. Its question schema differs
from the Phase 1 spelling-library schema, so the files are not inserted into the
IELTS library catalog. This preserves the existing spelling flow while keeping
the V3 question IDs, answer snapshots, and local review state intact.
