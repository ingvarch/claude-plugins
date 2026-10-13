# brn

`brn` is a compact notation the agent uses to store project knowledge: one fact per line,
a sigil instead of a heading, stable ids instead of retelling, and a separate `now` file for handover.
Part of the [ingvarch/claude-plugins](../../README.md) marketplace.

## Installing the plugin

```
/plugin install brn --marketplace ingvarch/claude-plugins
```

Locally, without installing: `claude --plugin-dir ~/Repos/ingvarch/claude-plugins/plugins/brn`.

## Commands

| Command | What it does |
|---|---|
| `/brn:setup` | once per project: create `.brain/`, Claude fills in `card` and `now` from the repository |
| `/brn:end` | manual handover right now (usually unnecessary, Claude does it on its own) |
| `/brn` | status: whether a brain exists, how many edits since `now` was last updated |

`/brn setup` and `/brn end` with a space do the same thing.

From then on everything is automatic while the project has `.brain/card`:

- `card`+`now` and the protocol are injected into the system prompt. The snapshot is taken once per session and after compaction, so the system prompt doesn't change mid-conversation and the cache isn't broken.
- The model gets a native `mcp__brn__brain` tool (`add`, `log`, `lint`, `slice`, `brief`, `status`) and writes records with it rather than through the shell.
- Traps at the moment of risk: when Claude runs a Bash command, edits or reads a file, matching lines from `traps` are attached to the tool result. A trap matches on a path, file name, identifier (`tool.call`, `REDIS_URL`) or the program being run; plain words like `result` need two hits in the same trap. Each trap is shown once per session.
- Every subagent launched via the Agent tool gets a brief prepended to its prompt: key, `card`, a slice by the `#tags` from the task, `now`. The `. ! ~ ?` records it returns go into the brain as unverified (suffix `?`), with deduplication. Background subagents count too: their records are captured when they finish, and the next result tells the model which ids were added.
- After a turn in which Claude edited files, the plugin runs a short brain-update turn on its own and passes the list of edited files. If there's nothing to record, Claude replies "brain current".
- Before context compaction the plugin asks the summary to preserve the handover state verbatim.
- If the project has `graphify-out/graph.json`, the protocol and briefs route structural questions to graphify, and structural facts aren't written to `.brain`. During `/brn:setup`, `GRAPH_REPORT.md` is used to pick aliases and the lexicon.
- At session start `.brain/` is added to the machine's global gitignore (`core.excludesfile`, `~/.config/git/ignore` by default). The brain lives locally and never lands in the repository.

Settings (plugin menu or `pluginConfigs.brn` in settings): `autoHandover`, `minEdits` (default 1), `globalIgnore`, `captureSubagentRecords`, `trapsAtRisk`.

Advanced (for rare cases, Claude uses `bin/brn` directly itself): `/brn slice #tag`, `/brn brief`, `/brn add <sigil> text`, `/brn log`, `/brn lint`, `/brn start`, `/brn all`.

## Files

- `SPEC.md` — format specification and protocol (for agents).
- `hooks/brain.ts` — brain logic in TypeScript: id, add, log, slice, brief, lint, trap matching. No engine access, works over a filesystem interface.
- `hooks/register.ts` — the plugin module: hooks, the `/brn` command, the `mcp__brn__brain` tool. Tests in `hooks/register.test.ts`.
- `bin/brn` — the same operations as a POSIX sh script for humans, CI and other agents. The plugin doesn't depend on it.
- `commands/setup.md`, `commands/end.md` — the `/brn:setup` and `/brn:end` prompt commands.
- `skills/brn-notation/SKILL.md` — a short grammar, loaded by the agent on demand.
- `example/.brain/` — an example of a filled-in project brain.
- `CLAUDE.snippet.md` — for projects where the plugin isn't installed.

## Numbers

All figures are tiktoken `o200k_base` on the files in this repo. `bench/equiv.*` holds the same project
notes (a Go HTTP service: stack, paths, commands, 7 facts, 3 decisions, 4 traps, current state) in three formats.

| Same content as | Tokens | Chars | vs brn |
|---|---:|---:|---:|
| brn (`equiv.brn`) | 643 | 1990 | — |
| Markdown (`equiv.md`) | 841 | 3098 | +31% |
| JSON (`equiv.json`) | 891 | 2927 | +39% |
| brn, zlib+base64 | 1064 | 1564 | +65% |
| brn, hex | 1851 | 3980 | +188% |

