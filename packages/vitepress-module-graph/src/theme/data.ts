// Данные графа для компонентов темы: VitePress подставляет `*.data.ts` только в файлы сайта,
// поэтому сайт передаёт их через installModuleGraph, а компоненты берут из inject.
import { type InjectionKey, inject } from "vue";
import type { ModuleGraphData } from "../index.ts";

// Symbol.for — общий для всех копий модуля: в dev Vite заранее собирает `…/theme` со своей копией этого
// файла, а .vue импортируют его из dist; с обычным Symbol у provide и inject были бы разные ключи.
export const MODULE_GRAPH_KEY: InjectionKey<ModuleGraphData> = Symbol.for("@tp-prepare/vitepress-module-graph");

/** Данные из installModuleGraph(app, data); без него — ошибка с подсказкой. */
export function useModuleGraph(): ModuleGraphData {
	const data = inject(MODULE_GRAPH_KEY, null);
	if (!data) throw new Error("module-graph: вызовите installModuleGraph(app, data) в enhanceApp");
	return data;
}
