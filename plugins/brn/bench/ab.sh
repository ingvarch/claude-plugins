#!/bin/sh
# A/B cost of brn: the same questions in two throwaway clones of the repo, A with .brain/ (and graphify-out/,
# CLAUDE.md when present), B bare. Clones, not worktrees: a worktree's .git file points back at the real checkout,
# and a bare run follows it to the real .brain/. Reads of the real repo are denied too.
# usage: sh ab.sh <repo> "<question>" ["<question>" ...]   AB_KEEP=1 keeps the clones and answers
set -eu
[ $# -ge 2 ] || { echo 'usage: sh ab.sh <repo> "<question>" ...' >&2; exit 2; }
repo=$(cd "$1" && pwd); shift
tmp=$(mktemp -d)
[ "${AB_KEEP:-}" = 1 ] && echo "keeping $tmp" || trap 'rm -rf "$tmp"' EXIT
for v in A B; do
  git clone -q --no-hardlinks "$repo" "$tmp/$v"
  git -C "$tmp/$v" remote remove origin
done
for f in .brain graphify-out CLAUDE.md; do
  [ -e "$repo/$f" ] && cp -R "$repo/$f" "$tmp/A/"
done
tools='Read,Grep,Glob,Bash(graphify *),Bash(grep *),Bash(ls *),Bash(cat *),Bash(sed *),mcp__brn__brain'
printf '%-3s %-3s %6s %5s %8s %8s\n' q run cost turns cache_r cache_w
n=0
for q in "$@"; do
  n=$((n + 1))
  for v in A B; do
    (cd "$tmp/$v" && claude -p "$q Answer briefly. This is a read-only question: do not edit any files." \
      --output-format json --max-turns 25 --allowedTools "$tools" --disallowedTools "Read(/$repo/**)" \
      < /dev/null > "$tmp/$v$n.json" 2>/dev/null) || true
    grep '^{' "$tmp/$v$n.json" | jq -r --arg q "$n" --arg v "$v" \
      '"\($q | .[0:3]) \($v)   \(.total_cost_usd * 1000 | round / 1000) \(.num_turns) \(.usage.cache_read_input_tokens) \(.usage.cache_creation_input_tokens)"'
  done
done