brn is 24% smaller than the Markdown notes and 28% smaller than JSON. Compressed or binary encodings
don't help: they have fewer characters but more tokens, because the tokenizer can't merge them.

The format matters less than how much gets loaded. The example brain (`example/.brain/`, 667 tokens in total)
is never loaded whole:

| What the model sees | When | Tokens | Share of the whole brain |
|---|---|---:|---:|
| `card` + `now` | session start, after compaction | 381 | 57% |
| slice `#api` | a subagent works on the API | 122 | 18% |
| full brief `#api` (key + card + slice + now) | prepended to a subagent prompt | 533 | 80% |
| the whole brain (`brn all`) | never automatically | 667 | 100% |

The Markdown version loads all 841 tokens every session. The brn snapshot is 381: 55% less, and because it's
taken once per session the system prompt stays byte-identical and the prompt cache keeps hitting.

What the difference looks like, one record each:

```
- D9 (2026-10-11): Chose cursor pagination using UUIDv7 as the cursor, because offset pagination is slow above 1M rows (see fact 2).
!9 cursor pagination, uuidv7 as cursor :: offset slow >1M rows ^.2 @261011 #api #db

- `go test` hangs if `REDIS_URL` is not set. Run `make dev` first or export it.
~1 go test hangs if REDIS_URL unset -> run $run first or export it #test
```

The brn line also carries a sigil (`!` decision, `~` trap), a stable id other records can point to (`^.2`)
and tags that drive slicing and trap matching. Prose has none of that.

## Measure it yourself

You only need `uv`; tiktoken is pulled in for the run. From `plugins/brn/`:

```sh
# same content, three formats
uvx --with tiktoken python bench/count.py bench/equiv.brn bench/equiv.md bench/equiv.json

# binary and other encodings, plus one record in en / ru / zh / emoji / codes
uvx --with tiktoken python bench/binary.py

# what the model actually gets from the example brain
cd example
../bin/brn start      > /tmp/start.txt   # session start
../bin/brn slice '#api' > /tmp/slice.txt # one tag
../bin/brn brief '#api' > /tmp/brief.txt # subagent brief
../bin/brn all        > /tmp/all.txt     # everything
cd ..
uvx --with tiktoken python bench/count.py /tmp/start.txt /tmp/slice.txt /tmp/brief.txt /tmp/all.txt
```

On your own project, after `/brn:setup`:

- `uvx --with tiktoken python <plugin>/bench/count.py .brain/card .brain/now` shows the per-session cost.
- `/context` in Claude Code shows how much of the system prompt the brain takes. Compare against your
  `CLAUDE.md` or the notes file it replaces.
- For a before/after test, run the same task twice in fresh sessions, once with `.brain/` renamed away,
  and compare `/cost`. Expect the biggest difference on tasks that send work to subagents, because
  each one gets a tag slice instead of rediscovering the project.

## With graphify

brn and [graphify](https://graphify.com) cover different halves of project knowledge and work best together.

| | graphify | brn |
|---|---|---|
| Source | parsed from code | written by the agent and you |
| Knows | files, symbols, calls, clusters, impact of a change | decisions and why, traps, current state, next steps, people, commands |
| Goes stale | regenerate with `/graphify .` | `lint` flags stale `now`; handover runs after edits |

When `graphify-out/graph.json` exists, the plugin picks it up with no configuration:

- The protocol and every subagent brief say to answer structural questions ("where is X", "who calls Y",
  "what breaks if I change Z") with `graphify query`, `graphify path` or `graphify explain` before grep or Read.
  One graph query replaces a round of grep plus several file reads.
- Structural facts aren't written to `.brain`, so the brain stays small and doesn't duplicate (and later
  contradict) what the graph already knows. Every record left is something no parser can derive.
- `/brn:setup` reads `GRAPH_REPORT.md` first and uses its god nodes and clusters to choose `@` path aliases
  and `;lex` abbreviations, so the brain names things the way the graph groups them.
- On repos with more than ~300 source files and no `graphify-out/`, `/brn:setup` suggests running `/graphify .`.

To check it's active: `/brn` prints `graphify detected`.

To see the effect, run the same structural question ("which handlers touch the users table?") in two fresh
sessions, once with `graphify-out/` renamed away, and compare the number of tool calls and `/cost`.

Development: `claude plugin validate .` and `claude plugin test .`
