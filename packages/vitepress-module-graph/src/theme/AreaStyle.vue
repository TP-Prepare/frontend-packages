<script setup lang="ts">
// Переменные цветов направлений из module-graph.yaml: <style> в корне графа, архива и шапки трека.
// Нулевая специфичность (:where) — сайт переопределяет их обычным :root { … }.
import { areaCss } from '../index';
import { useModuleGraph } from './data';

const { config } = useModuleGraph();
</script>

<template>
  <component :is="'style'">{{ areaCss(config) }}</component>
</template>
