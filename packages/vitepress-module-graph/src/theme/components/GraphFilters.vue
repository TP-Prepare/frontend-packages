<script setup lang="ts">
// Панель фильтров графа: люди с нагрузкой, направления, слои, поиск.
import { computed } from 'vue';
import { areaLabel, defaultFilter, type Filter, type Layer, type Load, type Person } from '../../index';
import { useModuleGraph } from '../data';

const props = defineProps<{ filter: Filter; people: readonly Person[]; load: Load[]; query: string }>();
const emit = defineEmits<{ 'update:filter': [filter: Filter]; 'update:query': [query: string] }>();

const { config } = useModuleGraph();
const areas = config.areas.map((a) => a.key);
const LAYER_LABELS: Record<Layer, string> = { subtasks: 'Подзадачи', mentors: 'Менторы', related: 'Связи между треками' };
const max = computed(() => Math.max(1, ...props.load.map((l) => l.doing + l.mentoring)));
const loadOf = (login: string) => props.load.find((l) => l.login === login) ?? { login, doing: 0, mentoring: 0 };
const plural = (n: number, forms: [string, string, string]) => {
  const a = n % 10;
  const b = n % 100;
  return forms[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 1 : 2];
};
const loadText = (login: string) => {
  const { doing, mentoring } = loadOf(login);
  const parts = [doing ? `${doing} ${plural(doing, ['трек', 'трека', 'треков'])}` : '', mentoring ? `ментор в ${mentoring}` : ''];
  return parts.filter(Boolean).join(' · ');
};
const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
const update = (patch: Partial<Filter>) => emit('update:filter', { ...props.filter, ...patch });
const isDefault = computed(
  () => props.filter.people.length === 0 && props.filter.areas.length === areas.length && props.filter.hide.length === 0 && !props.query,
);
function reset(): void {
  emit('update:filter', defaultFilter(config));
  emit('update:query', '');
}
</script>

<template>
  <div class="graph-filters">
    <section>
      <h3>Люди и нагрузка</h3>
      <button
        v-for="p in people"
        :key="p.login"
        type="button"
        class="person"
        :aria-pressed="filter.people.includes(p.login)"
        @click="update({ people: toggle(filter.people, p.login) })"
      >
        <span class="dot" :class="{ mentor: p.mentor }" :style="{ background: `var(--mg-area-${p.area})` }" />
        <span class="name">{{ p.name }} <small>{{ p.role }}</small></span>
        <span class="count">{{ loadText(p.login) }}</span>
        <span class="bar">
          <i :style="{ width: `${(loadOf(p.login).doing / max) * 100}%`, background: `var(--mg-area-${p.area})` }" />
          <i class="mentor" :style="{ width: `${(loadOf(p.login).mentoring / max) * 100}%`, background: `var(--mg-area-${p.area})` }" />
        </span>
      </button>
    </section>
    <section>
      <h3>Направление трека</h3>
      <div class="chips">
        <button
          v-for="area in areas"
          :key="area"
          type="button"
          class="chip"
          :aria-pressed="filter.areas.includes(area)"
          @click="update({ areas: toggle(filter.areas, area) })"
        >
          <span class="dot" :style="{ background: `var(--mg-area-${area})` }" />{{ areaLabel(config, area) }}
        </button>
      </div>
    </section>
    <section>
      <h3>Показывать</h3>
      <label v-for="(label, layer) in LAYER_LABELS" :key="layer" class="toggle">
        <input
          :id="`graph-layer-${layer}`"
          type="checkbox"
          :checked="!filter.hide.includes(layer)"
          @change="update({ hide: toggle(filter.hide, layer) })"
        />
        {{ label }}
      </label>
    </section>
    <section>
      <h3><label for="graph-search">Поиск</label></h3>
      <input
        id="graph-search"
        class="search"
        type="search"
        placeholder="Например, Coolify или 2FA"
        autocomplete="off"
        :value="query"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </section>
    <button v-if="!isDefault" type="button" class="reset" @click="reset">Сбросить фильтры</button>
  </div>
</template>

<style scoped>
.graph-filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 14px;
}
h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.person {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  text-align: left;
}
.person:hover,
.person[aria-pressed='true'] {
  background: var(--vp-c-bg-soft);
}
.person[aria-pressed='true'] {
  border-color: var(--vp-c-brand-1);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.dot.mentor {
  box-shadow: 0 0 0 2px var(--vp-c-bg), 0 0 0 3.5px var(--vp-c-text-1);
}
.name {
  font-weight: 500;
}
.name small {
  display: block;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  color: var(--vp-c-text-2);
}
.count {
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
.bar {
  grid-column: 2 / 4;
  display: flex;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--vp-c-divider);
}
.bar i.mentor {
  opacity: 0.45;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 13px;
}
.chip .dot {
  width: 8px;
  height: 8px;
}
.chip[aria-pressed='false'] {
  opacity: 0.5;
}
.chip[aria-pressed='false'] .dot {
  background: transparent !important;
  box-shadow: inset 0 0 0 1.5px var(--vp-c-text-2);
}
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  cursor: pointer;
}
.toggle input {
  accent-color: var(--vp-c-brand-1);
}
.search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}
.reset {
  align-self: flex-start;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
