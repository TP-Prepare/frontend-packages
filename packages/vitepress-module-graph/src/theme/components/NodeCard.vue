<script setup lang="ts">
// Карточка выбранного узла графа: человек, трек или подзадача; задачи — со снимка доски.
import { computed } from 'vue';
import { withBase } from 'vitepress';
import {
  areaLabel,
  doersOf,
  type Module,
  type ModuleTasks,
  noTasksNote,
  type Person,
  sideLabel,
  subtaskByNodeId,
  subtracksOf,
  type Track,
  tasksWithSubtracks,
  trackProgress,
} from '../../index';
import { useModuleGraph } from '../data';
import TaskList from './TaskList.vue';

// tasks: null — снимка доски нет, блоков задач в карточке нет.
const props = defineProps<{ id: string; module: Module; people: readonly Person[]; tasks: ModuleTasks | null }>();
const emit = defineEmits<{ select: [id: string]; close: [] }>();

const { config } = useModuleGraph();
const person = (login: string) => props.people.find((p) => p.login === login);
const trackById = (id: string) => props.module.tracks.find((t) => t.id === id);
const sideOf = (t: Track, login: string) => {
  const side = doersOf(props.module, t).find((d) => d.login === login)?.side;
  return side ? sideLabel(config, side) : 'ментор';
};

const view = computed(() => {
  const [kind, rest = ''] = props.id.split(':') as [string, string];
  if (kind === 'person') {
    const p = person(rest);
    if (!p) return null;
    const doing = props.module.tracks.filter((t) => t.do.some((d) => d.login === p.login));
    const mentoring = props.module.tracks.filter((t) => t.mentors.includes(p.login));
    const mates = new Map<string, string[]>();
    for (const t of [...doing, ...mentoring]) {
      for (const login of [...t.do.map((d) => d.login), ...t.mentors]) {
        if (login !== p.login) mates.set(login, [...(mates.get(login) ?? []), t.label]);
      }
    }
    const tasks = props.tasks;
    const all = tasks ? [...Object.values(tasks.byTrack).flat(), ...tasks.untracked, ...tasks.unknown] : null;
    const open = all?.filter((t) => t.assignees.includes(p.login) && t.state === 'open' && t.status !== 'Done') ?? null;
    return { kind: 'person' as const, p, doing, mentoring, mates: [...mates], open };
  }
  if (kind === 'track') {
    const t = trackById(rest);
    if (!t) return null;
    const incoming = props.module.tracks.flatMap((o) => o.related.filter((r) => r.track === t.id).map((r) => ({ track: o.id, why: r.why })));
    const byTrack = props.tasks?.byTrack ?? null;
    const tasks = byTrack ? (byTrack[t.id] ?? []) : null;
    // Прогресс родителя — вместе с подтреками; список задач — только свои.
    const progress = byTrack ? trackProgress(tasksWithSubtracks(props.module, byTrack, t.id)) : null;
    const parent = t.partOf ? trackById(t.partOf) : undefined;
    const subtracks = subtracksOf(props.module, t.id).map((s) => ({ s, progress: byTrack ? trackProgress(byTrack[s.id] ?? []) : null }));
    return { kind: 'track' as const, t, related: [...t.related, ...incoming], tasks, progress, parent, subtracks };
  }
  const found = subtaskByNodeId(props.module, props.id);
  if (!found) return null;
  return { kind: 'subtask' as const, t: found.track, title: found.title, children: found.children, parent: found.parent };
});
</script>

