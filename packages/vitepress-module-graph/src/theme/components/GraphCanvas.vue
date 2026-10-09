<script setup lang="ts">
// Canvas графа на force-graph: узлы и рёбра из buildGraph, подсветка соседей, подписи, цвета темы.
// Библиотека грузится в браузере: при сборке страницы её нет. Цвета направлений — переменные --mg-area-<ключ>.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import type ForceGraphType from 'force-graph';
import { type GraphLink, type GraphNode, neighbours, nodePaint, type Progress } from '../../index';
import { useModuleGraph } from '../data';

const props = defineProps<{ nodes: GraphNode[]; links: GraphLink[]; selected: string | null; matches: Set<string> }>();
const emit = defineEmits<{ select: [id: string | null]; failed: [] }>();
defineExpose({ fit });

type SimNode = GraphNode & { x?: number; y?: number; lines: string[] };
type SimLink = Omit<GraphLink, 'source' | 'target'> & { source: string | SimNode; target: string | SimNode };
type Colors = { text: string; muted: string; edge: string; accent: string; area: Record<string, string> };

const RADIUS = { person: 7, track: 4.6, subtask: 2.6 } as const;
const DIM = 0.18;
const container = ref<HTMLDivElement>();
const { isDark } = useData();
const { config } = useModuleGraph();
const cache = new Map<string, SimNode>();
let graph: ForceGraphType<SimNode, SimLink> | null = null;
let resize: ResizeObserver | null = null;
let hover: string | null = null;
let focus: Set<string> | null = null;
let needFit = true;
let motion = 500;
let colors: Colors = { text: '#000', muted: '#666', edge: '#999', accent: '#646cff', area: {} };

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2]}…`] : lines;
}

// Цвета темы VitePress бывают и #hex, и rgba(): прозрачность добавляем сами.
function rgba(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const parts = /rgba?\(([^)]+)\)/.exec(color)?.[1]?.split(/[ ,/]+/).filter(Boolean);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha * (parts[3] ? Number(parts[3]) : 1)})`;
}

function readColors(): void {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  colors = {
    text: v('--vp-c-text-1'),
    muted: v('--vp-c-text-2'),
    edge: v('--vp-c-text-3'),
    accent: v('--vp-c-brand-1'),
    area: Object.fromEntries(config.areas.map((a) => [a.key, v(`--mg-area-${a.key}`)])),
  };
}

// Направления проверены загрузчиком; пустая строка — как у getPropertyValue без переменной.
const areaColor = (area: string) => colors.area[area] ?? '';

function updateFocus(): void {
  const id = hover ?? props.selected;
  focus = id && props.nodes.some((n) => n.id === id) ? neighbours({ links: props.links }, id) : null;
}

const idOf = (end: string | SimNode) => (typeof end === 'string' ? end : end.id);
const hot = (l: SimLink) => !!focus && focus.has(idOf(l.source)) && focus.has(idOf(l.target));
const dimmed = (id: string) => (focus ? !focus.has(id) : props.matches.size > 0 && !props.matches.has(id));

function graphData(): { nodes: SimNode[]; links: SimLink[] } {
  const nodes = props.nodes.map((n) => {
    const lines = wrap(n.label, n.kind === 'subtask' ? 22 : 18);
    const cached = cache.get(n.id);
    if (cached) return Object.assign(cached, n, { lines });
    const created: SimNode = { ...n, lines };
    cache.set(n.id, created);
    return created;
  });
  return { nodes, links: props.links.map((l) => ({ ...l })) };
}

// Дуга прогресса трека от 12 часов по часовой: готово — цвет направления, в работе — он же
// полупрозрачный, остальное — цвет рёбер. Прозрачность приглушения уже стоит в ctx.globalAlpha.
function drawProgress(ctx: CanvasRenderingContext2D, { done, active, total }: Progress, color: string, x: number, y: number, r: number): void {
  // закрытая задача со статусом «In progress» считается и готовой, и в работе — готовое главнее
  const busy = Math.min(active, total - done);
  const parts: [number, string][] = [
    [done / total, color],
    [busy / total, rgba(color, 0.4)],
    [(total - done - busy) / total, rgba(colors.edge, 0.35)],
  ];
  let start = -Math.PI / 2;
  ctx.lineWidth = 1.6;
  for (const [share, stroke] of parts) {
    if (share <= 0) continue;
    const end = start + share * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(x, y, r + 2.2, start, end);
    ctx.strokeStyle = stroke;
    ctx.stroke();
    start = end;
  }
}

