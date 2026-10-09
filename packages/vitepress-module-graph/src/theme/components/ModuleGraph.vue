<script setup lang="ts">
// Страница модуля: фильтры, граф, карточка узла и список треков. Модуль — по пути страницы,
// фильтр — в query-строке адреса; данные — из installModuleGraph.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import {
  buildGraph,
  defaultFilter,
  type Filter,
  filterFromQuery,
  filterToQuery,
  type ModuleTasks,
  moduleTasks,
  pageRef,
  personLoad,
  searchMatches,
  tasksWithSubtracks,
  trackProgress,
} from '../../index';
import { useModuleGraph } from '../data';
import AreaStyle from '../AreaStyle.vue';
import GraphCanvas from './GraphCanvas.vue';
import GraphFilters from './GraphFilters.vue';
import NodeCard from './NodeCard.vue';
import TaskList from './TaskList.vue';
import TrackList from './TrackList.vue';

const data = useModuleGraph();
const { page } = useData();
const module = computed(() => data.modules.find((m) => m.id === pageRef(page.value.relativePath, data.config)?.module));
// Папка модулей от корня сайта — для подсказки в пустом модуле.
const folder = data.config.route.replace(/^\/|\/$/g, '');
const filter = ref<Filter>(defaultFilter(data.config));
const query = ref('');
const selected = ref<string | null>(null);
const failed = ref(false);
const canvas = ref<InstanceType<typeof GraphCanvas>>();

// Задачи модуля со снимка доски; null — снимка нет.
const tasks = computed<ModuleTasks | null>(() => (module.value ? moduleTasks(data.board, module.value) : null));
// Прогресс родителя — вместе с задачами подтреков.
const progress = computed(() => {
  const m = module.value;
  const byTrack = tasks.value?.byTrack ?? {};
  return m ? Object.fromEntries(m.tracks.map((t) => [t.id, trackProgress(tasksWithSubtracks(m, byTrack, t.id))])) : {};
});
const takenAt = computed(() =>
  data.board
    ? new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(data.board.takenAt))
    : null,
);

const graph = computed(() =>
  module.value ? buildGraph(module.value, data.people, filter.value, progress.value) : { nodes: [], links: [] },
);
const matches = computed(() => searchMatches(graph.value.nodes, query.value));
const load = computed(() => (module.value ? personLoad(module.value, data.people) : []));
const empty = computed(() => !graph.value.nodes.some((n) => n.kind === 'track'));

function reset(): void {
  filter.value = defaultFilter(data.config);
  query.value = '';
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') selected.value = null;
}

onMounted(() => {
  filter.value = filterFromQuery(location.search, data.people, data.config);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

watch(filter, (value) => history.replaceState(history.state, '', location.pathname + filterToQuery(value, data.config) + location.hash), { deep: true });
watch(graph, (value) => {
  if (selected.value && !value.nodes.some((n) => n.id === selected.value)) selected.value = null;
});
</script>

<template>
  <div v-if="module" class="module-graph">
    <AreaStyle />
    <p v-if="module.period" class="period">{{ module.period }}</p>
    <p v-if="module.tracks.length === 0" class="empty">
      В модуле пока нет треков. Добавьте файл в <code>{{ folder }}/{{ module.id }}/tracks/</code>.
    </p>
    <!-- Снимок доски — под графом (вторая строка правой колонки); без треков — сам по себе. -->
    <div :class="{ layout: module.tracks.length > 0 }">
      <template v-if="module.tracks.length">
        <GraphFilters v-model:filter="filter" v-model:query="query" :people="data.people" :load="load" class="filters" />
        <div class="stage">
          <ClientOnly>
            <GraphCanvas
              v-if="!failed"
              ref="canvas"
              :nodes="graph.nodes"
              :links="graph.links"
              :selected="selected"
              :matches="matches"
              @select="selected = $event"
              @failed="failed = true"
            />
          </ClientOnly>
          <p v-if="failed" class="notice">Граф не загрузился, ниже — список треков</p>
          <div v-else-if="empty" class="notice">
            <p>Под фильтр ничего не попало</p>
            <button type="button" class="reset" @click="reset">Сбросить фильтры</button>
          </div>
          <NodeCard
            v-if="selected"
            :id="selected"
            :module="module"
            :people="data.people"
            :tasks="tasks"
            @select="selected = $event"
            @close="selected = null"
          />
          <div class="hud">
            <p>Наведите на узел, чтобы подсветить соседей. Клик открывает карточку, колесо мыши меняет масштаб.</p>
            <button type="button" @click="canvas?.fit()">Вписать</button>
          </div>
        </div>
      </template>
      <section v-if="module.sprints.length" class="board">
        <p class="taken">{{ takenAt ? `Снимок доски: ${takenAt} МСК` : 'Задачи с доски не загружены' }}</p>
        <details v-if="tasks?.untracked.length">
          <summary>Задачи без трека · {{ tasks.untracked.length }}</summary>
          <TaskList :tasks="tasks.untracked" :people="data.people" />
        </details>
        <details v-if="tasks?.unknown.length">
          <summary>Задачи с неизвестным треком · {{ tasks.unknown.length }}</summary>
          <TaskList :tasks="tasks.unknown" :people="data.people" />
        </details>
      </section>
    </div>
    <TrackList v-if="module.tracks.length" :module="module" />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  gap: 12px 16px;
  margin: 16px 0 32px;
}
.layout .filters {
  grid-row: span 2;
}
.layout .board {
  grid-column: 2;
  align-self: start;
  margin: 0;
}
.stage {
  position: relative;
  min-width: 0;
  height: min(70vh, 640px);
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}
.notice {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--vp-c-text-2);
  pointer-events: none;
}
.notice p {
  margin: 0;
}
.notice button {
  pointer-events: auto;
}
.reset,
.hud button {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  font-size: 13px;
}
.reset:hover,
.hud button:hover {
  border-color: var(--vp-c-brand-1);
}
.hud {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
}
.hud p {
  max-width: 46ch;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--vp-c-text-2);
}
.hud button {
  flex: none;
  pointer-events: auto;
}
.period {
  color: var(--vp-c-text-2);
}
.board {
  margin: 0 0 32px;
}
.taken {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.board details {
  margin: 4px 0;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
.board summary {
  margin: 0;
  cursor: pointer;
  font-weight: 500;
}
.board details[open] summary {
  margin-bottom: 8px;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }
  .layout .filters {
    grid-row: auto;
  }
  .layout .board {
    grid-column: auto;
  }
}
@media (max-width: 640px) {
  .stage {
    height: 70svh;
  }
  .hud p {
    display: none;
  }
}
</style>
