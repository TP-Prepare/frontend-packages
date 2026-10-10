// Модель учебного модуля: треки, проверки данных, граф и фильтры. Чистые функции без файлов и DOM.
import type { Progress } from "./board.ts";
import { areaLabel, type ModuleGraphConfig } from "./config.ts";
import { ModuleDataError } from "./errors.ts";
import type { Person } from "./people.ts";

export type Context = { config: ModuleGraphConfig; people: readonly Person[]; prefix: string };

export type Doer = { login: string; side: string };

/** У направления с `needs` исполнители (с подтреками) должны покрывать все перечисленные стороны. */
function checkNeeds(file: string, area: string, doers: readonly Doer[], ctx: Context): void {
	const needs = ctx.config.areas.find((a) => a.key === area)?.needs ?? [];
	if (needs.length > 0 && !needs.every((side) => doers.some((d) => d.side === side))) {
		throw new ModuleDataError(file, "do", `у трека «${areaLabel(ctx.config, area)}» нужны исполнители со сторон ${needs.join(", ")}`);
	}
}
export type Related = { track: string; why: string };
/** Подзадача трека; вложенные — только строки (спека 2026-10-09-subtracks §4). */
export type Subtask = { title: string; subtasks: string[] };
/** Подстраница трека: `tracks/<track>/<id>.md` (спека 2026-10-08-bff-into-module §5). */
export type TrackPage = { id: string; title: string; url: string };
export type Track = {
	id: string;
	module: string;
	title: string;
	label: string;
	area: string;
	do: Doer[];
	mentors: string[];
	subtasks: Subtask[];
	related: Related[];
	/** Родитель подтрека — `part_of`; вложенность в один уровень. */
	partOf?: string;
	hasBody: boolean;
	pages: TrackPage[];
	url: string;
};
export type Module = { id: string; title: string; period?: string; sprints: string[]; url: string; tracks: Track[] };

const TRACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Шаблон спринта из настроек (`Sprint {n}`) → регулярка. */
const sprintRe = (template: string) => new RegExp(`^${escapeRe(template).replace("\\{n\\}", "\\d+")}$`);
const sprintHint = (template: string) => template.replace("{n}", "N");
const MODULE_ID = /^[1-9]\d*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Каталог модуля — его номер (`2`); иначе ошибка на `<prefix>/<id>`. */
export function checkModuleId(id: string, prefix: string): void {
	if (!MODULE_ID.test(id)) throw new ModuleDataError(`${prefix}/${id}`, "каталог", `${id} — нужен номер модуля: 1, 2, 3…`);
}

function requireTitle(file: string, data: Record<string, unknown>): string {
	if (!nonEmpty(data.title)) throw new ModuleDataError(file, "title", "нужна непустая строка");
	return data.title;
}

function list(file: string, field: string, value: unknown): unknown[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new ModuleDataError(file, field, "нужен список");
	return value;
}

function strings(file: string, field: string, value: unknown): string[] {
	return list(file, field, value).map((item, index) => {
		if (typeof item !== "string") throw new ModuleDataError(file, `${field}[${index}]`, "нужна строка");
		return item;
	});
}

const SUBTASK_KEYS = new Set(["title", "subtasks"]);

/** Подзадачи: строка или `{ title, subtasks }`; вложенные — строки; соседние названия не повторяются. */
function subtasks(file: string, value: unknown): Subtask[] {
	const unique = (titles: string[]) => {
		const seen = new Set<string>();
		for (const title of titles) {
			if (seen.has(title)) throw new ModuleDataError(file, "subtasks", `подзадача «${title}» повторяется`);
			seen.add(title);
		}
	};
	const result = list(file, "subtasks", value).map((item, index): Subtask => {
		const field = `subtasks[${index}]`;
		if (typeof item === "string") return { title: item, subtasks: [] };
		if (!isRecord(item) || Object.keys(item).some((key) => !SUBTASK_KEYS.has(key))) {
			throw new ModuleDataError(file, field, "нужна строка или { title, subtasks }");
		}
		if (!nonEmpty(item.title)) throw new ModuleDataError(file, `${field}.title`, "нужна непустая строка");
		const nested = list(file, `${field}.subtasks`, item.subtasks).map((sub, j) => {
			if (typeof sub !== "string") throw new ModuleDataError(file, `${field}.subtasks[${j}]`, "нужна строка: вложенность — один уровень");
			return sub;
		});
		unique(nested);
		return { title: item.title, subtasks: nested };
	});
	unique(result.map((st) => st.title));
	return result;
}

