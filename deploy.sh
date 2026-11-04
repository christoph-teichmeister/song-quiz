#!/usr/bin/env bash
# Deploys hosting + rules. The admin key and the admin user id stay out of git: they come from ~/.config/song-quiz/ and are injected into the rules here.
set -euo pipefail
cd "$(dirname "$0")"
KEY=$(cat ~/.config/song-quiz/admin-key)
UID_=$(cat ~/.config/song-quiz/admin-uid 2>/dev/null || echo none-yet)
sed -e "s/__ADMIN_KEY__/$KEY/" -e "s/__ADMIN_UID__/$UID_/" database.rules.template.json > database.rules.json
npx firebase-tools deploy --project song-quiz-xmas-a414536c "$@"
