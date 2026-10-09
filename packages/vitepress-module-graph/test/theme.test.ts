import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "vue";
import { areaCss, DEFAULT_CONFIG, type ModuleGraphData } from "../src/index.ts";
import { MODULE_GRAPH_KEY, useModuleGraph } from "../src/theme/data.ts";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const built = existsSync(join(dist, "index.mjs"));
const COMPONENTS = ["ModuleGraph", "GraphCanvas", "GraphFilters", "NodeCard", "TrackMeta", "TrackList", "TaskList", "ModuleList"];

const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const vueFiles = () => files(join(dist, "theme")).filter((f) => f.endsWith(".vue"));

test.skipIf(!built)("dist/theme: восемь компонентов и AreaStyle.vue скопированы как есть", () => {
	for (const name of COMPONENTS) expect(existsSync(join(dist, "theme/components", `${name}.vue`))).toBe(true);
	expect(existsSync(join(dist, "theme/AreaStyle.vue"))).toBe(true);
	expect(vueFiles()).toHaveLength(COMPONENTS.length + 1);
	const index = readFileSync(join(dist, "theme/index.mjs"), "utf8");
	expect(index).toContain("./components/ModuleGraph.vue");
	expect(index).toContain("./components/TrackMeta.vue");
});

test.skipIf(!built)("dist/theme/style.css — переменные цветов из DEFAULT_CONFIG", () => {
	expect(readFileSync(join(dist, "theme/style.css"), "utf8")).toBe(areaCss(DEFAULT_CONFIG));
});

test.skipIf(!built)("dist: данные — через provide/inject, без modules.data, адресов и --cdd-area-", () => {
	for (const file of files(dist)) expect(readFileSync(file, "utf8")).not.toContain("modules.data");
	for (const file of vueFiles()) {
		const text = readFileSync(file, "utf8");
		expect(text).not.toContain("--cdd-area-");
		expect(text).not.toContain("/modules/");
	}
	expect(readFileSync(join(dist, "theme/AreaStyle.vue"), "utf8")).toContain("areaCss(");
});

test("useModuleGraph: данные из installModuleGraph", () => {
	const data: ModuleGraphData = { config: DEFAULT_CONFIG, people: [], modules: [], board: null };
	const app = createApp({});
	app.provide(MODULE_GRAPH_KEY, data);
	expect(app.runWithContext(() => useModuleGraph())).toBe(data);
});

test("useModuleGraph без installModuleGraph — понятная ошибка", () => {
	const app = createApp({});
	expect(() => app.runWithContext(() => useModuleGraph())).toThrow(
		"module-graph: вызовите installModuleGraph(app, data) в enhanceApp",
	);
});