function checkLogin(file: string, field: string, login: string, people: readonly Person[]): void {
	if (people.some((p) => p.login === login)) return;
	const other = people.find((p) => p.login.toLowerCase() === login.toLowerCase());
	const hint = other ? ` — может быть, ${other.login}?` : "";
	throw new ModuleDataError(file, field, `логина ${login} нет в people.yaml${hint}`);
}

/** Frontmatter трека → `Track`; проверки спеки §4.4 п. 1–4, 6. */
export function parseTrack(
	file: string,
	moduleId: string,
	id: string,
	data: unknown,
	body: string,
	ctx: Context,
	pages: readonly TrackPage[] = [],
): Track {
	if (!TRACK_ID.test(id)) throw new ModuleDataError(file, "id", `имя файла ${id}.md: только строчная латиница, цифры и дефис`);
	const fm = isRecord(data) ? data : {};
	const title = requireTitle(file, fm);
	const area = fm.area;
	const { people } = ctx;
	const areaKeys = ctx.config.areas.map((a) => a.key);
	const sideKeys = ctx.config.sides.map((x) => x.key);
	if (typeof area !== "string" || !areaKeys.includes(area)) {
		throw new ModuleDataError(file, "area", `неизвестное направление ${String(area)}; допустимо: ${areaKeys.join(", ")}`);
	}
	// Без `do` — только у трека с подтреками: проверяет parseModule.
	if (fm.do !== undefined && (!isRecord(fm.do) || Object.keys(fm.do).length === 0)) {
		throw new ModuleDataError(file, "do", "нужен хотя бы один исполнитель: логин → сторона");
	}
	const doers: Doer[] = Object.entries(isRecord(fm.do) ? fm.do : {}).map(([login, side]) => {
		if (typeof side !== "string" || !sideKeys.includes(side)) {
			throw new ModuleDataError(file, `do.${login}`, `неизвестная сторона ${String(side)}; допустимо: ${sideKeys.join(", ")}`);
		}
		checkLogin(file, "do", login, people);
		return { login, side };
	});
	// Спека 2026-10-09-mentors §4: help заменён на mentors.
	if (fm.help !== undefined) throw new ModuleDataError(file, "help", "поле заменено на mentors");
	const mentors = strings(file, "mentors", fm.mentors);
	mentors.forEach((login, index) => {
		checkLogin(file, "mentors", login, people);
		if (!people.some((p) => p.login === login && p.mentor)) {
			throw new ModuleDataError(file, "mentors", `${login} не ментор: в people.yaml нет mentor: true`);
		}
		if (doers.some((d) => d.login === login)) throw new ModuleDataError(file, "mentors", `${login} уже исполнитель`);
		if (mentors.indexOf(login) !== index) throw new ModuleDataError(file, "mentors", `${login} повторяется`);
	});
	if (doers.length > 0) checkNeeds(file, area, doers, ctx);
	const related = list(file, "related", fm.related).map((item, index): Related => {
		const entry = isRecord(item) ? item : {};
		if (!nonEmpty(entry.track)) throw new ModuleDataError(file, `related[${index}].track`, "нужна непустая строка");
		if (!nonEmpty(entry.why)) throw new ModuleDataError(file, `related[${index}].why`, "нужна непустая строка");
		return { track: entry.track, why: entry.why };
	});
	if (fm.part_of !== undefined && !nonEmpty(fm.part_of)) throw new ModuleDataError(file, "part_of", "нужна непустая строка");
	const partOf = nonEmpty(fm.part_of) ? fm.part_of : undefined;
	return {
		id,
		module: moduleId,
		title,
		label: nonEmpty(fm.label) ? fm.label : title,
		area,
		do: doers,
		mentors,
		subtasks: subtasks(file, fm.subtasks),
		related,
		...(partOf ? { partOf } : {}),
		hasBody: body.trim() !== "",
		pages: [...pages],
		url: `${ctx.config.route}${moduleId}/tracks/${id}`,
	};
}

