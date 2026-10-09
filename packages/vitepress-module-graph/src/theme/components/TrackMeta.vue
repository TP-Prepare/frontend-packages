<script setup lang="ts">
// Шапка страницы трека из frontmatter (слот doc-before): направление, люди, документы, подзадачи,
// связи, задачи со снимка доски. На подстранице трека — только строка «Трек · модуль» над заголовком.
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import {
  areaLabel,
  doersOf,
  moduleTasks,
  noTasksNote,
  pageRef,
  sideLabel,
  subtracksOf,
  tasksWithSubtracks,
  trackProgress,
} from '../../index';
import { useModuleGraph } from '../data';
import AreaStyle from '../AreaStyle.vue';
import TaskList from './TaskList.vue';

const data = useModuleGraph();
const { page } = useData();
const found = computed(() => {
  const ref = pageRef(page.value.relativePath, data.config);
  const module = data.modules.find((m) => m.id === ref?.module);
  const track = ref?.track ? module?.tracks.find((t) => t.id === ref.track) : undefined;
  return module && track ? { module, track, sub: ref?.page !== undefined } : null;
});
// null — снимка доски нет, раздела «Задачи» нет.
const byTrack = computed(() => {
  const all = found.value && !found.value.sub ? moduleTasks(data.board, found.value.module) : null;
  return all ? all.byTrack : null;
});
const tasks = computed(() => (byTrack.value && found.value ? (byTrack.value[found.value.track.id] ?? []) : null));
// Прогресс родителя — вместе с задачами подтреков.
const progress = computed(() =>
  byTrack.value && found.value ? trackProgress(tasksWithSubtracks(found.value.module, byTrack.value, found.value.track.id)) : null,
);
const subtracks = computed(() =>
  found.value
    ? subtracksOf(found.value.module, found.value.track.id).map((s) => ({
        s,
        progress: byTrack.value ? trackProgress(byTrack.value[s.id] ?? []) : null,
      }))
    : [],
);
const name = (login: string) => data.people.find((p) => p.login === login)?.name ?? login;
const trackOf = (id: string) => found.value?.module.tracks.find((t) => t.id === id);
const titleOf = (id: string) => trackOf(id)?.title ?? id;
// part_of и related проверены загрузчиком: трек есть в модуле.
const urlOf = (id: string) => withBase(trackOf(id)?.url ?? found.value?.module.url ?? '');
</script>

<template>
  <p v-if="found?.sub" class="eyebrow track-crumb">
    Трек <a :href="withBase(found.track.url)">{{ found.track.title }}</a> ·
    <a :href="withBase(found.module.url)">{{ found.module.title }}</a>
  </p>
  <header v-else-if="found" class="vp-doc track-meta">
    <AreaStyle />
    <p class="eyebrow">
      <span class="area-dot" :style="{ background: `var(--mg-area-${found.track.area})` }" />
      Трек · {{ areaLabel(data.config, found.track.area) }} ·
      <a :href="withBase(found.module.url)">На графе модуля</a>
    </p>
    <h1>{{ found.track.title }}</h1>
    <dl>
      <dt>Делают</dt>
      <dd>{{ doersOf(found.module, found.track).map((d) => `${name(d.login)} (${sideLabel(data.config, d.side)})`).join(', ') }}</dd>
      <template v-if="found.track.mentors.length">
        <dt>Менторы</dt>
        <dd>{{ found.track.mentors.map(name).join(', ') }}</dd>
      </template>
      <template v-if="found.track.partOf">
        <dt>Входит в трек</dt>
        <dd><a :href="urlOf(found.track.partOf)">{{ titleOf(found.track.partOf) }}</a></dd>
      </template>
      <template v-if="found.track.pages.length">
        <dt>Документы</dt>
        <dd>
          <template v-for="(p, i) in found.track.pages" :key="p.id"
            >{{ i > 0 ? ', ' : '' }}<a :href="withBase(p.url)">{{ p.title }}</a></template
          >
        </dd>
      </template>
    </dl>
    <template v-if="found.track.subtasks.length">
      <h2 id="подзадачи">Подзадачи</h2>
      <ul>
        <li v-for="(subtask, i) in found.track.subtasks" :key="i">
          {{ subtask.title }}
          <ul v-if="subtask.subtasks.length">
            <li v-for="(title, j) in subtask.subtasks" :key="j">{{ title }}</li>
          </ul>
        </li>
      </ul>
    </template>
    <template v-if="subtracks.length">
      <h2 id="подтреки">Подтреки</h2>
      <ul>
        <li v-for="{ s, progress: p } in subtracks" :key="s.id">
          <a :href="withBase(s.url)">{{ s.title }}</a><template v-if="p"> — {{ p.done }} из {{ p.total }} готово</template>
        </li>
      </ul>
    </template>
    <template v-if="found.track.related.length">
      <h2 id="связи">Связи</h2>
      <ul>
        <li v-for="r in found.track.related" :key="r.track"><a :href="urlOf(r.track)">{{ titleOf(r.track) }}</a> — {{ r.why }}</li>
      </ul>
    </template>
    <template v-if="tasks">
      <h2 id="задачи">Задачи<template v-if="progress && progress.total > 0"> · {{ progress.done }} из {{ progress.total }} готово</template></h2>
      <TaskList v-if="tasks.length" :tasks="tasks" :people="data.people" />
      <p v-else>{{ noTasksNote(progress?.total ?? 0) }}</p>
    </template>
    <div v-if="!found.track.hasBody" class="info custom-block">
      <p class="custom-block-title">Описание ещё не написано</p>
      <p>Цель, что сделать и приёмку менторы допишут после груминга.</p>
    </div>
  </header>
</template>

<style scoped>
.track-meta {
  margin-bottom: 24px;
}
.track-crumb {
  margin-bottom: 4px;
}
/* Строка стоит вне .vp-doc: ссылкам нужен цвет темы, иначе они не отличаются от текста. */
.track-crumb a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}
.track-crumb a:hover {
  text-decoration: underline;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.area-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 6px;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 16px 0 0;
}
dt {
  color: var(--vp-c-text-2);
}
dd {
  margin: 0;
}
</style>
