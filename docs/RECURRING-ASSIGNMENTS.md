# Reusable assigned practice links

In teacher setup, choose the student, Checking Assignment, the library/range/question count, and 每日练习：同一链接，每次重新抽题. Send the generated link once. Reopening/reloading it or starting another set samples again within the same recipe. Each completed attempt keeps its own record ID under the same student and assignment.

Supported recipes: spelling by List (v4), DET prefix sampling (v6), Daily Recognition and Synonym (v5). Fixed tests and fixed Learn/Review packs retain their existing behavior. Random samples may overlap across runs; drawing the full pool can only change its order. This is on-demand resampling, not one calendar-locked test per day.

Existing fixed links remain fixed. Generate a new recurring link once to switch. Expiration remains 1–90 days, default 30; choose 90 for daily use and extend it from the dashboard before expiry. Revocation and student disabling still apply.

The restriction was in the teacher composer: assigned links were rejected when the random recipe was selected. The backend already stores arbitrary valid preset recipes and the student player already resolves v4/v5/v6 on each load. Removing the composer restriction preserves identity binding, scoped records, and existing token formats without a database migration.

Browser regression uses the actual composer, student player, sync and Worker handler with isolated SQLite/test vocabulary. Deterministic sampling verifies different subsets, repeat submissions under one assignment, student isolation, and unchanged fixed tests. Production vocabulary and physical device/network behavior are not part of this test.
