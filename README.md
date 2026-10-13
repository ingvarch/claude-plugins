# claude-plugins

Плагины Claude Code от ingvarch. Репозиторий — marketplace, каждый плагин лежит в `plugins/<name>/`.

## Установка

```
/plugin marketplace add ingvarch/claude-plugins
/plugin install brn@ingvarch
```

Или одной строкой: `/plugin install brn --marketplace ingvarch/claude-plugins`.

## Плагины

| Плагин | Что делает |
|---|---|
| [brn](plugins/brn) | Мозг проекта в нотации brn: `/brn:setup` один раз, дальше handover, ловушки и брифы сабагентам автоматически. Дружит с graphify. |

## Новый плагин

1. `plugins/<name>/.claude-plugin/plugin.json` и остальное содержимое плагина.
2. Строка в `plugins` в `.claude-plugin/marketplace.json` с `"source": "./plugins/<name>"`.
3. `claude plugin validate .` из корня и `claude plugin test plugins/<name>`.

Локальная разработка без установки: `claude --plugin-dir plugins/<name>`.