function drawNode(node: SimNode, ctx: CanvasRenderingContext2D, scale: number): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const r = RADIUS[node.kind];
  const match = props.matches.has(node.id);
  const inFocus = !!focus?.has(node.id);
  const dim = dimmed(node.id);
  ctx.globalAlpha = dim ? DIM : 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  const paint = nodePaint(node);
  ctx.fillStyle = paint.neutral ? colors.muted : rgba(areaColor(paint.area), paint.alpha);
  ctx.fill();
  if (node.progress) drawProgress(ctx, node.progress, areaColor(node.area), x, y, r);
  if (node.mentor) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2.4, 0, 2 * Math.PI);
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  if (node.id === props.selected || match) {
    ctx.beginPath();
    ctx.arc(x, y, r + (node.mentor ? 4.8 : node.progress ? 4.6 : 3), 0, 2 * Math.PI);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Подписи держат читаемый размер на экране; подписи подзадач гаснут при отдалении.
  let alpha = node.kind === 'subtask' && !inFocus && !match ? Math.max(0, Math.min(1, (scale - 1.4) / 0.6)) : 1;
  if (dim) alpha = Math.min(alpha, 0.22);
  if (alpha > 0) {
    const base = node.kind === 'person' ? 5.2 : node.kind === 'track' ? 3.9 : 3.3;
    const px = Math.max(9.5, Math.min(node.kind === 'person' ? 15 : 13, base * scale));
    const size = px / scale;
    const weight = node.kind === 'person' ? 600 : node.kind === 'track' ? 500 : 400;
    ctx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = node.kind === 'person' || inFocus || match ? colors.text : colors.muted;
    const top = y + r + (node.mentor ? 4.5 : node.progress ? 4 : 2.5);
    node.lines.forEach((line, i) => ctx.fillText(line, x, top + i * size * 1.18));
  }
  ctx.globalAlpha = 1;
}

function linkColor(l: SimLink): string {
  if (hot(l)) return colors.accent;
  const base = l.kind === 'related' ? colors.muted : colors.edge;
  return rgba(base, focus || props.matches.size > 0 ? DIM : l.kind === 'part' || l.kind === 'sub' ? 0.55 : 0.9);
}

function fit(): void {
  graph?.zoomToFit(motion, 56);
}

onMounted(async () => {
  motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
  readColors();
  let ForceGraph: typeof ForceGraphType;
  try {
    ForceGraph = (await import('force-graph')).default;
  } catch {
    emit('failed');
    return;
  }
  const el = container.value;
  if (!el) return;
  graph = new ForceGraph<SimNode, SimLink>(el)
    .backgroundColor('rgba(0,0,0,0)')
    .autoPauseRedraw(false)
    .nodeRelSize(1)
    .nodeVal((n) => (RADIUS[n.kind] + 1) ** 2)
    .nodeLabel(() => '')
    .nodeCanvasObject(drawNode)
    .linkColor(linkColor)
    .linkWidth((l) => (hot(l) ? 1.8 : l.kind === 'do' ? 1.1 : 0.8))
    .linkLineDash((l) => (l.kind === 'mentor' ? [4, 3] : l.kind === 'related' ? [1, 3] : null))
    .cooldownTicks(140)
    .onEngineStop(() => {
      if (!needFit) return;
      needFit = false;
      fit();
    })
    .onNodeHover((node) => {
      hover = node?.id ?? null;
      el.style.cursor = node ? 'pointer' : '';
      updateFocus();
    })
    .onNodeClick((node) => emit('select', node.id))
    .onBackgroundClick(() => emit('select', null))
    .width(el.clientWidth)
    .height(el.clientHeight)
    .graphData(graphData());
  (graph.d3Force('charge') as unknown as { strength(v: number): void }).strength(-95);
  (graph.d3Force('link') as unknown as { distance(fn: (l: SimLink) => number): void }).distance((l) =>
    l.kind === 'part' ? 16 : l.kind === 'sub' ? 45 : l.kind === 'related' ? 70 : 40,
  );
  resize = new ResizeObserver(() => graph?.width(el.clientWidth).height(el.clientHeight));
  resize.observe(el);
  updateFocus();
});

watch(
  () => [props.nodes, props.links],
  () => {
    updateFocus();
    if (!graph) return;
    needFit = true;
    graph.graphData(graphData());
  },
);
// Выбранный узел встаёт в центр видимой части: правую часть холста закрывает карточка (до 320 + 12 px).
const CARD_SPACE = 166;
function centerSelected(): void {
  const node = props.selected ? cache.get(props.selected) : undefined;
  const el = container.value;
  if (!graph || !el || node?.x === undefined || node.y === undefined) return;
  const shift = el.clientWidth > 640 ? CARD_SPACE / graph.zoom() : 0;
  graph.centerAt(node.x + shift, node.y, motion);
}

watch(
  () => props.selected,
  () => {
    updateFocus();
    centerSelected();
  },
);
watch(isDark, () => nextTick(readColors));

onBeforeUnmount(() => {
  resize?.disconnect();
  graph?._destructor();
  graph = null;
});
</script>

<template>
  <div ref="container" class="graph-canvas" role="img" aria-label="Граф модуля: люди, треки и подзадачи" />
</template>

<style scoped>
.graph-canvas {
  position: absolute;
  inset: 0;
}
</style>
