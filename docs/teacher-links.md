# Teacher links
The unlisted /teacher/ entry uses the same app and data as the public homepage.
Its HTML mirrors index.html with a base URL, noindex/nofollow, teacher marker,
and link-type selector. Keep shared markup changes in sync between these two HTML files.

The public homepage retains free practice but has no teacher link or link generator.
Existing v1/v2/v3 fixed links remain supported. VERSION stays 3 for compatibility.
RANDOM_VERSION=4 stores library/version, mode, sampling type, list numbers,
per-list counts or mixed count (0 = all), time limit, and hint policy.
Student links always point to the public site root, not /teacher/.
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

Validation: node --test tests/*.test.cjs
tests/browser.cjs sharing scenarios start at /teacher/; public homepage is
checked separately for absence of sharing controls.
