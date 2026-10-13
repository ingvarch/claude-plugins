---
name: brn-notation
description: brn notation for .brain/ project knowledge files — load when writing or reading .brain/card, now, log, facts, dec, traps, or when a brief asks for "brn records".
---

# brn notation (v1)

One line = one record = one claim. Sigil in column 1, telegraphic body, ≤140 chars. The agent is the parser.

```
;brn1 .fact !dec ~trap ?open >goal =state -next xblock +done @path $cmd &who %num ^ref ::why ->then <supersedes ?=unsure #tag @yymmdd
```

| sigil | type | example |
|---|---|---|
| `.N` | fact | `.3 AE verifies JWT RS256, pubkey @s/auth/keys.go:14 #api` |
| `!N` | decision :: why | `!7 pg over sqlite :: concurrent writers #db` |
| `~N` | trap, gotcha | `~1 tests hang if REDIS_URL unset -> export it #test` |
| `?N` | open question | `?6 keep /v1 after 261201? :: ask igor` |
| `>` | goal (now) | `> v2 users endpoint ^!9` |
| `=` | state (now) / identity (card line 2) | `= 3 tests red :: nil cursor @261013` |
| `@` | hot paths (now) / alias (card) | `@s=internal/` then `@s/users/list.go:71` |
| `-` | next action, verb first (now) | `- fix nil cursor @s/users/list.go:71 -> $test1` |
| `x` | blocked :: unblocker (now) | `x staging :: &igor adds secret` |
| `+` | done (log) | `@261013 +handlers +tests -PR` |
| `$` | command | `$test go test ./... \| $run make dev` |
| `&` | person / system | `&igor owner :: small PRs` |
| `%` | metric | `%p95 180ms target 100 @261013` |
| `;` | comment, key, `;lex AE=auth engine @s/auth/` | |

Operators: `::` because, `->` then, `^!7` ref to decision 7, `<!7` supersedes, `!=` not, `w/` `w/o`.
Suffixes: `#tag` scope, `@yymmdd` date, trailing `?` unverified, `??` guess.
Ids: per sigil, monotonic, never reused, global across files.

Files: `card` stable (≤40 lines), `now` volatile (rewritten each session), `log` append-only one line per session, `facts`, `dec`, `traps`.
Register: no articles, no "we/should", path:line over description, split on "and", store only what cost tokens to discover.
Handover: rewrite `now`; append `@yymmdd +done -left` to `log`; add records with next ids; `brn lint`.
Subagents: return brn records only (`. ! ~ ?` lines, no ids, no prose, ≤15 lines).
