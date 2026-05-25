#!/bin/bash
# ============================================================================
# push-personal.sh — Push to personal GitHub without affecting work git config
# ============================================================================
# Usage: ./push-personal.sh [commit message]
# 
# This script:
# 1. Sets repo-local git user to your personal account (does NOT touch global)
# 2. Creates the GitHub repo if it doesn't exist (requires `gh` CLI)
# 3. Adds/updates the "personal" remote
# 4. Commits all changes and pushes to your personal GitHub
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

echo "🔧 Setting local git config (repo-level only)..."
git config user.name "$PERSONAL_NAME"
git config user.email "$PERSONAL_EMAIL"

echo "📧 Local git identity: $(git config user.name) <$(git config user.email)>"

# Check if gh CLI is available for repo creation
if command -v gh &> /dev/null; then
  # Check if repo exists on GitHub
  if ! gh repo view "$GITHUB_USER/$REPO_NAME" &> /dev/null 2>&1; then
    echo "📦 Creating GitHub repo: $GITHUB_USER/$REPO_NAME..."
    gh repo create "$REPO_NAME" --public --description "Developer-native compliance infrastructure — enterprise accessibility scanner" --source=. --remote="$REMOTE_NAME" --push
    echo "✅ Repo created and pushed!"
    exit 0
  fi
else
  echo "⚠️  GitHub CLI (gh) not found. Install with: brew install gh"
  echo "   Then run: gh auth login  (select your personal account)"
  echo ""
  echo "   Alternatively, create the repo manually at:"
  echo "   https://github.com/new?name=$REPO_NAME"
  echo ""
fi

# Add or update remote
REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
if git remote get-url "$REMOTE_NAME" &> /dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

echo "🔗 Remote '$REMOTE_NAME' → $REMOTE_URL"

# Stage and commit
echo "📝 Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "ℹ️  No new changes to commit."
else
  echo "💾 Committing: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG"
fi

# Push
echo "🚀 Pushing to $REMOTE_NAME/$BRANCH..."
git push "$REMOTE_NAME" "$BRANCH"

echo ""
echo "✅ Done! View at: https://github.com/$GITHUB_USER/$REPO_NAME"
