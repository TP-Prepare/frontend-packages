# @tp-prepare/vitepress-module-graph

[![npm](https://img.shields.io/npm/v/@tp-prepare/vitepress-module-graph?logo=npm)](https://www.npmjs.com/package/@tp-prepare/vitepress-module-graph)
[![CI](https://github.com/TP-Prepare/frontend-packages/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/TP-Prepare/frontend-packages/actions/workflows/ci.yml)
[![Playground](https://img.shields.io/badge/playground-модуль_№2-5C73E7?logo=vitepress&logoColor=white)](https://cringe-driven-development-team.github.io/docs/modules/2/)

Граф учебного модуля «люди — треки — подзадачи» для сайта на VitePress: страница модуля с графом и фильтрами,
шапка на странице каждого трека, архив модулей, меню раздела и прогресс треков по задачам доски GitHub Projects.
Данные — папка с файлами Markdown и YAML; ошибка в данных роняет сборку и называет файл и поле.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/TP-Prepare/frontend-packages/main/packages/vitepress-module-graph/docs/screenshot-light.png">
  <img src="https://raw.githubusercontent.com/TP-Prepare/frontend-packages/main/packages/vitepress-module-graph/docs/screenshot-dark.png" alt="Страница модуля: слева люди с нагрузкой и направления треков, справа граф «люди — треки — подзадачи»">
</picture>

Так это выглядит на сайте команды Cringe Driven Development:
[модуль №2](https://cringe-driven-development-team.github.io/docs/modules/2/).

Нужны VitePress 1.6+ и Vue 3.5+, CLI работает под Node 22+ и bun.

```sh
npm install @tp-prepare/vitepress-module-graph
```

| Вход | Что внутри |
|---|---|
| `@tp-prepare/vitepress-module-graph` | модель: типы, настройки по умолчанию, разбор треков и людей, правила, связи графа, фильтры, разбор снимка доски |
| `…/node` | `loadModuleDir`, `readModules`, `moduleSidebar`, `createModulesLoader` — для конфига и загрузчика VitePress |
| `…/theme` | `installModuleGraph(app, data)` (регистрирует глобально компоненты `<ModuleGraph/>` и `<ModuleList/>`), `trackHeader` (шапка трека), `useModuleGraph()` |
| `…/style.css` | цвета направлений по умолчанию (переменные `--mg-area-*`) |
| `module-graph` | CLI: проверка папки модулей и доска GitHub |

## Подключение

Три файла сайта:

```ts
// site/modules/modules.data.ts — папка этого файла и есть папка модулей
import { createModulesLoader } from '@tp-prepare/vitepress-module-graph/node';
export default createModulesLoader(import.meta.url);
```

```ts
// site/.vitepress/config.mts
import { moduleSidebar, readModules } from '@tp-prepare/vitepress-module-graph/node';
// themeConfig.sidebar:
'/modules/': moduleSidebar(readModules('site/modules')),
// пакет отдаёт .vue как есть — Vite сайта должен собрать его и для SSR:
vite: { ssr: { noExternal: ['@tp-prepare/vitepress-module-graph'] } },
```

```ts
// site/.vitepress/theme/index.ts
import { installModuleGraph, trackHeader } from '@tp-prepare/vitepress-module-graph/theme';
import '@tp-prepare/vitepress-module-graph/style.css';
import { data } from '../../modules/modules.data';
// Layout: () => h(DefaultTheme.Layout, null, { 'doc-before': trackHeader }),
// enhanceApp({ app }) { installModuleGraph(app, data) }  — <ModuleGraph/>, <ModuleList/> и provide данных
```

- Без `vite.ssr.noExternal` сборка падает с `Unknown file extension ".vue"`: Vite оставляет пакет из
  `node_modules` внешним для SSR, а Node не умеет загружать `.vue`.
- `createModulesLoader(url)` возвращает `{ watch, load }` загрузчика VitePress; `watch` — `index.md` модулей,
  файлы треков, `people.yaml`, `module-graph.yaml`, `board.json`.
- `data` — это подстановка VitePress. Если сайт проверяет типы (`tsc`), объявите её в `modules.data.ts`:

  ```ts
  import type { ModuleGraphData } from '@tp-prepare/vitepress-module-graph';
  declare const data: ModuleGraphData;
  export { data };
  ```

- `trackHeader` — шапка трека для слота `doc-before`: на странице не трека ничего не рисует.
- Компоненты берут данные через `provide/inject`: `useModuleGraph()` вне `installModuleGraph` бросает
  `module-graph: вызовите installModuleGraph(app, data) в enhanceApp`.
- Цвета `--mg-area-<ключ>` из `module-graph.yaml` рисует `<style>` в корне графа, архива и шапки трека:
  `:where(:root)` и `:where(html.dark)`, то есть с нулевой специфичностью — сайт переопределяет их обычным
  `:root { … }`. `style.css` даёт те же переменные для направлений по умолчанию.

Страницы: `<папка модулей>/index.md` с `<ModuleList />` — архив модулей, `<номер>/index.md` с `<ModuleGraph />` —
граф модуля, страница трека — сам файл трека.

## Папка модулей

```
<папка модулей>/            по умолчанию site/modules
  index.md                  страница архива (<ModuleList/>)
  module-graph.yaml         настройки, необязательный
  people.yaml               люди, обязательный
  board.json                снимок доски, необязательный
  <номер>/index.md          модуль: title, sprints, <ModuleGraph/>
  <номер>/tracks/<id>.md    трек
```

Ошибки — одной строкой: `<файл от родителя папки модулей>: <поле> — <что не так>`, например
`modules/people.yaml: [2].area — неизвестное направление qa; допустимо: front, back, devops, fullstack, team`.
Сломанный YAML и frontmatter — с файлом и строкой, без стека.

### `module-graph.yaml`

Необязательный. Без него действуют значения ниже, кроме раздела `board` — по умолчанию его нет.

```yaml
route: /modules/
areas:                                   # порядок = порядок в фильтре и легенде
  front:     { label: Фронт,               color: "#2c6bd4", dark: "#5f95f1" }
  back:      { label: Бэк,                 color: "#13886b", dark: "#3fbc9c" }
  devops:    { label: DevOps,              color: "#b07710", dark: "#e1a740" }
  fullstack: { label: Фронт + бэк,         color: "#c9445a", dark: "#e47584", needs: [front, back] }
  team:      { label: Инструменты команды, color: "#6b7c1c", dark: "#a9ba5c" }
sides: { front: фронт, back: бэк, devops: devops, team: команда }
sprint: "Sprint {n}"
board: { owner: Cringe-Driven-Development-Team, project: 1, field: Трек }
```

- `route` — адрес папки модулей на сайте, с `/` в начале и в конце; от него строятся ссылки на модули, треки и
  подстраницы.
- `areas` (направления треков) и `sides` (стороны исполнителей), если заданы, заменяют значения по умолчанию
  целиком. Ключи — строчная латиница, цифры и дефис, первая — буква. `color` (светлая тема) и `dark` (тёмная) —
  `#rrggbb`.
- `needs` — стороны из `sides`: у трека с этим направлением исполнители (вместе с исполнителями подтреков)
  закрывают все перечисленные стороны.
- `sprint` — шаблон названия спринта с одним `{n}`, `n` — целое число.
- `board.owner` — организация или пользователь GitHub, `board.project` — номер проекта, `board.field` — имя поля
  доски с одиночным выбором, в котором задача выбирает трек.
- Неизвестный ключ на любом уровне — ошибка: опечатка не откатывается молча на значение по умолчанию.

### `people.yaml`

```yaml
- login: YarikMix
  name: Ярослав
  role: ментор фронта
  area: front
  mentor: true
```

Список, порядок — порядок на графе. `login` (логин GitHub), `name`, `role`, `area` — непустые строки, `area` —
ключ из `areas`, `mentor` — только `true`. Логины не повторяются.

### Модуль

Каталог `<номер>/` (`2`, `3`, …) с `index.md`: во frontmatter `title`, необязательные `period` и `sprints`
(спринты модуля по шаблону `sprint`, например `sprints: [Sprint 5, Sprint 6]` — по ним задача доски попадает в
модуль), `aside: false`; в тексте `<ModuleGraph />`.

### Трек

Файл `<номер>/tracks/<id>.md`, `id` — строчная латиница, цифры и дефис:

```yaml
---
title: Multi-branch деплой фронта и стейджинг бэка через Coolify
label: Multi-branch + стейджинг (Coolify)   # подпись на графе; без него — title
area: devops                                 # ключ из areas
do:                                          # логин → сторона из sides
  iRedTea: devops
mentors: [YarikMix, blackHATred]             # необязательно; только люди с mentor: true в people.yaml
subtasks:                                    # необязательно
  - Откаты
related:                                     # необязательно: связь с треком этого модуля
  - track: ai-review
    why: Агентам Stagehand нужен стенд ветки
---

## Цель
…
```

Заголовок, исполнителей, подзадачи и связи страница трека показывает сама — в тексте `# Заголовок` не нужен.
Пока текста нет, на странице плашка «Описание ещё не написано». У направления с `needs` (по умолчанию —
`fullstack`) нужны исполнители со всех перечисленных сторон.

Подтрек — трек с `part_of: <id родителя>`: он висит под родителем в меню и на графе, у родителя без `do`
исполнители берутся из подтреков. Вложенность — один уровень.

**Подстраницы трека** — когда одной страницы мало: файлы `tracks/<id>/<page>.md` с `title` во frontmatter и
список во frontmatter трека, он же задаёт порядок:

```yaml
pages: [contract, auth]
```

Подстраницы появляются в меню под треком и строкой «Документы» в шапке трека. Файл без записи в `pages` или
запись без файла роняют сборку.

В `vitepress dev` новый трек появится на графе сразу, а в меню — после перезапуска dev-сервера.

### `board.json`

Снимок доски GitHub Projects (`module-graph board snapshot`). С ним граф показывает прогресс треков, а карточки и
страницы треков — задачи. Сломанный снимок сборку не роняет: предупреждение в консоли, задачи не показаны.
Ссылки на задачи из репозиториев `board.owner` выглядят как `репо#N`, из остальных — `владелец/репо#N`.

## CLI `module-graph`

Папка модулей — `site/modules` от текущего каталога или `--dir <путь>`.

| Команда | Что делает | Вывод и код |
|---|---|---|
| `module-graph check` | читает и проверяет папку модулей | `modules ok: <N> модул…, <M> трек…`, 0; ошибка — одна строка в stderr, 1 |
| `module-graph check --hook` | хук `PostToolUse` Claude Code: из stdin `tool_input.file_path`; файл внутри папки модулей — проверка этой папки | молча 0; ошибка — stderr, 2 |
| `module-graph board sync` | пополняет поле `board.field` значениями id треков, описание — `title` из самого нового модуля | `sync: добавлено N значений «<field>»` |
| `module-graph board snapshot <файл>` | снимок доски в JSON | `snapshot: N задач` |

- `--hook`: папка модулей — ближайшая папка-предок файла, в которой есть `people.yaml`. Не JSON, нет
  `file_path`, нет такой папки — 0 молча.
- `board …` нужен раздел `board` в `module-graph.yaml` и токен в `GH_TOKEN` (другие переменные не читаются).
  Токен в тексте ошибки заменяется на `***`. Строка итога и ошибки дописываются в `GITHUB_STEP_SUMMARY`, если он
  задан.
- `sync` заменяет список значений поля целиком: значение, добавленное руками в интерфейсе доски между чтением и
  записью, пропадёт — новые треки добавляйте файлами.
- Неизвестная команда — использование в stderr, код 1.

Локально снимок доски:

```sh
GH_TOKEN="$(gh auth token)" npx module-graph board snapshot site/modules/board.json
```

## Разработка

Из корня `frontend-packages`:

```sh
bun install
bun run build && bun run typecheck && bun run test && bun run --filter '*' test:site
```

- `build` — `tsdown`: `src/**/*.ts` → `dist/*.mjs` и `.d.mts`; `.vue` копируются в `dist/theme/` без изменений,
  `dist/theme/style.css` пишется из `areaCss(DEFAULT_CONFIG)`.
- `typecheck` — `tsc` (TypeScript 7) и `vue-tsc` для `.vue` (на TypeScript 6 из `@typescript/typescript6`: у
  TypeScript 7 нет JS API, на котором работает `vue-tsc`).
- `test:site` — тестовый сайт `test/site` на копии фикстуры: пакет копируется в `test/site/node_modules`, как
  после `npm install`, затем `tsc`, `vitepress build` и проверка страниц, затем дымовая проверка `vitepress dev`.

## Первая публикация

Дальше версии выходят через release-please (`release.yml`, публикация с OIDC). Первый раз — руками:

1. Организация `tp-prepare` на npmjs.com.
2. Публикация `0.1.0`: `bun run build`, затем `npm publish` из `packages/vitepress-module-graph`.
3. Trusted publisher пакета на npmjs.com: репозиторий `TP-Prepare/frontend-packages`, workflow `release.yml`.
