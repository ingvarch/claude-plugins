---
description: Hand over now: rewrite .brain/now, append log, add records, lint
allowed-tools: Read, Write, Edit, mcp__brn__brain
---
Handover now (brn protocol). 1) Rewrite `.brain/now` completely for the next session: `>` goal, `=` state @yymmdd, `@` hot paths, `-` next steps verb-first, `x` blocked, `?N` open. 2) Brain tool op `log`: `+done -left ^refs`. 3) Brain tool op `add` for every non-obvious thing learned this session (`.` `!` `~` `?`); one claim per line, <=140 chars, `?` if unverified. 4) Brain tool op `lint` and fix what it reports. Reply with the new now and the log line only.
