#!/bin/bash
# ============================================================================
# push-personal.sh — Push to personal GitHub via feature branch + auto PR
# ============================================================================
# Usage: ./push-personal.sh [commit message]
#
# Flow:
# 1. Sets repo-local git user to your personal account
# 2. Syncs local main with remote (rebase)
# 3. Creates a feature branch from commit message
# 4. Commits changes and pushes the feature branch
# 5. Creates a PR via `gh` CLI (auto-merges if checks pass)
#
# Your repo has branch protection on main — this script handles it.
# ============================================================================

set -e

# ─── Configuration ───────────────────────────────────────────────────────────
PERSONAL_NAME="Rohit Mengji"
PERSONAL_EMAIL="rohitmengjih@gmail.com"
GITHUB_USER="Rohitmengji"
REPO_NAME="reglayer"
REMOTE_NAME="personal"
BRANCH="main"
# ─────────────────────────────────────────────────────────────────────────────

# Default commit message
COMMIT_MSG="${1:-feat: update RegLayer platform}"

# Generate branch name from commit message
BRANCH_NAME=$(echo "$COMMIT_MSG" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | tr '[:upper:]' '[:lower:]' | cut -c1-50)
BRANCH_NAME="${BRANCH_NAME:-update}"

echo "🔧 Setting local git config (repo-level only)..."
git config user.name "$PERSONAL_NAME"
git config user.email "$PERSONAL_EMAIL"
git config pull.rebase true

echo "📧 Local git identity: $(git config user.name) <$(git config user.email)>"

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "⚠️  GitHub CLI (gh) not found. Install with: brew install gh"
  echo "   Then run: gh auth login"
  exit 1
fi

# Add or update remote
REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
if git remote get-url "$REMOTE_NAME" &> /dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

echo "🔗 Remote '$REMOTE_NAME' → $REMOTE_URL"

# Sync with remote main first
echo "🔄 Syncing with remote main..."
git fetch "$REMOTE_NAME" "$BRANCH" 2>/dev/null || true

# Stage and commit on current branch
echo "📝 Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "ℹ️  No new changes to commit."
  exit 0
fi

echo "💾 Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Push to feature branch
echo "🚀 Pushing to $REMOTE_NAME/$BRANCH_NAME..."
git push "$REMOTE_NAME" "HEAD:$BRANCH_NAME"

# Create PR and auto-merge
echo "📋 Creating Pull Request..."
PR_URL=$(gh pr create \
  --repo "$GITHUB_USER/$REPO_NAME" \
  --head "$BRANCH_NAME" \
  --base "$BRANCH" \
  --title "$COMMIT_MSG" \
  --body "Auto-generated PR from push-personal.sh" \
  2>&1) || true

if echo "$PR_URL" | grep -q "https://"; then
  echo "✅ PR created: $PR_URL"
  
  # Attempt auto-merge (will succeed once CI passes)
  echo "🔀 Enabling auto-merge..."
  gh pr merge "$BRANCH_NAME" \
    --repo "$GITHUB_USER/$REPO_NAME" \
    --squash \
    --auto \
    --delete-branch 2>/dev/null || echo "   ℹ️  Auto-merge queued (waiting for CI)"
else
  echo "   $PR_URL"
fi

echo ""
echo "✅ Done! View at: https://github.com/$GITHUB_USER/$REPO_NAME"
