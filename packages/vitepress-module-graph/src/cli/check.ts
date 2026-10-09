// Команда `check`: та же проверка, что делает сборка сайта, без самой сборки. Спека §5.
import { existsSync } from "node:fs";
import { loadModuleDir } from "../node/index.ts";

// Форма слова по числу: plural(1, ["модуль", "модуля", "модулей"]) → "модуль".
function plural(n: number, forms: readonly [string, string, string]): string {
	const last = n % 10;
	const tens = n % 100;
	if (tens >= 11 && tens <= 14) return forms[2];
	if (last === 1) return forms[0];
	if (last >= 2 && last <= 4) return forms[1];
	return forms[2];
}

/** Читает и проверяет всю папку модулей; бросает `ModuleDataError` с текстом сборки. */
export function checkModules(dir: string): string {
	const { modules } = loadModuleDir(dir);
	const tracks = modules.reduce((sum, m) => sum + m.tracks.length, 0);
	const m = modules.length;
	return `modules ok: ${m} ${plural(m, ["модуль", "модуля", "модулей"])}, ${tracks} ${plural(tracks, ["трек", "трека", "треков"])}`;
}

/**
 * Папка модулей по `tool_input.file_path` из stdin хука: ближайший предок файла, где лежит `people.yaml`
 * (так работает при любом `route`). `null` — stdin не тот, нет пути или такой папки.
 */
export function hookModulesDir(stdin: string, exists: (path: string) => boolean = existsSync): string | null {
	let file: unknown;
	try {
		file = (JSON.parse(stdin) as { tool_input?: { file_path?: unknown } } | null)?.tool_input?.file_path;
	} catch {
		return null;
	}
	if (typeof file !== "string" || file === "") return null;
	const path = file.replaceAll("\\", "/");
	const cut = path.lastIndexOf("/");
	let dir = cut < 0 ? "." : path.slice(0, cut);
	for (;;) {
		if (exists(`${dir}/people.yaml`)) return dir;
		const up = dir.lastIndexOf("/");
		if (dir === "" || dir === "." || up < 0) return null;
		dir = dir.slice(0, up);
	}
}
