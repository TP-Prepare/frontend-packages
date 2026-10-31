# VitePress 2 Module Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Проверить и выпустить `@tp-prepare/vitepress-module-graph` для VitePress `2.0.0-alpha.21`.

**Architecture:** Сохранить загрузчик, экспорты и компоненты пакета; обновить требование движка и исправить доказанные несовместимости. Проверять установленный пакет через существующий тестовый сайт и отдельную установку npm-архива вне workspace. Выпустить через release-please и `release.yml` после локальной интеграции с docs.

**Tech Stack:** Bun workspaces, TypeScript, Vue 3.5, VitePress `2.0.0-alpha.21`, tsdown, bun:test, GitHub Actions/npm OIDC.

**Spec:** `docs/superpowers/specs/2026-10-31-vitepress-2-module-graph-design.md`.

## Global Constraints

- Пользователь согласовал точечную миграцию и выпуск пакета; способ исполнения ещё не выбран.
- VitePress в peer и dev dependencies: точно `2.0.0-alpha.21`.
- Не добавлять поддержку VitePress 1.x и других alpha-версий.
- Сохранить формат данных модулей, публичные экспорты и CLI.
- Менеджер зависимостей — Bun; не создавать `package-lock.json`.
- Версию пакета, CHANGELOG и `.release-please-manifest.json` ведёт release-please.
- Публикация — только действующий `release.yml`; не публиковать вручную.
- Не обновлять посторонние прямые зависимости и пакеты.

## Review Focus

1. Реальный архив вне workspace: присутствуют `.vue`, CSS, JS и типы; SSR потребителя не скрыт симлинком — Task 1, шаги 6–7.
2. Dev prebundling: копии ключа provide/inject совпадают, граф получает данные после оптимизации — Task 1, шаги 4, 8.
3. Вложенный base: ссылки архива, трека и подстраницы сохраняют `/branches/vitepress-2/` — Task 1, шаги 5, 8.
4. SSR с успешным HTML: после гидратации работают фильтр и карточка графа без ошибок консоли — Task 1, шаг 8.
5. CSS reset новой темы: подписи и элементы управления читаемы в обеих темах и на узком экране — Task 1, шаг 8.

## Карта файлов

- `packages/vitepress-module-graph/package.json`, `bun.lock`: зависимости и команда проверки архива.
- `packages/vitepress-module-graph/test/package.test.ts`: существующее утверждение peer-контракта.
- `packages/vitepress-module-graph/test/site/.vitepress/config.mts`: base только тестового сайта.
- `packages/vitepress-module-graph/test/site/check.ts`, `dev-check.ts`: проверка сайта с вложенным base.
- Новый `scripts/check-module-graph-package.ts`: установка и проверка настоящего архива вне workspace.
- `package.json`, `.github/workflows/ci.yml`: включение проверок в существующий CI.
- `packages/vitepress-module-graph/README.md`: проверенная версия и команды.
- Только при воспроизведённом дефекте: `src/node/loader.ts`, `src/theme/index.ts`, `src/theme/data.ts`, соответствующие компоненты/тесты внутри `packages/vitepress-module-graph/`.

## Порядок между репозиториями

Task 1 даёт локальный архив. Рабочая область docs проверяет миграцию с этим архивом до публикации.
После успешной интеграции выполняется Task 2; затем docs устанавливает выпущенную версию из npm.
До интеграционной проверки разработка обоих репозиториев может идти независимо.

### Task 1: Пакет, проверенный на целевом движке

**Files:** см. карту файлов; версии и release manifest в этой задаче не менять.

**Interfaces:**
- Consumes: существующие `createModulesLoader(url: string): { watch: string[]; load(): ModuleGraphData }`, `installModuleGraph(app: App, data: ModuleGraphData): void`, `trackHeader(): VNode` и тестовый сайт `test/site`.
- Проверка архива: `bun scripts/check-module-graph-package.ts [archive.tgz]`; без аргумента упаковывает собственный собранный пакет, с аргументом проверяет указанный архив. В обоих случаях exit 0 означает успешную установку/сборку, ненулевой exit — ошибку с выводом дочерней команды или assert.
- Produces: прежние публичные экспорты, точный VitePress peer `2.0.0-alpha.21`, проверенный `.tgz` и его SHA-256. Записать абсолютный путь архива и SHA коммита для исполнителя docs; номер версии остаётся текущим до release-please.

- [ ] **Шаг 1: Подтвердить исходную точку.** Прочитать спеку, README, `package.json` и CI; проверить git status и изменения `origin/main` относительно `00e8548745e6f04933f798a73f9c395c1eb4febd`. В собственной рабочей области установить текущие зависимости через `bun install --frozen-lockfile`, выполнить `bun run build && bun run typecheck && bun run test && bun run test:packages && bun run --filter '*' test:site`. Ошибки исходной версии отделить от миграции.

- [ ] **Шаг 2: Обновить существующий тест контракта и увидеть несовпадение.** В `test/package.test.ts`, тест «манифест пакета», заменить только ожидаемое значение:

  ```ts
  expect(pkg.peerDependencies).toEqual({ vitepress: "2.0.0-alpha.21", vue: "^3.5" });
  ```

  Запустить `bun test packages/vitepress-module-graph/test/package.test.ts`; ожидается FAIL на прежнем `^1.6`.

- [ ] **Шаг 3: Обновить зависимости.** В манифесте пакета установить peer и dev VitePress в `2.0.0-alpha.21`; выполнить `bun install`, проверить diff lockfile, затем повторить тест контракта и `build/typecheck/test`. Ожидается PASS, либо конкретная воспроизведённая несовместимость для следующего шага.

