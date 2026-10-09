---
title: Контекст всего сервиса для агента фронта
---

# Контекст всего сервиса для агента фронта

::: info
ТЗ для исполнителя-агента. Всё нужное — на этой странице; развилки, которые здесь не решены, не решать
самому: остановиться и спросить Ярослава.
:::

## Цель

Агент — Codex CLI или Claude Code — запущен в репозитории фронта на задачу фронта. Когда задача задевает
остальной сервис — API, авторизацию, окружение, общие пакеты, — агент сам находит нужную страницу
документации или нужный код соседнего репозитория и читает его, а не угадывает.

## Контекст

**Репозитории сервиса:**

| Что | Репозиторий |
| --- | --- |
| Код фронта | [`frontend-park-mail-ru/2026_2_Cringe_Driven_Development`](https://github.com/frontend-park-mail-ru/2026_2_Cringe_Driven_Development) (организация преподавателей) |
| Код бэка (Go) | [`go-park-mail-ru/2026_2_Cringe_Driven_Development`](https://github.com/go-park-mail-ru/2026_2_Cringe_Driven_Development) (другая организация преподавателей) |
| Задачи фронта и бэка | issues в [`frontend`](https://github.com/Cringe-Driven-Development-Team/frontend) и [`backend`](https://github.com/Cringe-Driven-Development-Team/backend) |
| Инфра | [`infra`](https://github.com/Cringe-Driven-Development-Team/infra) |
| Статика (картинки, шрифты) | [`static`](https://github.com/Cringe-Driven-Development-Team/static) |
| npm-пакеты команды | [`react`](https://github.com/Cringe-Driven-Development-Team/react) — `@maninthecoat/react`, [`zustand-cdd`](https://github.com/Cringe-Driven-Development-Team/zustand-cdd) — `@maninthecoat/zustand`, [`openapi-cdd`](https://github.com/Cringe-Driven-Development-Team/openapi-cdd) — `@iredtea/openapi` |
| Документация | [`docs`](https://github.com/Cringe-Driven-Development-Team/docs), сайт — [cringe-driven-development-team.github.io/docs](https://cringe-driven-development-team.github.io/docs/) |

**Документация делится на две части:** страницы вне модулей описывают, как работает прод (архитектура,
CSRF); модули — план: что делаем в текущем модуле, по трекам.

**Что сейчас видит агент фронта.** В корне фронта лежит `CLAUDE.md`. В нём есть ссылки на бэк и `static`,
но нет документации, инфры и пакетов, нет и того, как прочитать задачу.

**Как агенты читают инструкции** (по документации на 09.10.2026):

- **Codex** читает только `AGENTS.md` и собирает их один раз при старте: от корня git-репозитория до папки
  запуска. Вне git-репозитория — только папку запуска. `CLAUDE.md` Codex не читает
  ([AGENTS.md в Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md)).
- **Claude Code** с версии 2.1.277 сам читает `AGENTS.md`, если рядом нет `CLAUDE.md`. `CLAUDE.md`
  подпапок подгружает, когда работает с их файлами. Настройки `.claude/settings.json` и `.mcp.json`
  берёт из папки запуска ([память Claude Code](https://code.claude.com/docs/ru/memory)).
- **`--add-dir`** есть у обоих: Claude Code получает доступ к папке, но её `CLAUDE.md` по умолчанию не
  читает; Codex получает право записи
  ([команды Codex](https://learn.chatgpt.com/docs/developer-commands?surface=cli)). Читает ли Codex
  соседние папки без флага — в документации не сказано.

**Поэтому агента запускают из репозитория фронта, а соседние репозитории подключают через `--add-dir`.**
При запуске из общей папки над всеми репозиториями Codex не прочитает `AGENTS.md` фронта вовсе, а Claude
Code — его настройки и MCP-серверы. Запуск из общей папки нужен только задаче, которая меняет сразу
несколько репозиториев.

**Задачу агенту называет человек** — номером issue. Обходить все issues агенту не нужно: достаточно прочитать
одну, `gh issue view <номер> -R Cringe-Driven-Development-Team/frontend`.

## Предусловие

`CLAUDE.md` фронта переименован в `AGENTS.md` — один файл правил для Codex и Claude Code. Это отдельная
задача фронтендеров; её заводит Ярослав. Пока она не сделана, шаги ниже не начинать.

## Шаг 1. Раздел «Сервис целиком» в `AGENTS.md` фронта

Только ссылки, без пересказа: пересказ устареет и станет второй правдой. Таблица «вопрос → где ответ»:

| Вопрос | Где ответ |
| --- | --- |
| Как устроен прод | [Архитектура](https://cringe-driven-development-team.github.io/docs/architecture/) |
| Авторизация, CSRF | [CSRF](https://cringe-driven-development-team.github.io/docs/security/csrf/) |
| Что делаем в текущем модуле | трек модуля в [документации](https://cringe-driven-development-team.github.io/docs/) |
| Ручка бэка: поля, ошибки, код | контракт — `spec/openapi.json`; код — `../backend` |
| Окружение, деплой | `../infra` |
| Общие пакеты | `../react`, `../zustand-cdd`, `../openapi-cdd` |
| Текущая задача | `gh issue view <номер> -R Cringe-Driven-Development-Team/frontend` |

И правило под таблицей: «Если задача задевает API, авторизацию или окружение — сначала открыть
страницу или код из таблицы, потом менять».

## Шаг 2. Раскладка клонов и запуск

В `README.md` фронта:

1. Раскладка: все репозитории клонируются рядом, в одну папку — `~/cdd/<репозиторий>`; команды
   `git clone` для каждого из таблицы «Контекст», бэк — в `~/cdd/backend`, фронт — в `~/cdd/frontend`.
2. Запуск из `~/cdd/frontend`:
   - Claude Code: `claude --add-dir ../docs --add-dir ../backend --add-dir ../infra --add-dir ../react --add-dir ../zustand-cdd --add-dir ../openapi-cdd`;
   - Codex: проверить, читает ли он `../docs` и `../backend` без флага. Читает — запускать без флага:
     `--add-dir` в Codex даёт право записи в чужой репозиторий, а оно задаче фронта не нужно. Не читает —
     записать в отчёт и спросить Ярослава.

## Шаг 3. Приёмка

В **новой** сессии каждого агента, запущенного по шагу 2, задать без подсказок три вопроса и записать ответы:

| Вопрос | Засчитывается |
| --- | --- |
| Где в коде Go ручка, которую вызывает страница блокнота, и какие поля она возвращает? | верный путь к файлу в `../backend` и поля, совпадающие с `spec/openapi.json` |
| Как в проде устроена защита от CSRF? | ссылка на страницу CSRF и пересказ своими словами |
| Что по BFF запланировано в текущем модуле? | ссылка на трек BFF текущего модуля |

## Шаг 4. Отчёт

PR во фронт с изменениями `AGENTS.md` и `README.md`; в описании — таблица шага 3 для Codex и Claude Code,
версии агентов и ответ, читает ли Codex соседние папки без `--add-dir`.

## Не входит

- `llms.txt` и markdown-копии страниц сайта документации.
- Общий скилл «контекст CDD» в [`claude-plugins`](https://github.com/Cringe-Driven-Development-Team/claude-plugins).
- [Beads](https://github.com/steveyegge/beads) — трекер задач в git: задачи уже в issues, план — в модулях;
  третий источник правды не нужен.
- GitHub MCP.
- То же для репозитория бэка — повторит по образцу.

Всё это — следующий шаг, если ссылок и `--add-dir` окажется мало.

## Кто ведёт таблицу

`AGENTS.md` фронта — файл фронтендеров. Переехала страница документации — ссылку в таблице правит тот, кто
её перенёс, в том же PR или следующим во фронт.
