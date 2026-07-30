#!/usr/bin/env bash
# Apply the latest Parrot Flip sync into a Whydah-Unit checkout, then push.
# Usage:
#   ./tools/apply-parrot-flip-whydah.sh /path/to/Whydah-Unit
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_ROOT="${1:?path to Whydah-Unit repo}"
DEST="$DEST_ROOT/parrot-flip"
node "$ROOT/tools/sync-parrot-flip.js" "$DEST"
cd "$DEST_ROOT"
git add parrot-flip
git status --short
echo
echo "Review the diff, then:"
echo "  git commit -m \"Sync Parrot Flip from flipgame\""
echo "  git push origin main"