/**
 * Подстраницы трека: `declared` — `pages` из frontmatter трека `file`, `found` — md-файлы каталога
 * `tracks/<trackId>/` (имя без `.md` и `title` из frontmatter). Порядок — как в `pages`.
 */
export function trackPages(
	file: string,
	moduleId: string,
	trackId: string,
	declared: unknown,
	found: readonly { name: string; title: unknown }[],
	ctx: Context,
): TrackPage[] {
	const ids = strings(file, "pages", declared);
	ids.forEach((id, index) => {
		if (!TRACK_ID.test(id)) throw new ModuleDataError(file, `pages[${index}]`, `${id}: только строчная латиница, цифры и дефис`);
	});
	const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
	if (repeated) throw new ModuleDataError(file, "pages", `${repeated} повторяется`);
	const pageFile = (name: string) => `${ctx.prefix}/${moduleId}/tracks/${trackId}/${name}.md`;
	for (const id of ids) {
		if (!found.some((f) => f.name === id)) throw new ModuleDataError(file, "pages", `нет файла ${trackId}/${id}.md`);
	}
	const stray = found.find((f) => !ids.includes(f.name));
	if (stray) throw new ModuleDataError(pageFile(stray.name), "pages", `подстраницы нет в pages трека ${trackId}.md`);
	return ids.map((id) => {
		const title = requireTitle(pageFile(id), { title: found.find((f) => f.name === id)?.title });
		return { id, title, url: `${ctx.config.route}${moduleId}/tracks/${trackId}/${id}` };
	});
}

/** Frontmatter `index.md` модуля и его треки → `Module`; проверки спеки §4.4 п. 5–6. */
export function parseModule(file: string, id: string, data: unknown, tracks: Track[], ctx: Context): Module {
	checkModuleId(id, ctx.prefix);
	const fm = isRecord(data) ? data : {};
	const title = requireTitle(file, fm);
	const ids = new Set(tracks.map((t) => t.id));
	for (const t of tracks) {
		t.related.forEach((r, index) => {
			const trackFile = `${ctx.prefix}/${id}/tracks/${t.id}.md`;
			if (r.track === t.id) throw new ModuleDataError(trackFile, `related[${index}].track`, "трек ссылается сам на себя");
			if (!ids.has(r.track)) throw new ModuleDataError(trackFile, `related[${index}].track`, `трека ${r.track} нет в модуле ${id}`);
		});
	}
	const byId = new Map(tracks.map((t) => [t.id, t]));
	for (const t of tracks) {
		if (t.partOf === undefined) continue;
		const trackFile = `${ctx.prefix}/${id}/tracks/${t.id}.md`;
		if (t.partOf === t.id) throw new ModuleDataError(trackFile, "part_of", "трек ссылается сам на себя");
		const parent = byId.get(t.partOf);
		if (!parent) throw new ModuleDataError(trackFile, "part_of", `трека ${t.partOf} нет в модуле ${id}`);
		if (parent.partOf !== undefined) throw new ModuleDataError(trackFile, "part_of", `${parent.id} сам подтрек: вложенность — один уровень`);
	}
	for (const t of tracks) {
		if (t.do.length > 0) continue;
		const trackFile = `${ctx.prefix}/${id}/tracks/${t.id}.md`;
		const subDoers = tracks.filter((s) => s.partOf === t.id).flatMap((s) => s.do);
		if (subDoers.length === 0) {
			throw new ModuleDataError(trackFile, "do", "нужен хотя бы один исполнитель: логин → сторона, или подтреки через part_of");
		}
		checkNeeds(trackFile, t.area, subDoers, ctx);
	}
	for (const t of tracks) {
		t.related.forEach((r, index) => {
			if (t.partOf !== r.track && byId.get(r.track)?.partOf !== t.id) return;
			throw new ModuleDataError(`${ctx.prefix}/${id}/tracks/${t.id}.md`, `related[${index}].track`, `${r.track} — родитель или подтрек, связь уже есть через part_of`);
		});
	}
	const sprint = sprintRe(ctx.config.sprint);
	const sprints: string[] = [];
	list(file, "sprints", fm.sprints).forEach((item, index) => {
		if (typeof item !== "string" || !sprint.test(item)) {
			throw new ModuleDataError(file, `sprints[${index}]`, `нужен формат ${sprintHint(ctx.config.sprint)}`);
		}
		if (sprints.includes(item)) throw new ModuleDataError(file, "sprints", `${item} повторяется`);
		sprints.push(item);
	});
	const sorted = [...tracks].sort((a, b) => a.title.localeCompare(b.title, "ru"));
	return { id, title, ...(nonEmpty(fm.period) ? { period: fm.period } : {}), sprints, url: `${ctx.config.route}${id}/`, tracks: sorted };
}

