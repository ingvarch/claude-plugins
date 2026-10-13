---
description: Create .brain/ and fill it from the repo (once per project)
allowed-tools: Bash(sh *), Read, Glob, Grep, Write, Edit, mcp__brn__brain
---
Brain init result:
!`sh "${CLAUDE_PLUGIN_ROOT}/bin/brn" init 2>&1 || true`

Fill `.brain/card` for this project in brn notation (the key is the first line of the file; load the brn-notation skill if unsure). If `graphify-out/GRAPH_REPORT.md` exists read it first: its god nodes and clusters tell you which dirs deserve `@` aliases and `;lex` entries, and structural facts stay out of `.brain` because the graph has them. Read README, build files, CI config and entrypoints, then write `.brain/card` with Write: `=` identity line (name, stack :: one-line purpose), `@` path aliases for the 3-6 most used dirs, `$` commands (run, test, test one, lint, migrate, deploy), `&` owner and preferences, `;lex` abbreviations for things you will name often, and 5-8 core `.` facts with `#tags` that are not obvious from ls or the README. Gotchas, past failures and environment quirks go to `.brain/traps` via the `mcp__brn__brain` tool, op `add`, sigil `~`, not into card. Then write `.brain/now` with the current `>` goal and `-` next steps, and run the brain tool op `lint`. Telegraphic, <=140 chars per line, no prose. Finish with a 3-line summary of what the brain now holds; if the repo has more than ~300 source files and no `graphify-out/`, add one line suggesting `/graphify .` for structure.
