# Roadmap → GitHub issues

Turns the 504 roadmap entries in `planning/issues/phase-*.md` into
contributor-ready GitHub issues.

## Why this exists

The roadmap is written for humans: prose, ~142 words per entry. That is the
right format for planning and the wrong one for a contributor who has never
seen the codebase — it says _what_ to build but not where to start, what to
copy, or when to stop.

These scripts expand each entry into a ~750-word issue that answers those
questions, without maintaining a second copy of the roadmap that would drift
from the first within a week.

## Usage

```bash
# Render everything to build/issues/ and read a few before pushing anything
node scripts/issues/build.mjs
node scripts/issues/build.mjs --from 081 --to 100

# See exactly what would be created. This is the default — creating requires --execute
node scripts/issues/push.mjs --limit 200

# Actually create them
node scripts/issues/push.mjs --limit 200 --execute
```

## What `push.mjs` guarantees

Bulk-creating issues is easy to do and tedious to undo — there is no "delete
200 issues" button, and each one notifies every watcher. So:

- **Dry run by default.** `--execute` has to be typed.
- **Idempotent.** Existing issues are matched on their `[NNN]` title prefix
  and skipped, so a re-run after a failure resumes rather than duplicates.
- **Completed work is excluded.** Anything marked `- [x]` in
  `planning/ROADMAP.md` is never created. An open issue for shipped work
  wastes a contributor's evening.
- **Rate limited.** Three seconds between creations, comfortably under
  GitHub's secondary limits. Those are enforced by temporary account blocks
  rather than a documented number, so the cost of going fast is not a failed
  script.
- **Resumable.** `build/issues/pushed.json` maps roadmap ids to issue numbers
  as it goes, and later runs use it to turn dependency references into real
  clickable links.

## Changing the template

Everything a contributor reads comes from `render.mjs`. Edit it, run
`build.mjs`, and read three or four of the generated files before pushing —
a template mistake is cheap to fix in one file and expensive to fix across
200 issues.

The exemplar paths in `EXEMPLARS` are real files in this repository and are
the most valuable part of each issue. **Verify they still exist** after any
significant refactor: a dead pointer costs a contributor the time to discover
it is dead, and then their confidence in everything else the issue says.
