#!/usr/bin/env bash
# Deploys hosting + rules. The admin user id stays out of git: it comes from ~/.config/song-quiz/admin-uid and is injected into the rules here.
set -euo pipefail
cd "$(dirname "$0")"
UID_=$(cat ~/.config/song-quiz/admin-uid 2>/dev/null || echo none-yet)
sed "s/__ADMIN_UID__/$UID_/" database.rules.template.json > database.rules.json
npx firebase-tools deploy --project song-quiz-xmas-a414536c "$@"
