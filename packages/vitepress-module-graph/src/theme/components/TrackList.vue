<script setup lang="ts">
// Треки модуля текстом по направлениям: рендерится при сборке, работает без JS, видна check-site.
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { areaLabel, doersOf, type Module, sideLabel, subtracksOf, topTracks, type Track } from '../../index';
import { useModuleGraph } from '../data';

const props = defineProps<{ module: Module }>();
const data = useModuleGraph();
const name = (login: string) => data.people.find((p) => p.login === login)?.name ?? login;
const who = (t: Track) =>
  doersOf(props.module, t).map((d) => `${name(d.login)} (${sideLabel(data.config, d.side)})`).join(', ') + (t.mentors.length ? `; менторы: ${t.mentors.map(name).join(', ')}` : '');
const groups = computed(() =>
  data.config.areas.map(({ key: area }) => ({ area, tracks: topTracks(props.module).filter((t) => t.area === area) })).filter((g) => g.tracks.length > 0),
);
</script>

<template>
  <section class="track-list">
    <h2 id="треки">Треки</h2>
    <template v-for="group in groups" :key="group.area">
      <h3 :id="`треки-${group.area}`">
        <span class="area-dot" :style="{ background: `var(--mg-area-${group.area})` }" />{{ areaLabel(data.config, group.area) }}
      </h3>
      <ul>
        <li v-for="track in group.tracks" :key="track.id">
          <a :href="withBase(track.url)">{{ track.title }}</a> — {{ who(track) }}
          <ul v-if="subtracksOf(module, track.id).length">
            <li v-for="sub in subtracksOf(module, track.id)" :key="sub.id">
              <a :href="withBase(sub.url)">{{ sub.title }}</a> — {{ who(sub) }}
            </li>
          </ul>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.area-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: 1px;
}
</style>
