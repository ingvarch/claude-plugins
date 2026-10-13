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
- Traps at the moment of risk: when Claude runs a Bash command, edits or reads a file, matching lines from `traps` are attached to the tool result. Each trap is shown once per session.
- Every subagent launched via the Agent tool gets a brief prepended to its prompt: key, `card`, a slice by the `#tags` from the task, `now`. The `. ! ~ ?` records it returns go into the brain as unverified (suffix `?`), with deduplication.
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

Bench (`bench/`, tiktoken o200k): same content — brn 643 tokens, markdown 841, JSON 891.
Session start (`card`+`now`) — 381, slice by `#api` — 122.
Same content in zlib+base64 — 1064, in hex — 1851: binary encodings tokenize worse than text (`bench/binary.py`).

Development: `claude plugin validate .` and `claude plugin test .`
