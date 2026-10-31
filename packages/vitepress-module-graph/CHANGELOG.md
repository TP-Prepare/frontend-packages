# Changelog

## [1.0.0](https://github.com/TP-Prepare/frontend-packages/compare/vitepress-module-graph-v0.3.0...vitepress-module-graph-v1.0.0) (2026-10-31)


### ⚠ BREAKING CHANGES

* **module-graph:** перейти на VitePress 2.0.0-alpha.21

### Features

* **module-graph:** перейти на VitePress 2.0.0-alpha.21 ([4da9708](https://github.com/TP-Prepare/frontend-packages/commit/4da9708b31f8e371540ef32ae5d55a9206263bfe))

## [0.3.0](https://github.com/TP-Prepare/frontend-packages/compare/vitepress-module-graph-v0.2.0...vitepress-module-graph-v0.3.0) (2026-10-11)


### ⚠ BREAKING CHANGES

* **vitepress-module-graph:** публичные типы изменились:
  * `Subtask.subtasks` — теперь `SubtaskLeaf[]` (`{ title, issues }`), а не `string[]`: название вложенной подзадачи — `.title`;
  * у `BoardData` новое обязательное поле `byRef` — все задачи снимка по номеру;
  * у компонента `GraphCanvas` больше нет `fit()` через `defineExpose`;
  * ошибка разбора объекта подзадачи теперь называет ключи `{ title, issues, subtasks }`.

### Features

* **vitepress-module-graph:** все задачи снимка по номеру и сопоставление с подзадачей ([12ea683](https://github.com/TP-Prepare/frontend-packages/commit/12ea683300f574fde836e337806ce6628d9afe14))
* **vitepress-module-graph:** задачи в карточке подзадачи, без кнопки «Вписать» ([9b33336](https://github.com/TP-Prepare/frontend-packages/commit/9b333369d445cb96ee1792be3996b0b6e63d66e3))
* **vitepress-module-graph:** у подзадачи поле issues — номера задач доски ([d3730ed](https://github.com/TP-Prepare/frontend-packages/commit/d3730edf570707af38fdca9ddaf64f85fb6ab509))


### Bug Fixes

* **vitepress-module-graph:** номер задачи с префиксом владельца доски и в другом регистре находится на доске ([cfcd6c0](https://github.com/TP-Prepare/frontend-packages/commit/cfcd6c042633efcc554a02cfdc872a85c91009e3))

## [0.2.0](https://github.com/TP-Prepare/frontend-packages/compare/vitepress-module-graph-v0.1.2...vitepress-module-graph-v0.2.0) (2026-10-10)


### Features

* **vitepress-module-graph:** модули в меню по возрастанию номера и сворачиваются стрелкой ([370077c](https://github.com/TP-Prepare/frontend-packages/commit/370077c5861bd734efb4901a15ebda6644f0688c))

## [0.1.2](https://github.com/TP-Prepare/frontend-packages/compare/vitepress-module-graph-v0.1.1...vitepress-module-graph-v0.1.2) (2026-10-10)


### Bug Fixes

* **vitepress-module-graph:** Homepage на npm ведёт на README пакета ([12113f4](https://github.com/TP-Prepare/frontend-packages/commit/12113f468436d014f1056dbf1850375cc81d2fd2))

## [0.1.1](https://github.com/TP-Prepare/frontend-packages/compare/vitepress-module-graph-v0.1.0...vitepress-module-graph-v0.1.1) (2026-10-10)


### Bug Fixes

* подпись поля доски из board.field и route: / в pageRef ([35e0c16](https://github.com/TP-Prepare/frontend-packages/commit/35e0c165eb6ace614c0d8f73a65ee66dd2dc7bd4))
