// Тема VitePress: глобальные <ModuleGraph/> и <ModuleList/>, шапка трека для слота doc-before.
// Файлы .vue лежат рядом в dist/theme и компилируются Vite сайта.
import { type App, h, type VNode } from "vue";
import type { ModuleGraphData } from "../index.ts";
import ModuleGraph from "./components/ModuleGraph.vue";
import ModuleList from "./components/ModuleList.vue";
import TrackMeta from "./components/TrackMeta.vue";
import { MODULE_GRAPH_KEY } from "./data.ts";

export { useModuleGraph } from "./data.ts";

/** В `enhanceApp`: данные загрузчика — компонентам, `<ModuleGraph/>` и `<ModuleList/>` — страницам. */
export function installModuleGraph(app: App, data: ModuleGraphData): void {
	app.provide(MODULE_GRAPH_KEY, data);
	app.component("ModuleGraph", ModuleGraph);
	app.component("ModuleList", ModuleList);
}

/** Шапка трека для слота `doc-before`; на странице не трека ничего не рисует. */
export const trackHeader = (): VNode => h(TrackMeta);
