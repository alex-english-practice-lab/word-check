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
V3 recognition/synonym remain available for free practice but, as before,
do not yet support student links.

Validation: node --test tests/*.test.cjs
tests/browser.cjs sharing scenarios start at /teacher/; public homepage is
checked separately for absence of sharing controls.
