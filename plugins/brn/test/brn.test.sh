#!/bin/sh
# Tests for bin/brn. Run: sh test/brn.test.sh (from plugins/brn/).
BRN="$(cd "$(dirname "$0")/.." && pwd)/bin/brn"
fails=0
check() { if eval "$2"; then echo "(pass) $1"; else echo "(fail) $1"; fails=$((fails + 1)); fi; }

proj=$(mktemp -d)
(cd "$proj" && sh "$BRN" init demo >/dev/null)
mkdir -p "$proj/sub/dir"

(cd "$proj/sub/dir" && sh "$BRN" init >/dev/null 2>&1)
check 'init in a subdir of a project with a brain makes no nested brain' '[ ! -e "$proj/sub/dir/.brain" ]'

(cd "$proj/sub/dir" && sh "$BRN" add . 'config env-only #infra' >/dev/null 2>&1)
check 'add from a subdir writes to the nearest brain up the tree' 'grep -q "^\.1 config env-only #infra$" "$proj/.brain/facts"'

bare=$(mktemp -d)
(cd "$bare" && sh "$BRN" init >/dev/null)
check 'init with no brain up the tree creates ./.brain' '[ -f "$bare/.brain/card" ]'

rm -rf "$proj" "$bare"
[ "$fails" -eq 0 ] && echo 'all pass' || { echo "$fails failed"; exit 1; }