export type NodeKind = "person" | "track" | "subtask";
export type GraphNode = {
	id: string;
	kind: NodeKind;
	label: string;
	title: string;
	area: string;
	mentor?: true;
	login?: string;
	trackId?: string;
	progress?: Progress;
};
export type LinkKind = "do" | "mentor" | "part" | "related" | "sub";
export type GraphLink = { source: string; target: string; kind: LinkKind; side?: string; why?: string };
export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

/** Заливка узла: люди — нейтральные, цвет направления — только у треков и подзадач. */
export function nodePaint(node: Pick<GraphNode, "kind" | "area">): { neutral: true } | { neutral: false; area: string; alpha: number } {
	if (node.kind === "person") return { neutral: true };
	return { neutral: false, area: node.area, alpha: node.kind === "subtask" ? 0.75 : 1 };
}

export const LAYERS = ["subtasks", "mentors", "related"] as const;
export type Layer = (typeof LAYERS)[number];
export type Filter = { people: string[]; areas: string[]; hide: Layer[] };
export const defaultFilter = (config: ModuleGraphConfig): Filter => ({ people: [], areas: config.areas.map((a) => a.key), hide: [] });

const personId = (login: string) => `person:${login}`;
const trackId = (id: string) => `track:${id}`;
const subtaskId = (id: string, index: number) => `subtask:${id}/${index}`;

