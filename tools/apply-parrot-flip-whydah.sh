#!/usr/bin/env bash
# Sync bare-bones Parrot Flip into a Whydah-Unit checkout, commit, and push.
# Usage:
#   ./tools/apply-parrot-flip-whydah.sh /path/to/Whydah-Unit
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_ROOT="${1:?path to Whydah-Unit repo}"
DEST="$DEST_ROOT/parrot-flip"

node "$ROOT/tools/sync-parrot-flip.js" "$DEST"

cd "$DEST_ROOT"
git add -A parrot-flip
git status --short

BRANCH="cursor/parrot-flip-barebones-whydah"
git checkout -B "$BRANCH"
git commit -m "$(cat <<'EOF'
Sync bare-bones Parrot Flip from flipgame

Parrots + base party game only. No achievements, unlocks, or Hall of Fame.
Classroom games-gate retained. Bottle Flip elsewhere is unchanged.
EOF
)" || echo "(nothing new to commit)"

echo
echo "Push when ready:"
echo "  git push -u origin $BRANCH"
echo "  # then open a PR into main, or:"
echo "  git push origin $BRANCH:main"
