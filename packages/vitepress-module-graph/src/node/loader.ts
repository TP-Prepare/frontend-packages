import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModuleGraphData } from "../index.ts";
import { loadModuleDir } from "./read.ts";

/** Загрузчик данных VitePress: `export default createModulesLoader(import.meta.url)` в `*.data.ts` рядом с модулями. */
export function createModulesLoader(url: string): { watch: string[]; load(): ModuleGraphData } {
	return {
		watch: ["./people.yaml", "./module-graph.yaml", "./board.json", "./*/index.md", "./*/tracks/**/*.md"],
		load: () => loadModuleDir(dirname(fileURLToPath(url))),
	};
}
