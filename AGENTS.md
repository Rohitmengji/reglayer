<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:worktree-isolation -->
# Two folders in Source Control is EXPECTED — it's a git worktree, not a second repo

AI agents working on this repo often run in an **isolated git worktree** (a sibling
folder such as `../reglayer-fix`) so their commits can't collide with edits the human
is making in the main checkout at the same time. This is intentional and safe.

What you'll see, and what it means:

- **VS Code shows two Source Control roots** (e.g. `reglayer` and `reglayer-fix`).
  This is **one** git repository with **two** working directories — not a clone, not a
  duplicate, no data loss. Confirm with `git worktree list`.
- Each worktree sits on its own branch; commits/branches are shared through the same
  `.git` and push to the same remote. Work is safe on the remote once pushed.
- The worktree contains symlinks (`node_modules`, `src/generated`, `.env`, `.env.local`)
  pointing at the main checkout so `tsc`/`eslint`/tests resolve. **`src/generated` shows
  up untracked (`U`) — never `git add` or commit it** (the real folder is gitignored).
  Stage real files explicitly; never `git add -A` in a shared tree.
- `next build` (Turbopack) FAILS inside a worktree with "Symlink node_modules invalid,
  points out of filesystem root". That's a worktree artifact, **not** a code error — let
  CI validate the production build instead.

Do **not** try to "fix" the two-folder appearance, merge the folders, or commit the
symlink. To collapse back to a single folder once work is pushed:
`git worktree remove <path>`.
<!-- END:worktree-isolation -->

<!-- BEGIN:merge-gate -->
# MANDATORY: All 3 gates must pass BEFORE pushing or merging to main

**No AI agent (Claude, Copilot, Cursor, Windsurf, or any other) may push code to
remote or merge a PR into main unless ALL THREE of the following pass locally with
ZERO errors:**

```bash
# Gate 1: TypeScript — zero errors, no filtering, no excuses
npx tsc --noEmit

# Gate 2: Tests — every test must pass
npx vitest run

# Gate 3: Production build — must complete successfully
npx next build
```

**Rules:**
- Run all 3 gates sequentially. If ANY gate fails, FIX the issue and re-run.
- Do NOT filter out errors (e.g. `grep -v`). Zero means zero.
- Do NOT label failures as "pre-existing" to skip them. Fix them.
- Do NOT push broken code with a plan to "fix it in the next PR".
- Every PR on GitHub must show **green checks**. Red is not acceptable.

**Workflow:**
1. Make changes
2. Run Gate 1 → Gate 2 → Gate 3
3. If any fails → fix → restart from Gate 1
4. All green → `git commit` → `git push` → `gh pr create` → `gh pr merge`
<!-- END:merge-gate -->
