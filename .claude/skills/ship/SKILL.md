---
name: ship
description: Typecheck, branch, commit, push, open a PR, and squash-merge it into main
disable-model-invocation: true
---

# /ship — get the current changes merged

Takes the working-tree changes all the way to `main`. `$ARGUMENTS`, if given, describes what is being shipped (use it for the branch name and commit message). If it is `--no-merge`, stop after step 6.

## 1. Typecheck

```bash
npm run typecheck
```

Stop and report the errors if it fails. Nothing below runs on a red typecheck.

## 2. Decide what ships

Show `git status --short` and `git diff --stat`. If the changes span unrelated features, list the groups and ask which one ships now — one feature per PR. Never include `.env`, `*.db`, or anything under `src/public/uploads/`.

## 3. Branch

If on `main`, create a branch named for the change:

- `feat/<slug>` for new behaviour
- `fix/<slug>` for bug fixes

If already on a feature branch, stay on it.

## 4. Commit

Stage only the files chosen in step 2 (by path, not `git add -A`). Write a conventional commit:

- Subject: `feat: …` or `fix: …`, imperative, under ~72 characters, **no `(#N)`** — GitHub appends the PR number on squash.
- Body: why the change was made, plus anything a reviewer must know (new migration, new env var, behaviour change).

## 5. Push and open the PR

```bash
git push -u origin HEAD
gh pr create --base main --title "<commit subject>" --body-file <tmp file>
```

PR body sections, matching earlier PRs:

- `## Summary` — bullets of what changed.
- `## Problem` — fixes only: what was broken and how it showed up.
- `## Testing` — what was actually verified (typecheck, pages checked, flows exercised). Say plainly what was not tested.
- `## Notes` — only if needed: migrations in `src/db/migrations/` (they run automatically on next boot against whatever `TURSO_URL` points at), new env vars, follow-ups.

## 6. Report the PR

Print the PR URL.

## 7. Merge

Check the PR is mergeable and any checks have passed:

```bash
gh pr view --json mergeable,mergeStateStatus,statusCheckRollup
```

- If it has conflicts, or a check failed, stop and report — do not merge.
- If checks are still running, wait for them with `gh pr checks --watch`.

Then squash-merge and delete the branch:

```bash
gh pr merge --squash --delete-branch
```

Never use `--admin` to bypass protections, and never force-push.

## 8. Sync local main

```bash
git checkout main
git pull --ff-only
```

Report: merged PR URL, the squash commit on `main`, and any migrations that will run on the next deploy. If other uncommitted changes were left out in step 2, remind the user they are still in the working tree.
