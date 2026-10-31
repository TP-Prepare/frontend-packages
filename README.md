# frontend-packages

Монорепозиторий npm-пакетов на Bun workspaces. Версии и CHANGELOG готовит
release-please, публикацию в npm выполняет GitHub Actions через OIDC.

| Пакет | Назначение | Внутренняя зависимость |
| --- | --- | --- |
| [`@tp-prepare/vitepress-module-graph`](packages/vitepress-module-graph) | Плагин VitePress и CLI | — |
| [`@tp-prepare/example-core`](packages/example-core) | Учебная функция `greet(name)` | — |
| [`@tp-prepare/example-addon`](packages/example-addon) | Учебная функция `greetAll(names)` | `@tp-prepare/example-core` в `dependencies` |

## Локальная проверка

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run test:packages
bun run --filter '*' test:site
```

Сборка выполняется до тестов: `addon` импортирует собранный `core` через его
публичный npm-экспорт. Bun учитывает зависимость и собирает `core` первым.
В `dependencies` указан обычный semver-диапазон `^1.0.0`: локально Bun связывает
пакеты workspace, а после публикации npm устанавливает `core` из реестра.
Сборка `addon` сохраняет импорт `core`, не встраивая его код.

`test:packages` проверяет npm-архивы вне монорепозитория: example-пакеты
устанавливаются без сети и запускаются под Node.js, module-graph устанавливается
с VitePress `2.0.0-alpha.21` и собирает тестовый сайт. Поэтому workspace-симлинки
не могут скрыть ошибку в `exports` или содержимом архива.

## Как устроен релиз

1. Изменения с Conventional Commits попадают в `main`.
2. release-please готовит общий release PR с версиями и CHANGELOG нужных пакетов.
   Пакеты перечислены в `release-please-config.json`, текущие версии —
   в `.release-please-manifest.json`.
3. Плагин `node-workspace` обновляет ссылки на выпущенные внутренние зависимости.
   Если у потребителя нет собственных изменений, он получает patch-релиз.
4. После merge release PR создаются отдельные теги и GitHub Releases.
5. `scripts/publish.ts` получает `paths_released` и публикует только эти пакеты.
   Он строит порядок по зависимостям: `core` раньше `addon`. Цикл или неизвестный
   путь останавливает запуск до публикации; ошибка `npm publish` останавливает
   оставшиеся публикации. Атомарного отката уже опубликованных пакетов нет.

Пакеты имеют независимые версии. Плагин `linked-versions` здесь не используется.

Порядок и содержимое публикации можно проверить без записи в npm. Например,
в PowerShell передаём пути намеренно в обратном порядке:

```powershell
$env:RELEASED_PATHS = '["packages/example-addon","packages/example-core"]'
bun scripts/publish.ts --dry-run
Remove-Item Env:RELEASED_PATHS
```

## Сценарии учебного примера

Ниже предполагается, что начальные версии `core@1.0.0` и `addon@1.0.0`
уже выпущены. Для каждого сценария начальное состояние рассматривается отдельно.

### Изменился core

Измените `packages/example-core/src/index.ts`, например добавьте новую
экспортируемую функцию, и внесите изменение коммитом
`feat(example-core): add another greeting`.

Ожидаемый release PR:

| Файл / пакет | Было | Стало |
| --- | --- | --- |
| Версия `example-core` | `1.0.0` | `1.1.0` |
| Версия `example-addon` | `1.0.0` | `1.0.1` |
| `example-addon.dependencies["@tp-prepare/example-core"]` | `^1.0.0` | `^1.1.0` |

В CHANGELOG `addon` появится запись об обновлении зависимости. После merge
сначала публикуется `core@1.1.0`, затем `addon@1.0.1`.

### Изменился только addon

Измените `packages/example-addon/src/index.ts` коммитом
`fix(example-addon): handle an edge case`.

В release PR версия `addon` станет `1.0.1`. Версия `core` и диапазон зависимости
останутся прежними. Публикуется только `addon`.

release-please распределяет коммиты по затронутым путям. Scope в названии коммита
помогает читать историю, но сам по себе не выбирает пакет: для первого сценария
нужно действительно изменить файл внутри `packages/example-core`.

## Первоначальная настройка npm

Для **каждого** нового пакета отдельно настройте Trusted Publisher:

- npm organization / scope: `tp-prepare`;
- GitHub organization: `TP-Prepare`;
- repository: `frontend-packages`;
- workflow filename: `release.yml`;
- разрешённое действие: `npm publish`.

В workflow уже есть `id-token: write`, Node.js 24 и npm с поддержкой OIDC.
Публикацию выполняет `npm`, а не `bun publish`.

Если имя пакета ещё не зарегистрировано в npm, первую публикацию нужно
подготовить отдельно: опубликовать `1.0.0` вручную с правами на scope, затем
настроить Trusted Publisher. Зафиксируйте эту начальную публикацию также
GitHub Release с тегом `example-core-v1.0.0` / `example-addon-v1.0.0` на коммите,
содержащем опубликованный код. Это даёт release-please исходную точку и не
заставляет CI повторно публиковать уже существующую `1.0.0`. Все последующие
версии выпускаются обычным release PR. Первоначальную настройку завершите
до merge первого автоматически созданного release PR этих пакетов.

Справочные материалы:
[node-workspace](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#node-workspace),
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).
