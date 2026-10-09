// Читает папку модулей с диска: настройки, люди, модули с треками и снимок доски. Спека §3.2, §4.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { load, YAMLException } from "js-yaml";
import {
	assignTasks,
	type BoardData,
	checkModuleId,
	type Context,
	type Module,
	ModuleDataError,
	type ModuleGraphConfig,
	type ModuleGraphData,
	parseConfig,
	parseModule,
	parsePeople,
	parseSnapshot,
	parseTrack,
	SnapshotError,
	trackPages,
} from "../index.ts";

/** Ошибка разбора YAML → `ModuleDataError` со строкой файла; `offset` — сколько строк файла лежит выше YAML (`---` во frontmatter). */
function yamlError(file: string, error: unknown, text: string, offset: number): never {
	if (!(error instanceof YAMLException)) throw error;
	// Ошибка «поток кончился» указывает на строку после последней: берём последнюю непустую.
	const last = text.trimEnd().split("\n").length - 1;
	const line = Math.min(error.mark?.line ?? 0, last) + offset;
	throw new ModuleDataError(file, `строка ${line}`, `сломан YAML: ${error.reason}`);
}

function parseYaml(text: string, file: string, offset: number): unknown {
	// Пустой файл или одни комментарии: js-yaml 5 ругается «expected a document», а смысл один — «ничего не задано».
	if (text.split(/\r?\n/).every((line) => /^\s*(#.*)?$/.test(line))) return null;
	try {
		return load(text);
	} catch (error) {
		return yamlError(file, error, text, offset);
	}
}

/** Читает YAML-файл; нет файла — `undefined`. */
function readYaml(path: string, file: string): unknown {
	if (!existsSync(path)) return undefined;
	return parseYaml(readFileSync(path, "utf8"), file, 1);
}

function readPage(path: string, file: string): matter.GrayMatterFile<string> {
	return matter(readFileSync(path, "utf8"), { engines: { yaml: (text: string) => parseYaml(text.replace(/^\r?\n/, ""), file, 2) as object } });
}

/** md-файлы каталога подстраниц трека по алфавиту: имя без `.md` и `title` из frontmatter; нет каталога — []. */
function readSubpages(dir: string, prefix: string): { name: string; title: unknown }[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map((name) => ({ name: name.slice(0, -".md".length), title: readPage(join(dir, name), `${prefix}/${name}`).data.title }));
}

function readConfig(dir: string, prefix: string): ModuleGraphConfig {
	const file = `${prefix}/module-graph.yaml`;
	return parseConfig(file, readYaml(join(dir, "module-graph.yaml"), file));
}

function readPeople(dir: string, prefix: string, config: ModuleGraphConfig) {
	const file = `${prefix}/people.yaml`;
	const data = readYaml(join(dir, "people.yaml"), file);
	if (data === undefined) throw new ModuleDataError(file, "файл", "нет файла");
	return parsePeople(file, data, config);
}

function readModuleList(dir: string, ctx: Context): Module[] {
	const { prefix } = ctx;
	const ids = readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	const modules = ids.map((id) => {
		checkModuleId(id, prefix);
		const index = join(dir, id, "index.md");
		if (!existsSync(index)) throw new ModuleDataError(`${prefix}/${id}`, "index.md", "нет файла страницы модуля");
		const tracksDir = join(dir, id, "tracks");
		const entries = existsSync(tracksDir) ? readdirSync(tracksDir, { withFileTypes: true }) : [];
		const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
		// Каталог подстраниц без трека: его первый md-файл — «лишняя» подстраница.
		for (const entry of entries.filter((e) => e.isDirectory())) {
			if (files.includes(`${entry.name}.md`)) continue;
			const found = readSubpages(join(tracksDir, entry.name), `${prefix}/${id}/tracks/${entry.name}`);
			if (found.length > 0) trackPages(`${prefix}/${id}/tracks/${entry.name}.md`, id, entry.name, undefined, found, ctx);
		}
		const tracks = files.map((name) => {
			const trackId = name.slice(0, -".md".length);
			const file = `${prefix}/${id}/tracks/${name}`;
			const page = readPage(join(tracksDir, name), file);
			const found = readSubpages(join(tracksDir, trackId), `${prefix}/${id}/tracks/${trackId}`);
			const pages = trackPages(file, id, trackId, (page.data as { pages?: unknown }).pages, found, ctx);
			return parseTrack(file, id, trackId, page.data, page.content, ctx, pages);
		});
		const indexFile = `${prefix}/${id}/index.md`;
		return parseModule(indexFile, id, readPage(index, indexFile).data, tracks, ctx);
	});
	return modules.sort((a, b) => Number(b.id) - Number(a.id));
}

/** Снимок доски; нет файла — `null`, сломанный снимок — предупреждение и `null`: сборку он не роняет (спека §4.5). */
export function readBoard(path: string, modules: readonly Module[]): BoardData | null {
	if (!existsSync(path)) return null;
	try {
		const snapshot = parseSnapshot(JSON.parse(readFileSync(path, "utf8")));
		return { takenAt: snapshot.takenAt, byModule: assignTasks(modules, snapshot) };
	} catch (error) {
		if (!(error instanceof SnapshotError) && !(error instanceof SyntaxError)) throw error;
		const message = (error as Error).message;
		console.warn(`${error instanceof SnapshotError ? message : `board.json: ${message}`} — задачи не показаны`);
		return null;
	}
}

/** Всё из папки модулей; ошибки — с путями от её родителя (`modules/…`). */
export function loadModuleDir(dir: string): ModuleGraphData {
	const prefix = basename(dir);
	const config = readConfig(dir, prefix);
	const people = readPeople(dir, prefix, config);
	const modules = readModuleList(dir, { config, people, prefix });
	return { config, people, modules, board: readBoard(join(dir, "board.json"), modules) };
}

/** Модули из папки, от новых к старым. */
export function readModules(dir: string): Module[] {
	return loadModuleDir(dir).modules;
}
