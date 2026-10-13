# claude-plugins

Claude Code plugins by ingvarch. The repository is a marketplace; each plugin lives in `plugins/<name>/`.

## Installation

```
/plugin marketplace add ingvarch/claude-plugins
/plugin install brn@ingvarch
```

Or in one line: `/plugin install brn --marketplace ingvarch/claude-plugins`.

## Plugins

| Plugin | What it does |
|---|---|
| [brn](plugins/brn) | Project brain in brn notation: `/brn:setup` once, then handover, traps and subagent briefs happen automatically. Works with graphify. |

## Adding a plugin

1. `plugins/<name>/.claude-plugin/plugin.json` and the rest of the plugin's contents.
2. An entry in `plugins` in `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.
3. `claude plugin validate .` from the root and `claude plugin test plugins/<name>`.

Local development without installing: `claude --plugin-dir plugins/<name>`.