/** Граф модуля под фильтром; правила — план задачи 4 и прототип от 08.10. */
export function buildGraph(
	module: Module,
	people: readonly Person[],
	filter: Filter,
	progress: Readonly<Record<string, Progress>> = {},
): Graph {
	const showMentors = !filter.hide.includes("mentors");
	// Фильтр по людям: трек без `do` виден по людям подтреков; узлы людей — только по своим `do` и `mentors`.
	const participants = (t: Track, doers: readonly Doer[]) => [...doers.map((d) => d.login), ...(showMentors ? t.mentors : [])];
	const tracks = module.tracks.filter(
		(t) =>
			filter.areas.includes(t.area) &&
			(filter.people.length === 0 || participants(t, doersOf(module, t)).some((l) => filter.people.includes(l))),
	);
	const logins = new Set([...filter.people, ...tracks.flatMap((t) => participants(t, t.do))]);
	const nodes: GraphNode[] = people
		.filter((p) => logins.has(p.login))
		.map((p) => ({
			id: personId(p.login),
			kind: "person",
			label: p.name,
			title: p.name,
			area: p.area,
			...(p.mentor ? { mentor: true as const } : {}),
			login: p.login,
		}));
	const links: GraphLink[] = [];
	const showSubtasks = !filter.hide.includes("subtasks");
	for (const t of tracks) {
		const trackProgress = progress[t.id];
		nodes.push({
			id: trackId(t.id),
			kind: "track",
			label: t.label,
			title: t.title,
			area: t.area,
			...(trackProgress && trackProgress.total > 0 ? { progress: trackProgress } : {}),
		});
		for (const d of t.do) links.push({ source: personId(d.login), target: trackId(t.id), kind: "do", side: d.side });
		if (showMentors) for (const login of t.mentors) links.push({ source: personId(login), target: trackId(t.id), kind: "mentor" });
		if (!showSubtasks) continue;
		t.subtasks.forEach((s, i) => {
			nodes.push({ id: subtaskId(t.id, i), kind: "subtask", label: s.title, title: s.title, area: t.area, trackId: t.id });
			links.push({ source: trackId(t.id), target: subtaskId(t.id, i), kind: "part" });
			s.subtasks.forEach((title, j) => {
				const id = `${subtaskId(t.id, i)}/${j}`;
				nodes.push({ id, kind: "subtask", label: title, title, area: t.area, trackId: t.id });
				links.push({ source: subtaskId(t.id, i), target: id, kind: "part" });
			});
		});
	}
	const visible = new Set(tracks.map((t) => t.id));
	for (const t of tracks) {
		if (t.partOf !== undefined && visible.has(t.partOf)) links.push({ source: trackId(t.partOf), target: trackId(t.id), kind: "sub" });
	}
	if (!filter.hide.includes("related")) {
		for (const t of tracks) {
			for (const r of t.related) {
				if (visible.has(r.track)) links.push({ source: trackId(t.id), target: trackId(r.track), kind: "related", why: r.why });
			}
		}
	}
	return { nodes, links };
}

/** Узел и его соседи; у человека — ещё подзадачи его треков. */
export function neighbours(graph: { links: GraphLink[] }, id: string): Set<string> {
	const result = new Set([id]);
	const near = (node: string) =>
		graph.links.flatMap((l) => (l.source === node ? [l.target] : l.target === node ? [l.source] : []));
	for (const n of near(id)) result.add(n);
	if (id.startsWith("person:")) {
		for (const t of [...result].filter((n) => n.startsWith("track:"))) {
			for (const n of near(t)) {
				if (!n.startsWith("subtask:")) continue;
				result.add(n);
				for (const nested of near(n)) if (nested.startsWith("subtask:")) result.add(nested);
			}
		}
	}
	return result;
}

/** Подзадача по id узла `subtask:<трек>/<i>` или `subtask:<трек>/<i>/<j>`; иначе `null`. */
export function subtaskByNodeId(
	module: Module,
	id: string,
): { track: Track; title: string; children: string[]; parent: { index: number; title: string } | null } | null {
	const match = /^subtask:([^/]+)\/(\d+)(?:\/(\d+))?$/.exec(id);
	if (!match) return null;
	const track = module.tracks.find((t) => t.id === match[1]);
	const top = track?.subtasks[Number(match[2])];
	if (!track || !top) return null;
	if (match[3] === undefined) return { track, title: top.title, children: top.subtasks, parent: null };
	const title = top.subtasks[Number(match[3])];
	return title === undefined ? null : { track, title, children: [], parent: { index: Number(match[2]), title: top.title } };
}

export function searchMatches(nodes: readonly GraphNode[], query: string): Set<string> {
	const q = query.trim().toLowerCase();
	if (q === "") return new Set();
	return new Set(nodes.filter((n) => n.title.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)).map((n) => n.id));
}

