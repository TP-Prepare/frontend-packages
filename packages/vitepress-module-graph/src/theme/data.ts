// Данные графа для компонентов темы: VitePress подставляет `*.data.ts` только в файлы сайта,
// поэтому сайт передаёт их через installModuleGraph, а компоненты берут из inject.
import { type InjectionKey, inject } from "vue";
import type { ModuleGraphData } from "../index.ts";

export const MODULE_GRAPH_KEY: InjectionKey<ModuleGraphData> = Symbol("module-graph");

/** Данные из installModuleGraph(app, data); без него — ошибка с подсказкой. */
export function useModuleGraph(): ModuleGraphData {
	const data = inject(MODULE_GRAPH_KEY, null);
	if (!data) throw new Error("module-graph: вызовите installModuleGraph(app, data) в enhanceApp");
	return data;
}
