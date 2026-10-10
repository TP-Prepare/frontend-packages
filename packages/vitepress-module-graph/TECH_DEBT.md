# Техдолг: переиспользование пакета

Пакет написан под сайт одной команды, и другому проекту взять его трудно. Ссылки на код ниже даны по `main`
на [`1cc3890`](https://github.com/TP-Prepare/frontend-packages/tree/1cc3890/packages/vitepress-module-graph).

## Что не мешает

Пакет рисует не только граф, но и всю страницу модуля, шапку трека, архив и меню — для плагина VitePress это
нормально: компоненты, загрузчик данных и функция меню подключаются по отдельности (`moduleSidebar` можно не
вызывать). Урезать пакет до одного блока с графом не нужно: граф — это canvas
[`force-graph`](https://github.com/vasturiano/force-graph) с узлами и связями, такую обёртку легко написать
самому. Ценность пакета — связка целиком: папка Markdown → проверка данных, которая роняет сборку и называет
файл и поле → граф, страницы треков, меню, прогресс по доске.

## Что мешает

### 1. Страница модуля — один компонент

`<ModuleGraph />` ([`ModuleGraph.vue#L97-L143`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/theme/components/ModuleGraph.vue#L97-L143))
отдаёт одним куском панель «Люди и нагрузка» с фильтрами и поиском, граф, карточку узла, задачи доски без трека
и список треков. Взять только граф или только список нельзя.

**Сделать:** экспортировать части как самостоятельные компоненты — граф, фильтры, панель людей, список треков,
задачи доски — с общим состоянием фильтра через props/`v-model` или provide/inject. `<ModuleGraph />` оставить
готовой сборкой из них: сайт команды ничего не меняет.

### 2. Интерфейс только по-русски

Строки лежат прямо в компонентах:
[`GraphFilters.vue#L12`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/theme/components/GraphFilters.vue#L12)
(«Подзадачи», «Менторы», «Связи между треками»), склонения «трек/трека/треков»
([`#L22`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/theme/components/GraphFilters.vue#L22)),
«Люди и нагрузка», «Делает», «Менторы», «Треки», «На графе модуля», заголовки таблицы архива
([`ModuleList.vue#L24`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/theme/components/ModuleList.vue#L24)),
`id="треки"` у заголовка списка
([`TrackList.vue#L20`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/theme/components/TrackList.vue#L20)).
По-русски и ошибки данных, и вывод CLI `module-graph`.

**Сделать:** словарь строк с `locale: en | ru` в `module-graph.yaml` и переопределением отдельных подписей;
множественное число — через `Intl.PluralRules`. Без этого пункта остальные для open source вторичны.

### 3. Названия понятий зашиты

Модель — учебный курс: модуль, трек, подтрек, исполнитель, ментор, спринт. Направления (`areas`), стороны
(`sides`) и шаблон спринта уже настраиваются
([`config.ts#L14`](https://github.com/TP-Prepare/frontend-packages/blob/1cc3890/packages/vitepress-module-graph/src/model/config.ts#L14)),
а слова «модуль», «трек», «ментор» — нет.

**Сделать:** подписи понятий — частью словаря из п. 2 (например, «модуль» → «квартал», «трек» → «инициатива»).
Модель данных не обобщать до графа чего угодно: ниша «кто над чем работает в команде или на курсе» понятна, в
ней пакет сильнее универсального графа.

### 4. README только по-русски

**Сделать:** английский README рядом (`README.en.md`) или английский основной со ссылкой на русский; на npm
показывается один — выбрать какой.

## Порядок

1 и 2 независимы, 3 опирается на 2, 4 — последним, когда API устоится. Пункты 1–3 меняют публичный API пакета:
каждый — через спеку и план. Оценка: 1 — 2–3 часа работы агентов, 2–3 — 3–4 часа, 4 — около часа.
