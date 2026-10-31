#!/usr/bin/env bash
set -e

PROJECT_DIR="/www/wwwroot/number-portal.softcents.com"
cd "$PROJECT_DIR"

MSG="${1:-auto-sync: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
    echo "Staging changes..."
    git add -A
    git commit -m "$MSG"
fi

echo "Pushing to GitHub..."
git push origin main
echo "Push completed successfully!"
