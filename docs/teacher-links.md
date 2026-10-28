# Teacher links
The unlisted /teacher/ entry uses the same app and data as the public homepage.
Its HTML mirrors index.html with a base URL, noindex/nofollow, teacher marker,
and link-type selector. Keep shared markup changes in sync between these two HTML files.

The public homepage retains free practice but has no teacher link or link generator.
Existing v1/v2/v3 fixed links remain supported. VERSION stays 3 for compatibility.
RANDOM_VERSION=4 stores library/version, mode, sampling type, list numbers,
per-list counts or mixed count (0 = all), time limit, and hint policy.
Student links always point to the public site root, not /teacher/.
New Single Meaning links use an optional `i` boolean to fix the first-letter
cue setting. v3/v7 compact it as 0/1; v4/v6 retain the boolean. Old links
without `i` keep their original meaning-only prompt (no POS or initial), while
new free and assigned Single sessions display POS and optionally the initial.
Full Meaning links never use the cue field. See `SINGLE-MEANING-PROMPT.md`.
Each open/refresh or "practice another set" samples again. A sampled word may recur.
Wrong-answer retry still uses that attempt's wrong words, not a fresh random pool.
Both link types support at most 100 actual questions. Missing lists, excess counts
and library-version mismatches fail closed.

This is UI separation, NOT access control. The repository and word data are public.
SHA-256 checksums detect corruption only; they are unkeyed and can be recomputed.
No passwords, authentication, student identities, backend or submissions are added.
DAILY_VERSION=5 supports Daily Vocabulary V3 Recognition and Synonym links.
Fixed V3 links store compact question indexes; random V3 links store mode, category,
and question count. Both shuffle question and option order. Local wrong-answer filtering
cannot be shared and disables link generation. V3 currently has no spelling timer or
letter-hint controls, so those settings are not part of V3 links.

SCOPED_RANDOM_VERSION=6 is limited to DET spelling practice with one selected
difficulty group. It stores the library/version, the group's internal `list.number`,
the canonical prefix size, total question count (0 = the full prefix), spelling
mode, time limit, and hint policy. The student client reconstructs the eligible
pool by sorting that group on the canonical word `order`, slicing the prefix, and
then sampling without replacement. It never treats the displayed difficulty name
(for example, "难度 100") as the internal list number. Fixed scoped assignments
continue to use v3 and store the already-sampled word indexes. Existing v4 recipes
have no prefix field and continue to sample from their complete selected lists.

LEARNING_VERSION=7 is a separate, fixed Learning Assignment. Its token contains
the builtin Library ID and exact version, a user-visible pack name, an ordered
set of stable Word IDs (UUID suffixes compacted to 16-byte values), the
Learn → Review directions implicit in LearningPack v1, whether Final Check is
included, and the spelling mode, timer and assistance permission. The token
does not contain a random sampling recipe: the teacher's List / DET prefix / manual
selection is resolved at link creation. The student looks up every exact ID in
the version-pinned library, failing with an error if the version or an ID is
missing. Reopening the same link keeps the same IDs and resumes an incomplete
session in this browser; after completion, reopening starts a new session.
An oversized link (>2000 characters) produces a clear teacher-side error.
There is no teacher dashboard, remote completion proof, login, or server-side
enforcement. A public static token and its SHA-256 checksum are not secrets or
teacher authentication. Existing Checking Assignment v1–v6 handling is unchanged.

Validation: node --test tests/*.test.cjs
tests/browser.cjs sharing scenarios start at /teacher/; public homepage is
checked separately for absence of sharing controls.
