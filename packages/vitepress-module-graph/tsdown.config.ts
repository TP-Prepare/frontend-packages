import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsdown";
import { areaCss, DEFAULT_CONFIG } from "./src/index.ts";

export default defineConfig({
	entry: ["src/**/*.ts", "!src/**/*.d.ts"],
	unbundle: true,
	format: ["esm"],
	dts: true,
	clean: true,
	// .vue не компилируем: импорт остаётся как есть, файлы копируются в dist/theme, их собирает Vite сайта.
	deps: { neverBundle: [/\.vue$/] },
	copy: [{ from: "src/theme/**/*.vue", to: "dist", flatten: false }],
	// Цвета направлений по умолчанию для `…/style.css`; после clean и сборки.
	hooks: {
		"build:done": () => {
			mkdirSync("dist/theme", { recursive: true });
			writeFileSync("dist/theme/style.css", areaCss(DEFAULT_CONFIG));
		},
	},
});