/** `?people=…&area=…&hide=…` → фильтр; неизвестные логины, направления и слои отбрасываются. */
export function filterFromQuery(search: string, people: readonly Person[], config: ModuleGraphConfig): Filter {
	const params = new URLSearchParams(search);
	const values = (key: string) => (params.get(key) ?? "").split(",").filter((v) => v !== "");
	const known = new Set(people.map((p) => p.login));
	const all = config.areas.map((a) => a.key);
	const areas = values("area").filter((a) => all.includes(a));
	return {
		people: values("people").filter((l) => known.has(l)),
		areas: areas.length > 0 ? areas : all,
		hide: values("hide").filter((l): l is Layer => (LAYERS as readonly string[]).includes(l)),
	};
}

/** Фильтр → query-строка с `?` или `""` для фильтра по умолчанию; запятые не кодируются. */
export function filterToQuery(filter: Filter, config: ModuleGraphConfig): string {
	const parts: string[] = [];
	if (filter.people.length > 0) parts.push(`people=${filter.people.join(",")}`);
	if (filter.areas.length < config.areas.length) parts.push(`area=${filter.areas.join(",")}`);
	if (filter.hide.length > 0) parts.push(`hide=${filter.hide.join(",")}`);
	return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export type Load = { login: string; doing: number; mentoring: number };

export function personLoad(module: Module, people: readonly Person[]): Load[] {
	return people.map((p) => ({
		login: p.login,
		doing: module.tracks.filter((t) => t.do.some((d) => d.login === p.login)).length,
		mentoring: module.tracks.filter((t) => t.mentors.includes(p.login)).length,
	}));
}

/** Страница модуля, трека или подстраницы трека по `page.relativePath`; иначе `null`. */
export function pageRef(relativePath: string, config: ModuleGraphConfig): { module: string; track?: string; page?: string } | null {
	const dir = config.route.replace(/^\/|\/$/g, "");
	const prefix = dir === "" ? "" : `${escapeRe(dir)}/`;
	const match = new RegExp(`^${prefix}([^/]+)/(?:index\\.md|tracks/([^/]+?)(?:/([^/]+))?\\.md)$`).exec(relativePath);
	if (!match?.[1]) return null;
	if (!match[2]) return { module: match[1] };
	return match[3] ? { module: match[1], track: match[2], page: match[3] } : { module: match[1], track: match[2] };
}

/** Пункт меню VitePress (без импорта типов VitePress: файл работает и в браузере). */
export type SidebarItem = { text: string; link?: string; collapsed?: boolean; items?: SidebarItem[] };

/** Треки без родителя — верхний уровень меню и списка треков. */
export function topTracks(module: Module): Track[] {
	return module.tracks.filter((t) => t.partOf === undefined);
}

/** Подтреки трека в порядке `module.tracks`. */
export function subtracksOf(module: Module, id: string): Track[] {
	return module.tracks.filter((t) => t.partOf === id);
}

/** Исполнители трека; у трека без `do` — исполнители его подтреков (в порядке подтреков, без повторов). */
export function doersOf(module: Module, track: Track): Doer[] {
	if (track.do.length > 0) return track.do;
	const result: Doer[] = [];
	for (const d of subtracksOf(module, track.id).flatMap((s) => s.do)) {
		if (!result.some((r) => r.login === d.login && r.side === d.side)) result.push(d);
	}
	return result;
}

/**
 * Меню раздела «Модули»: модули по возрастанию номера, каждый сворачивается; в модуле — граф и треки;
 * в пункте трека — подстраницы, затем подтреки.
 */
export function moduleSidebar(modules: readonly Module[]): SidebarItem[] {
	const item = (m: Module, t: Track): SidebarItem => {
		const items = [...t.pages.map((p): SidebarItem => ({ text: p.title, link: p.url })), ...subtracksOf(m, t.id).map((s) => item(m, s))];
		return items.length > 0 ? { text: t.title, link: t.url, collapsed: false, items } : { text: t.title, link: t.url };
	};
	return [...modules]
		.sort((a, b) => Number(a.id) - Number(b.id))
		.map((m) => ({ text: m.title, collapsed: false, items: [{ text: "Граф", link: m.url }, ...topTracks(m).map((t) => item(m, t))] }));
}