- [ ] **Шаг 4: Проверить настоящий сайт и исправить только найденные дефекты.** Выполнить `bun run --filter @tp-prepare/vitepress-module-graph test:site`. Сохранить проверки девяти Vue-компонентов и общего `Symbol.for("@tp-prepare/vitepress-module-graph")` в `dev-check.ts`. При сбое добавить маленький тест на наблюдаемую ошибку, подтвердить FAIL, затем внести минимальное исправление и подтвердить PASS. Если несовместимостей нет, исходники не менять.

- [ ] **Шаг 5: Проверить вложенный base существующим сайтом.** В `check.ts` ожидать ссылки от `process.env.SITE_BASE ?? "/"`, затем запустить с `SITE_BASE=/branches/vitepress-2/` и подтвердить FAIL на конфиге с корневым base. В конфиг тестового сайта добавить чтение этого же base; в `dev-check.ts` начинать обход с пути темы и страницы под base, а полученные абсолютные пути импортов запрашивать без повторного добавления префикса. Выполнить `test:site` без переменной и с `SITE_BASE=/branches/vitepress-2/`; оба запуска должны завершиться `test:site ok` / `test:site dev ok`. Добавить второй запуск в существующий CI.

- [ ] **Шаг 6: Добавить проверку архива самого module-graph.** Создать `scripts/check-module-graph-package.ts` по стилю `check-example-packages.ts`: стандартные fs/os/path/assert, временный каталог через `mkdtempSync`, вывод stdout/stderr при ошибке, очистка только собственного каталога в `finally`. Проверка должна упаковать собранный пакет через `bun pm pack`, установить архив вместе с точным VitePress и Vue вне workspace, использовать тестовый сайт без его старых `node_modules`, cache и dist, затем собрать его с нужным `ssr.noExternal`.

  Assert-проверки скрипта: установленные файлы пакета находятся внутри временного потребителя и не являются workspace-симлинком; присутствуют `dist/index.mjs`, `.d.mts`, `dist/node`, все девять `.vue` и `dist/theme/style.css`; peer равен `2.0.0-alpha.21`; импорт model/node и CLI check реальной фикстуры успешны; собранные архив, трек и подстраница содержат ожидаемые подписи/ссылки. Node напрямую `.vue` не импортирует — экспорт theme проверяется сборкой VitePress.

- [ ] **Шаг 7: Проверить чувствительность проверки архива и подключить её.** Запустить скрипт; ожидается exit 0. Во временной копии собранного пакета убрать `TrackMeta.vue`, создать повреждённый архив и передать его скрипту позиционным аргументом; подтвердить ненулевой exit. Рабочий `dist` не портить. Добавить запуск скрипта в корневой `test:packages`, не удаляя проверку example-пакетов. Повторить `bun run test:packages`; оба потребителя должны пройти.

- [ ] **Шаг 8: Проверить поведение в браузере.** На тестовом сайте в dev и после production build открыть архив, модуль, трек и подстраницу с корневым и вложенным base. Фильтр реально изменяет граф, выбор узла открывает карточку, ссылка ведёт на трек, шапка/обратная ссылка подстраницы видимы. Повторить в светлой/тёмной теме и при ширине 390 px. Ожидается отсутствие ошибок provide/inject, hydration и загрузки ресурсов; canvas не остаётся пустым. Сохранить результаты/скриншоты в журнале исполнения, не создавать отдельную инфраструктуру браузерных тестов.

- [ ] **Шаг 9: Проверить всю рабочую область и подготовить передачу.** Обновить README, выполнить команды шага 1 с новым движком, проверить diff. Создать архив `bun pm pack --destination <временный-каталог> --quiet` из каталога пакета, вычислить SHA-256, передать docs. Соблюсти выбранный способ исполнения и его ревью; зафиксировать изменения коммитом `feat(module-graph)!: перейти на VitePress 2.0.0-alpha.21`.

### Task 2: Выпуск проверенного пакета

**Files:** исходники не менять; release-please сам готовит версии, CHANGELOG и manifest.

**Interfaces:**
- Consumes: принятый результат Task 1, успешная локальная интеграция docs с архивом этого коммита, ссылка на PR пакета и актуальный head SHA.
- Produces: версия `MODULE_GRAPH_VERSION`, npm integrity/tarball, успешный publish run и release commit. `MODULE_GRAPH_VERSION` — значение из фактического релиза, а не заранее назначенное число.

- [ ] **Шаг 1: Интегрировать проверенное изменение.** Подготовить PR в `TP-Prepare/frontend-packages`; проверить свежий head, обязательные CI и отсутствие конфликтов. Сохранить breaking Conventional Commit при выбранном способе слияния. После merge проверить CI на main и запуск release-please. Сверять правила репозитория и навык работы с PR при исполнении.
- [ ] **Шаг 2: Проверить и интегрировать release PR.** Убедиться, что новая версия и CHANGELOG относятся к module-graph и соответствуют breaking change; посторонние изменения версии допустимы только по действующему release-механизму. Не редактировать версию вручную. Перед merge повторить проверку head, обязательных CI и конфликтов.
- [ ] **Шаг 3: Дождаться реальной публикации.** Проверить `release.yml`, GitHub Release и `bun info @tp-prepare/vitepress-module-graph@<версия>`: peer VitePress должен быть точным `2.0.0-alpha.21`, tarball — опубликованным архивом нужного релиза. Одного Git-тега недостаточно. При сбое исправлять существующий workflow; вручную `npm publish` не запускать.
- [ ] **Шаг 4: Подтвердить установку и передать версию в docs.** В чистом временном потребителе установить опубликованную версию из npm и проверить её peer/export-контракт. Зафиксировать `MODULE_GRAPH_VERSION`, release commit и publish run. Дальнейшая установка в реальный docs и повторная интеграционная проверка выполняются в Task 2 основного плана; до их успеха вся миграция не завершена.
