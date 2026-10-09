---
title: LSP для агента через MCP (Codex и Claude Code)
---

# LSP для агента через MCP (Codex и Claude Code)

::: info
ТЗ для исполнителя-агента. Всё нужное — на этой странице; развилки, которые здесь не решены, не решать
самому: остановиться и спросить Ярослава.
:::

## Цель

Во фронтовом репозитории агенты — Codex CLI и Claude Code — получают семантическую навигацию по коду и
ошибки типов TypeScript 7 через **один MCP-сервер**: одна настройка на оба агента, без второго источника
правды. Команда фронта на месяц переходит на Codex, поэтому решение, которое работает только в Claude Code,
не подходит.

## Контекст

- **Репозиторий фронта:**
  [`frontend-park-mail-ru/2026_2_Cringe_Driven_Development`](https://github.com/frontend-park-mail-ru/2026_2_Cringe_Driven_Development),
  `typescript` `^7.0.2` в `devDependencies` — нативный компилятор TypeScript 7.
- **Языковой сервер TS 7** встроен в компилятор: `tsc --lsp --stdio`. `tsserver.js` в TS 7 нет, поэтому
  не работает всё, что идёт через `typescript-language-server`: официальный плагин Claude Code
  `typescript-lsp` и TypeScript в [Serena](https://github.com/oraios/serena)
  (`src/solidlsp/language_servers/typescript_language_server.py`).
- **Ошибки типов сервер TS 7 отдаёт только по запросу** (`textDocument/diagnostic`, pull-модель), а не
  присылает сам (`textDocument/publishDiagnostics`).
- **Плагин Claude Code** [`typescript-native-lsp`](https://github.com/YarikMix/claude-plugins/tree/main/plugins/typescript-native-lsp)
  (форк Ярослава) уже запускает `tsc --lsp --stdio`, но работает только в Claude Code и ошибок типов не
  показывает: Claude Code их не запрашивает.
- **Codex CLI встроенного LSP не имеет**, внешние инструменты подключает только через MCP
  ([openai/codex#8745](https://github.com/openai/codex/issues/8745),
  [#14799](https://github.com/openai/codex/issues/14799)).
- **Готовый мост LSP → MCP:** [`isaacphi/mcp-language-server`](https://github.com/isaacphi/mcp-language-server)
  (Go). Запускает любую команду языкового сервера: `--lsp <команда> -- <её аргументы>`. Инструменты:
  `definition`, `references`, `diagnostics`, `hover`, `rename_symbol`, `edit_file`. Как он получает
  диагностики — push или pull — не проверено.

## Шаг 1. Проба `mcp-language-server` с TS 7

1. Склонировать фронт, `bun install` — в `node_modules/.bin/tsc` окажется TS 7 из `devDependencies`;
   `node_modules/.bin/tsc --version` → `Version 7.x`.
2. Поставить мост: `go install github.com/isaacphi/mcp-language-server@latest`.
3. Подключить в Claude Code — `.mcp.json` в корне фронта (пути — абсолютные, свои):

   ```json
   {
     "mcpServers": {
       "typescript": {
         "command": "mcp-language-server",
         "args": ["--workspace", "/abs/path/to/front", "--lsp", "/abs/path/to/front/node_modules/.bin/tsc", "--", "--lsp", "--stdio"]
       }
     }
   }
   ```

4. Подключить в Codex — `~/.codex/config.toml`:

   ```toml
   [mcp_servers.typescript]
   command = "mcp-language-server"
   args = ["--workspace", "/abs/path/to/front", "--lsp", "/abs/path/to/front/node_modules/.bin/tsc", "--", "--lsp", "--stdio"]
   ```

   Поддерживает ли текущая версия Codex проектный конфиг вместо `~/.codex/config.toml` — проверить и
   записать в отчёт.

5. В **каждом** агенте проверить и записать результат:

   | Проверка | Как | Ожидается |
   | --- | --- | --- |
   | `definition` | на импорте компонента из `src/components/` в любой странице `src/pages/` | путь и тело компонента |
   | `references` | на функции из `src/api/` | все места вызова, как у `rg` |
   | `hover` | на переменной с выводимым типом | тип |
   | `diagnostics` | временно сломать тип в файле (`const n: number = 'x'`), вызвать на этом файле | ошибка `TS2322` с номером строки; правку откатить |
   | Время | первый вызов после старта агента | записать секунды |
   | Контекст | сколько токенов занимают описания инструментов моста | записать |

6. **Плагин `typescript-native-lsp` в Claude Code на время пробы выключить** — иначе на одном репо два
   языковых сервера и два набора инструментов навигации.

## Шаг 2. Отчёт и стоп

Написать отчёт в PR или issue, который выдал Ярослав: таблица из шага 1 для Codex и Claude Code, версии
(`mcp-language-server`, `tsc`, Codex CLI, Claude Code), что не заработало и с какой ошибкой.

Дальше **не продолжать без решения Ярослава**. Варианты для отчёта:

- **Всё работает, включая `diagnostics`** — закрепить конфиги из шага 1 в репозитории фронта и строку в
  `AGENTS.md` и `CLAUDE.md`: «после правки `.ts`/`.tsx` вызови `diagnostics` на изменённом файле».
- **Не работают только `diagnostics`** (мост ждёт push, а TS 7 отдаёт pull) — два пути, выбирает Ярослав:
  - маленький форк `mcp-language-server` (Go), где `diagnostics` делает запрос `textDocument/diagnostic`;
  - свой тонкий MCP-сервер на TS/Bun в
    [`YarikMix/claude-plugins`](https://github.com/YarikMix/claude-plugins) рядом с плагином
    (`mcp/typescript-native`): `definition`, `references`, `hover`, `documentSymbol`, `callHierarchy`,
    `diagnostics`.
- **Не работает навигация** — приложить лог моста (`LOG_LEVEL=DEBUG`) и ответы `initialize`.

## Не входит

- Serena и её доработка под TS 7.
- Автоматический вызов `diagnostics` после каждой правки (хуки агентов).
- chrome-devtools-mcp и скиллы — другие подзадачи трека.

## Открытые вопросы

- Где живёт MCP-сервер, если понадобится свой: в `YarikMix/claude-plugins` или в переименованном
  репозитории плагинов для обоих агентов.
- Проектный или пользовательский конфиг Codex для команды.
