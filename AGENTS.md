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
