#!/usr/bin/env bash
# Deploys hosting + rules. The admin key lives only in ~/.config/song-quiz/admin-key and is injected into the rules here, never committed.
set -euo pipefail
cd "$(dirname "$0")"
KEY=$(cat ~/.config/song-quiz/admin-key)
sed "s/__ADMIN_KEY__/$KEY/" database.rules.template.json > database.rules.json
npx firebase-tools deploy --project song-quiz-xmas-a414536c "$@"
