# Upstream Sync

## Current Upstream

- Remote URL: `git@github.com:documenso/documenso.git`
- Phase 0 base commit: `50f272be876f14a2e22518552f5030c3117c3391`
- Phase 0 base tag shorthand: `50f272be`

## Policy

- Create upstream sync work only on `chore/upstream-sync-YYYY-MM-DD` branches.
- Never merge upstream directly into active feature branches.
- Keep Phase 0 documentation and fork-specific guardrails additive unless an
  upstream conflict requires a targeted resolution.

## Sync Checklist

1. Update `main` from `origin` with `git pull --ff-only`.
2. Create `chore/upstream-sync-YYYY-MM-DD` from `main`.
3. Fetch upstream tags and branches.
4. Review upstream release notes, migration notes, and signing-related changes.
5. Merge or rebase upstream changes onto the sync branch deliberately.
6. Re-run local baseline validation before merging the sync branch.
7. Land the sync branch into `main`, then rebase feature work as needed.
