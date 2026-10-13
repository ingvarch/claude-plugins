<!-- paste into a project's CLAUDE.md -->
## Project brain (.brain/, brn notation)
- Session start: `cat .brain/card .brain/now`. Key is the first line of card.
- Working in an area: `grep -h '#tag' .brain/facts .brain/dec .brain/traps`.
- Before migrations/deploys/destructive ops: `cat .brain/traps`.
- Session end (mandatory, even mid-task): rewrite `.brain/now`; append one `@yymmdd +done -left` line to `.brain/log`;
  add new `.` `!` `~` `?` records with next ids. No prose, one claim per line, ≤140 chars, `?` suffix if unverified.
- Subagent briefs: key line + card + tag slice + task. Ask them to RETURN brn records only, then append.
- Spec: https://github.com/ingvarch/claude-plugins/blob/main/plugins/brn/SPEC.md
