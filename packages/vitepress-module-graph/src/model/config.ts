import { ModuleDataError } from "./errors.ts";

export type AreaConfig = { key: string; label: string; color: string; dark: string; needs: string[] };
export type SideConfig = { key: string; label: string };
export type BoardConfig = { owner: string; project: number; field: string };
export type ModuleGraphConfig = {
	route: string;
	areas: AreaConfig[];
	sides: SideConfig[];
	sprint: string;
	board: BoardConfig | null;
};

export const DEFAULT_CONFIG: ModuleGraphConfig = {
	route: "/modules/",
	areas: [
		{ key: "front", label: "Фронт", color: "#2c6bd4", dark: "#5f95f1", needs: [] },
		{ key: "back", label: "Бэк", color: "#13886b", dark: "#3fbc9c", needs: [] },
		{ key: "devops", label: "DevOps", color: "#b07710", dark: "#e1a740", needs: [] },
		{ key: "fullstack", label: "Фронт + бэк", color: "#c9445a", dark: "#e47584", needs: ["front", "back"] },
		{ key: "team", label: "Инструменты команды", color: "#6b7c1c", dark: "#a9ba5c", needs: [] },
	],
	sides: [
		{ key: "front", label: "фронт" },
		{ key: "back", label: "бэк" },
		{ key: "devops", label: "devops" },
		{ key: "team", label: "команда" },
	],
	sprint: "Sprint {n}",
	board: null,
};

const KEY_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_PROBLEM = "ключ: строчная латиница, цифры и дефис, первая — буква";

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function checkKeys(file: string, path: string, obj: Record<string, unknown>, allowed: readonly string[]): void {
	for (const k of Object.keys(obj)) {
		if (!allowed.includes(k)) {
			throw new ModuleDataError(file, path ? `${path}.${k}` : k, `неизвестный ключ; допустимо: ${allowed.join(", ")}`);
		}
	}
}

function parseAreas(file: string, raw: unknown): AreaConfig[] {
	if (!isRecord(raw)) throw new ModuleDataError(file, "areas", "нужен словарь направлений");
	const keys = Object.keys(raw);
	if (keys.length === 0) throw new ModuleDataError(file, "areas", "нужно хотя бы одно направление");
	return keys.map((key) => {
		const path = `areas.${key}`;
		if (!KEY_RE.test(key)) throw new ModuleDataError(file, path, KEY_PROBLEM);
		const a = raw[key];
		if (!isRecord(a)) throw new ModuleDataError(file, path, "нужен словарь с label, color, dark");
		checkKeys(file, path, a, ["label", "color", "dark", "needs"]);
		if (!nonEmpty(a.label)) throw new ModuleDataError(file, `${path}.label`, "нужна непустая строка");
		for (const f of ["color", "dark"] as const) {
			const v = a[f];
			if (typeof v !== "string" || !COLOR_RE.test(v)) throw new ModuleDataError(file, `${path}.${f}`, "нужен цвет #rrggbb");
		}
		let needs: string[] = [];
		if (a.needs !== undefined) {
			if (!Array.isArray(a.needs) || !a.needs.every(nonEmpty)) {
				throw new ModuleDataError(file, `${path}.needs`, "нужен список сторон");
			}
			needs = a.needs as string[];
		}
		return { key, label: a.label, color: a.color as string, dark: a.dark as string, needs };
	});
}

function parseSides(file: string, raw: unknown): SideConfig[] {
	if (!isRecord(raw)) throw new ModuleDataError(file, "sides", "нужен словарь сторон");
	const keys = Object.keys(raw);
	if (keys.length === 0) throw new ModuleDataError(file, "sides", "нужна хотя бы одна сторона");
	return keys.map((key) => {
		const path = `sides.${key}`;
		if (!KEY_RE.test(key)) throw new ModuleDataError(file, path, KEY_PROBLEM);
		const label = raw[key];
		if (!nonEmpty(label)) throw new ModuleDataError(file, path, "нужна непустая строка");
		return { key, label };
	});
}

function parseBoard(file: string, raw: unknown): BoardConfig {
	if (!isRecord(raw)) throw new ModuleDataError(file, "board", "нужен словарь owner, project, field");
	checkKeys(file, "board", raw, ["owner", "project", "field"]);
	if (!nonEmpty(raw.owner)) throw new ModuleDataError(file, "board.owner", "нужна непустая строка");
	if (typeof raw.project !== "number" || !Number.isInteger(raw.project) || raw.project < 1) {
		throw new ModuleDataError(file, "board.project", "нужно целое число от 1");
	}
	if (!nonEmpty(raw.field)) throw new ModuleDataError(file, "board.field", "нужна непустая строка");
	return { owner: raw.owner, project: raw.project, field: raw.field };
}

/** Разбирает уже прочитанный YAML `module-graph.yaml`; `undefined` и пустой файл (`null`) — значения по умолчанию. */
export function parseConfig(file: string, data: unknown): ModuleGraphConfig {
	if (data === undefined || data === null) return DEFAULT_CONFIG;
	if (!isRecord(data)) throw new ModuleDataError(file, "файл", "нужен словарь настроек");
	checkKeys(file, "", data, ["route", "areas", "sides", "sprint", "board"]);

	let route = DEFAULT_CONFIG.route;
	if (data.route !== undefined) {
		if (typeof data.route !== "string" || !/^\/(?:.*\/)?$/.test(data.route)) {
			throw new ModuleDataError(file, "route", "нужен путь с / в начале и в конце");
		}
		route = data.route;
	}
	let sprint = DEFAULT_CONFIG.sprint;
	if (data.sprint !== undefined) {
		if (typeof data.sprint !== "string" || data.sprint.split("{n}").length !== 2) {
			throw new ModuleDataError(file, "sprint", "нужен шаблон с одним {n}");
		}
		sprint = data.sprint;
	}
	const areas = data.areas === undefined ? DEFAULT_CONFIG.areas : parseAreas(file, data.areas);
	const sides = data.sides === undefined ? DEFAULT_CONFIG.sides : parseSides(file, data.sides);
	const sideKeys = sides.map((s) => s.key);
	for (const a of areas) {
		for (const need of a.needs) {
			if (!sideKeys.includes(need)) {
				throw new ModuleDataError(file, `areas.${a.key}.needs`, `нет стороны ${need}; допустимо: ${sideKeys.join(", ")}`);
			}
		}
	}
	const board = data.board === undefined ? null : parseBoard(file, data.board);
	return { route, areas, sides, sprint, board };
}

export function areaLabel(config: ModuleGraphConfig, key: string): string {
	return config.areas.find((a) => a.key === key)?.label ?? key;
}

export function sideLabel(config: ModuleGraphConfig, key: string): string {
	return config.sides.find((s) => s.key === key)?.label ?? key;
}

/** CSS-переменные цветов направлений: светлая тема в `:root`, тёмная в `html.dark`. Одной строкой. */
export function areaCss(config: ModuleGraphConfig): string {
	const light = config.areas.map((a) => `--mg-area-${a.key}:${a.color};`).join("");
	const dark = config.areas.map((a) => `--mg-area-${a.key}:${a.dark};`).join("");
	return `:where(:root){${light}}:where(html.dark){${dark}}`;
}