<template>
  <section v-if="view" class="node-card" aria-live="polite">
    <button type="button" class="close" aria-label="Закрыть карточку" @click="emit('close')">×</button>

    <template v-if="view.kind === 'person'">
      <p class="eyebrow"><span class="dot" :style="{ background: `var(--mg-area-${view.p.area})` }" />{{ view.p.role }}</p>
      <h3>{{ view.p.name }} <small>@{{ view.p.login }}</small></h3>
      <h4 v-if="view.doing.length">Делает · {{ view.doing.length }}</h4>
      <ul>
        <li v-for="t in view.doing" :key="t.id">
          <button type="button" class="go" @click="emit('select', `track:${t.id}`)">{{ t.label }}</button>
          <span class="side">{{ sideOf(t, view.p.login) }}</span>
        </li>
      </ul>
      <h4 v-if="view.mentoring.length">Ментор · {{ view.mentoring.length }}</h4>
      <ul>
        <li v-for="t in view.mentoring" :key="t.id">
          <button type="button" class="go" @click="emit('select', `track:${t.id}`)">{{ t.label }}</button>
        </li>
      </ul>
      <h4 v-if="view.mates.length">Работает вместе с</h4>
      <ul>
        <li v-for="[login, tracks] in view.mates" :key="login">
          <button type="button" class="go" @click="emit('select', `person:${login}`)">{{ person(login)?.name ?? login }}</button>
          <span class="why">{{ tracks.join(', ') }}</span>
        </li>
      </ul>
      <template v-if="view.open">
        <h4>Открытые задачи · {{ view.open.length }}</h4>
        <TaskList v-if="view.open.length" :tasks="view.open" :people="people" />
      </template>
    </template>

    <template v-else-if="view.kind === 'track'">
      <p class="eyebrow"><span class="dot" :style="{ background: `var(--mg-area-${view.t.area})` }" />Трек · {{ areaLabel(config, view.t.area) }}</p>
      <h3>{{ view.t.title }}</h3>
      <h4>Делают</h4>
      <ul>
        <li v-for="d in doersOf(module, view.t)" :key="d.login">
          <button type="button" class="go" @click="emit('select', `person:${d.login}`)">{{ person(d.login)?.name ?? d.login }}</button>
          <span class="side">{{ sideLabel(config, d.side) }}</span>
        </li>
      </ul>
      <h4 v-if="view.t.mentors.length">Менторы</h4>
      <ul>
        <li v-for="login in view.t.mentors" :key="login">
          <button type="button" class="go" @click="emit('select', `person:${login}`)">{{ person(login)?.name ?? login }}</button>
        </li>
      </ul>
      <template v-if="view.parent">
        <h4>Входит в трек</h4>
        <ul>
          <li><button type="button" class="go" @click="emit('select', `track:${view.parent.id}`)">{{ view.parent.label }}</button></li>
        </ul>
      </template>
      <h4 v-if="view.subtracks.length">Подтреки · {{ view.subtracks.length }}</h4>
      <ul>
        <li v-for="{ s, progress } in view.subtracks" :key="s.id">
          <button type="button" class="go" @click="emit('select', `track:${s.id}`)">{{ s.label }}</button>
          <span v-if="progress" class="side">{{ progress.done }} из {{ progress.total }} готово</span>
        </li>
      </ul>
      <h4 v-if="view.t.subtasks.length">Подзадачи · {{ view.t.subtasks.length }}</h4>
      <ul>
        <template v-for="(s, i) in view.t.subtasks" :key="i">
          <li>
            <button type="button" class="go" @click="emit('select', `subtask:${view.t.id}/${i}`)">{{ s.title }}</button>
          </li>
          <li v-for="(title, j) in s.subtasks" :key="`${i}/${j}`" class="nested">
            <button type="button" class="go" @click="emit('select', `subtask:${view.t.id}/${i}/${j}`)">{{ title }}</button>
          </li>
        </template>
      </ul>
      <h4 v-if="view.related.length">Связи</h4>
      <ul>
        <li v-for="r in view.related" :key="r.track">
          <button type="button" class="go" @click="emit('select', `track:${r.track}`)">{{ trackById(r.track)?.label ?? r.track }}</button>
          <span class="why">{{ r.why }}</span>
        </li>
      </ul>
      <template v-if="view.tasks && view.progress">
        <h4>Задачи · {{ view.progress.done }} из {{ view.progress.total }} готово</h4>
        <TaskList v-if="view.tasks.length" :tasks="view.tasks" :people="people" />
        <p v-else class="none">{{ noTasksNote(view.progress.total, config.board?.field ?? 'Трек') }}</p>
      </template>
      <a class="page" :href="withBase(view.t.url)">Открыть страницу трека</a>
    </template>

    <template v-else>
      <p class="eyebrow"><span class="dot" :style="{ background: `var(--mg-area-${view.t.area})` }" />Подзадача</p>
      <h3>{{ view.title }}</h3>
      <template v-if="view.parent">
        <h4>Входит в подзадачу</h4>
        <ul>
          <li>
            <button type="button" class="go" @click="emit('select', `subtask:${view.t.id}/${view.parent.index}`)">{{ view.parent.title }}</button>
          </li>
        </ul>
      </template>
      <template v-if="view.children.length">
        <h4>Подзадачи · {{ view.children.length }}</h4>
        <ul>
          <li v-for="(title, j) in view.children" :key="j">
            <button type="button" class="go" @click="emit('select', `${id}/${j}`)">{{ title }}</button>
          </li>
        </ul>
      </template>
      <h4>Входит в трек</h4>
      <ul>
        <li><button type="button" class="go" @click="emit('select', `track:${view.t.id}`)">{{ view.t.label }}</button></li>
      </ul>
      <h4>Кто</h4>
      <ul>
        <li v-for="login in [...doersOf(module, view.t).map((d) => d.login), ...view.t.mentors]" :key="login">
          <button type="button" class="go" @click="emit('select', `person:${login}`)">{{ person(login)?.name ?? login }}</button>
          <span class="side">{{ sideOf(view.t, login) }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.node-card {
  position: absolute;
  top: 12px;
  right: 12px;
  width: min(320px, calc(100% - 24px));
  max-height: calc(100% - 64px);
  overflow-y: auto;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
  font-size: 14px;
}
.close {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 18px;
  color: var(--vp-c-text-2);
}
.close:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 28px 6px 0;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
h3 {
  margin: 0 20px 10px 0;
  font-size: 16px;
  line-height: 1.35;
}
h3 small {
  font-weight: 400;
  color: var(--vp-c-text-2);
}
h4 {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 1px 0;
}
li.nested {
  padding-left: 16px;
}
.go {
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--vp-c-divider);
  text-underline-offset: 3px;
}
.go:hover {
  text-decoration-color: var(--vp-c-brand-1);
}
.side,
.why {
  margin-left: auto;
  font-size: 12px;
  color: var(--vp-c-text-2);
  text-align: right;
}
.none {
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.page {
  display: inline-block;
  margin-top: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
