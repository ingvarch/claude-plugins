# brn — project brain notation (v1)

Line-oriented notation for storing what an agent knows about a project.
Optimised for: few tokens, lossless session handover, cheap briefs for subagents.
The agent is the parser. No tooling required; `bin/brn` is a convenience.

## Why not markdown / JSON / YAML

- JSON/YAML spend tokens on braces, quotes, keys, indentation.
- Markdown prose spends tokens on articles, verbs, hedges, repetition.
- Neither has stable ids, so facts get restated instead of referenced.
- Neither separates *volatile state* from *stable knowledge*, so handover
  notes rot inside long documents.

brn fixes all four: one record per line, one sigil per record type,
monotonic ids, and a tiny volatile file (`now`) rewritten every session.

## Layout

```
.brain/
  card    stable identity: stack, path aliases, commands, people, lex, core facts   ≤40 lines
  now     volatile: goal, state, hot paths, next, blocked, open                   ≤25 lines, rewritten
  log     append-only, one line per session                                       never edited
  facts   long tail of .N records                                                 grep by #tag
  dec     !N decisions with rationale                                             grep by #tag
  traps   ~N gotchas and past failures                                            read before risky ops
```

Rule: a record lives in exactly one file. Core facts in `card`, the rest in `facts`.

## Record grammar

```
<sigil>[id] body [:: why] [-> then] [^ref ...] [#tag ...] [@yymmdd] [?]
```

One line = one record = one claim. Every line must make sense alone (greppable).

### Sigils (column 1)

| sigil | type     | id? | meaning / example |
|------:|----------|:---:|-------------------|
| `.`   | fact     | .N  | stable truth. `.3 AE verifies JWT RS256, pubkey @s/auth/keys.go:14 #api` |
| `!`   | decision | !N  | choice + why. `!7 pg over sqlite :: concurrent writers #db` |
| `~`   | trap     | ~N  | gotcha, past failure, non-obvious. `~1 tests hang if REDIS_URL unset -> export it` |
| `?`   | open     | ?N  | unresolved question. `?6 keep /v1 after 261201? :: ask igor` |
| `>`   | goal     |     | current objective (now only) |
| `=`   | state    |     | one-line status (now) or identity line (card, first line after key) |
| `-`   | next     |     | concrete next action, verb first (now) |
| `x`   | blocked  |     | blocker :: who/what unblocks (now) |
| `+`   | done     |     | completed item (log only) |
| `@`   | path     |     | `@s=src/` alias (card) or `@ path path :: note` hot paths (now) |
| `$`   | command  |     | `$test go test ./...` — name then command; `|` separates several |
| `&`   | who      |     | `&igor owner :: small PRs` person, team, external system |
| `%`   | number   |     | `%p95 180ms target 100 @261013` metric that matters |
| `^`   | ref      |     | standalone link: `^https://…`; inline `^!7` `^.3` |
| `;`   | comment  |     | ignored. First line of card is the key (`;brn1 …`). `;lex` defines abbreviations |

### Operators (inside body)

| op    | reads as |
|-------|----------|
| `::`  | because / why / who unblocks |
| `->`  | leads to / therefore / then do |
| `<!7` | supersedes decision 7 (`!12 sqlite -> pg <!7`) |
| `!=`  | not / don't |
| `w/` `w/o` | with / without |

### Suffixes (end of line, any order)

| suffix    | meaning |
|-----------|---------|
| `#tag`    | scope for slicing. Use a small fixed set per project: `#api #db #infra #test #ci #ui #auth` |
| `@yymmdd` | date observed. Digits after `@` = date; letters = path alias. |
| `?`       | unverified / assumed. `??` = guess. Absence = verified by the writer. |
| `^!7`     | reference. Refs carry type, so `^!7` is decision 7, `^~2` trap 2. |

### Ids

- Per sigil, monotonic, never reused. Gaps are fine.
- Global across files: `.1` may live in `card`, `.5` in `facts`.
- `bin/brn id .` prints the next free id.

### Path aliases and lex

Define once in card, use everywhere:

```
@s=internal/ @t=internal/**/*_test.go @m=migrations/
;lex UH=users handler @s/users/handler.go  AE=auth engine @s/auth/
```

Then `@s/users/list.go:71` and `AE` are cheap and unambiguous.

## Register (how to write bodies)

- Telegraphic. Drop articles, pronouns, "should", "we". Verb-first for actions.
- ≤ ~12 words. Hard limit: one line, ≤140 chars. Split on "and".
- Prefer `path:line` over description.
- Store what cost tokens to discover and is not obvious from code or git.
  Don't store what `ls`, `git log`, or the README already say.
- Mark anything not verified with trailing `?`. Remove `?` once verified.
- Never prose. If tempted to explain, write a trap or a decision instead.

## Protocol

### Session start (~300–500 tokens)

```
cat .brain/card .brain/now
```

Working in an area: `grep -h '#api' .brain/facts .brain/dec .brain/traps` (or `brn slice '#api'`).
Before migrations, deploys, destructive ops: `cat .brain/traps`.

### Session end (mandatory, even mid-task)

1. Rewrite `now` completely: `>` goal, `=` state with `@date`, `@` hot paths, `-` next (first one must be executable immediately), `x`, `?`.
2. Append one line to `log`: `@yymmdd +done +done -left ^refs`.
3. Add new `.` `!` `~` `?` records with next ids. Delete or supersede stale ones.
4. Nothing else. No summaries, no prose, no duplicated content.

### Subagent brief

```
;brn1 .fact !dec ~trap ?open -next xblock @path $cmd &who ^ref ::why ->then ?=unsure #tag
<card>
<slice for task tags>
TASK: <one paragraph>
RETURN: brn records only (. ! ~ ? lines, no ids, no prose), ≤15 lines.
```

The agent returns records; the main agent assigns ids and appends with `>>`.
No rewriting, no summarising summaries. `bin/brn brief '#api #db'` prints the header.

### Freshness

- `now` older than 7 days → treat `-` items as suspect; re-verify first `-`.
- Records with `?` are claims, not facts. Verify before acting on them.
- `brn lint` flags long lines, bad sigils, duplicate ids, dangling refs, stale `now`.

## With graphify

brn and [graphify](https://graphify.com) are complementary. graphify derives code structure (files, symbols, calls)
into `graphify-out/graph.json`; brn stores what no parser can derive: decisions, traps, state, people, commands.
When `graphify-out/graph.json` exists the plugin adds to the protocol and to every subagent brief:
structure questions go to `graphify query | path | explain` before grep or Read, and structural facts are not
stored in `.brain` because the graph already has them. At setup, `GRAPH_REPORT.md` seeds `@` aliases and `;lex`.

## Tooling

- Claude Code plugin (this repo): the `brn` hooks module keeps the brain in TypeScript (`hooks/brain.ts`) and gives the
  model a native tool `mcp__brn__brain` with ops `add | log | lint | slice | brief | status`. Records never go through a shell.
- `bin/brn`: the same operations as a POSIX sh script, for humans, CI and agents other than Claude Code.

## Minimal example

```
;brn1 .fact !dec ~trap ?open >goal =state -next xblock +done @path $cmd &who %num ^ref ::why ->then <supersedes ?=unsure #tag @yymmdd
=ledger go1.24 http api :: pg16 redis7 chi
@s=internal/ @m=migrations/
$test go test ./... | $run make dev
.1 config env-only :: 12factor #infra
!9 cursor pagination, uuidv7 as cursor :: offset slow >1M ^.2 #api #db
~1 go test hangs if REDIS_URL unset -> export it #test
```

See `example/.brain/` for a full project.
