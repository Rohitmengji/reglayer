#!/bin/bash
# ============================================================
# push-personal.sh — Push to personal GitHub (Rohitmengji)
# ============================================================
# This script pushes to your personal GitHub without affecting
# your work git profile configured in VS Code.
#
# Setup (one-time):
#   1. Create repo on GitHub: https://github.com/new
#      Name: reglayer (or whatever you prefer)
#   2. Create a Personal Access Token (classic):
#      https://github.com/settings/tokens/new
#      Scopes needed: repo (full control)
#   3. Save the token:
#      echo "ghp_YOUR_TOKEN_HERE" > .git-personal-token
#   4. Make this script executable:
#      chmod +x push-personal.sh
#
# Usage:
#   ./push-personal.sh                  # push to main
#   ./push-personal.sh feature-branch   # push specific branch
# ============================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Config
GITHUB_USER="Rohitmengji"
GITHUB_REPO="reglayer"
PERSONAL_NAME="Rohitmengji"
PERSONAL_EMAIL="rohitmengjih@gmail.com"
REMOTE_NAME="personal"
BRANCH="${1:-main}"
TOKEN_FILE=".git-personal-token"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}━━━ RegLayer → Personal GitHub Push ━━━${NC}"

# Check token file exists
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo -e "${RED}Error: Token file not found.${NC}"
  echo ""
  echo "Create one with:"
  echo "  echo \"ghp_YOUR_TOKEN\" > $TOKEN_FILE"
  echo ""
  echo "Get a token at: https://github.com/settings/tokens/new"
  echo "  → Select scope: repo (Full control of private repositories)"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')

if [[ -z "$TOKEN" ]]; then
  echo -e "${RED}Error: Token file is empty.${NC}"
  exit 1
fi

# Ensure local config is set for this repo (won't affect global)
git config user.email "$PERSONAL_EMAIL"
git config user.name "$PERSONAL_NAME"

# Set up remote (or update if exists)
REMOTE_URL="https://${GITHUB_USER}:${TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

if git remote get-url "$REMOTE_NAME" &>/dev/null; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Stage and commit any uncommitted changes
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${YELLOW}Staging uncommitted changes...${NC}"
  git add -A
  echo -n "Commit message (or press Enter for default): "
  read -r COMMIT_MSG
  COMMIT_MSG="${COMMIT_MSG:-chore: update $(date +%Y-%m-%d)}"
  git commit -m "$COMMIT_MSG"
fi

# Push
echo -e "${GREEN}Pushing ${BRANCH} → ${GITHUB_USER}/${GITHUB_REPO}...${NC}"
git push "$REMOTE_NAME" "$BRANCH" 2>&1

echo -e "${GREEN}✓ Done! Code pushed to https://github.com/${GITHUB_USER}/${GITHUB_REPO}${NC}"

# Clean the token from remote URL after push (security)
git remote set-url "$REMOTE_NAME" "https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
