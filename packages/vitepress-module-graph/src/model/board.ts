// Снимок доски GitHub Projects: типы и разбор формы. Чистые функции без файлов и DOM.
// Спека: docs/superpowers/specs/2026-10-08-module-board-design.md §4.3.
import { type Module, subtracksOf } from "./modules.ts";

export type BoardState = "open" | "closed" | "not_planned";
export type BoardTask = {
	ref: string;
	title: string;
	url: string;
	state: BoardState;
	status: string | null;
	sprint: string | null;
	assignees: string[];
	track: string | null;
	parent: string | null;
};
export type BoardSprint = { title: string; start: string; days: number };
export type BoardSnapshot = { takenAt: string; sprints: BoardSprint[]; tasks: BoardTask[] };

const STATES: readonly BoardState[] = ["open", "closed", "not_planned"];

/** Снимок не той формы: `message` = `board.json: <проблема>`. */
export class SnapshotError extends Error {
	constructor(problem: string) {
		super(`board.json: ${problem}`);
		this.name = "SnapshotError";
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function str(path: string, value: unknown): string {
	if (typeof value !== "string") throw new SnapshotError(`${path} — нужна строка`);
	return value;
}

function strOrNull(path: string, value: unknown): string | null {
	return value === null ? null : str(path, value);
}

function arr(path: string, value: unknown): unknown[] {
	if (!Array.isArray(value)) throw new SnapshotError(`${path} — нужен список`);
	return value;
}

function obj(path: string, value: unknown): Record<string, unknown> {
	if (!isRecord(value)) throw new SnapshotError(`${path} — нужен объект`);
	return value;
}

function parseSprint(path: string, value: unknown): BoardSprint {
	const s = obj(path, value);
	if (typeof s.days !== "number") throw new SnapshotError(`${path}.days — нужно число`);
	return { title: str(`${path}.title`, s.title), start: str(`${path}.start`, s.start), days: s.days };
}

function parseTask(path: string, value: unknown): BoardTask {
	const t = obj(path, value);
	const ref = str(`${path}.ref`, t.ref);
	const title = str(`${path}.title`, t.title);
	const url = str(`${path}.url`, t.url);
	if (typeof t.state !== "string" || !STATES.includes(t.state as BoardState)) {
		throw new SnapshotError(`${path}.state — допустимо: ${STATES.join(", ")}`);
	}
	const status = strOrNull(`${path}.status`, t.status);
	const sprint = strOrNull(`${path}.sprint`, t.sprint);
	const assignees = arr(`${path}.assignees`, t.assignees).map((a, i) => str(`${path}.assignees[${i}]`, a));
	const track = strOrNull(`${path}.track`, t.track);
	const parent = strOrNull(`${path}.parent`, t.parent);
	return { ref, title, url, state: t.state as BoardState, status, sprint, assignees, track, parent };
}

/** JSON снимка → `BoardSnapshot`; первая ошибка формы — `SnapshotError` с путём поля. */
export function parseSnapshot(json: unknown): BoardSnapshot {
	if (!isRecord(json)) throw new SnapshotError("нужен объект");
	const root = json;
	const takenAt = str("takenAt", root.takenAt);
	const sprints = arr("sprints", root.sprints).map((s, i) => parseSprint(`sprints[${i}]`, s));
	const tasks = arr("tasks", root.tasks).map((t, i) => parseTask(`tasks[${i}]`, t));
	return { takenAt, sprints, tasks };
}

export type Progress = { done: number; active: number; total: number };
export type ModuleTasks = { byTrack: Record<string, BoardTask[]>; untracked: BoardTask[]; unknown: BoardTask[] };
/** Снимок доски в данных сайта: время съёмки и задачи по модулям. */
export type BoardData = { takenAt: string; byModule: Record<string, ModuleTasks> };

/**
 * Задачи модуля для показа; `null` — задач не показываем: снимка нет или у модуля нет `sprints`
 * (спека §4.2). Модуль со `sprints`, которого нет в снимке, получает пустой набор.
 */
export function moduleTasks(board: BoardData | null, module: Module): ModuleTasks | null {
	if (!board || module.sprints.length === 0) return null;
	return board.byModule[module.id] ?? { byTrack: {}, untracked: [], unknown: [] };
}

/** Дата `YYYY-MM-DD` по Москве для ISO-времени. */
export function moscowDate(iso: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Moscow",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date(iso));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number): string {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Модуль, в котором сегодня идёт один из спринтов; иначе самый новый модуль со спринтами. */
function currentModule(modules: readonly Module[], snapshot: BoardSnapshot): Module | undefined {
	const withSprints = modules.filter((m) => m.sprints.length > 0);
	const today = moscowDate(snapshot.takenAt);
	const running = new Set(
		snapshot.sprints.filter((s) => s.start <= today && today < addDays(s.start, s.days)).map((s) => s.title),
	);
	const current = withSprints.find((m) => m.sprints.some((s) => running.has(s)));
	if (current) return current;
	return withSprints.reduce<Module | undefined>((a, m) => (a === undefined || Number(m.id) > Number(a.id) ? m : a), undefined);
}

/** Раскладка задач по модулям и трекам, спека §4.4. Ключи — id всех модулей. */
export function assignTasks(modules: readonly Module[], snapshot: BoardSnapshot): Record<string, ModuleTasks> {
	const result: Record<string, ModuleTasks> = {};
	for (const m of modules) result[m.id] = { byTrack: {}, untracked: [], unknown: [] };
	const byRef = new Map(snapshot.tasks.map((t) => [t.ref, t]));
	const current = currentModule(modules, snapshot);
	for (const task of snapshot.tasks) {
		const track = task.track ?? (task.parent !== null ? (byRef.get(task.parent)?.track ?? null) : null);
		const module =
			task.sprint !== null ? modules.find((m) => m.sprints.includes(task.sprint as string)) : current;
		const bucket = module && result[module.id];
		if (!module || !bucket) continue;
		if (track !== null) {
			if (module.tracks.some((t) => t.id === track)) (bucket.byTrack[track] ??= []).push(task);
			else bucket.unknown.push(task);
		} else if (task.sprint !== null) {
			bucket.untracked.push(task);
		}
	}
	return result;
}

/** Прогресс трека, спека §4.4 п. 4. */
export function trackProgress(tasks: readonly BoardTask[]): Progress {
	const counted = tasks.filter((t) => t.state !== "not_planned");
	return {
		total: counted.length,
		done: counted.filter((t) => t.status === "Done" || t.state === "closed").length,
		active: counted.filter((t) => t.status === "In progress" || t.status === "In review").length,
	};
}

/** Задачи трека и его подтреков (спека 2026-10-09-subtracks §6); у подтрека и обычного трека — только свои. */
export function tasksWithSubtracks(module: Module, byTrack: Readonly<Record<string, readonly BoardTask[]>>, id: string): BoardTask[] {
	return [...(byTrack[id] ?? []), ...subtracksOf(module, id).flatMap((t) => byTrack[t.id] ?? [])];
}

/** Текст вместо пустого списка своих задач; `withSubtracks` — сколько задач вместе с подтреками. */
export function noTasksNote(withSubtracks: number): string {
	return withSubtracks > 0 ? "Своих задач нет — задачи в подтреках" : "Задач пока нет: их привязывают на груминге полем «Трек» на доске";
}

export const STATUS_ORDER = ["In progress", "In review", "Ready", "Backlog", "Done"] as const;

/** Место статуса в `STATUS_ORDER`: без статуса — как Backlog, статус вне списка — сразу после Backlog. */
export function statusRank(status: string | null): number {
	if (status === null) return STATUS_ORDER.indexOf("Backlog");
	const i = (STATUS_ORDER as readonly string[]).indexOf(status);
	return i === -1 ? STATUS_ORDER.indexOf("Backlog") + 0.5 : i;
}

/** Группы по `STATUS_ORDER`, внутри — по `ref`; `not_planned` в конце. */
export function sortTasks(tasks: readonly BoardTask[]): BoardTask[] {
	const key = (t: BoardTask) => (t.state === "not_planned" ? 1 : 0);
	return [...tasks].sort(
		(a, b) => key(a) - key(b) || statusRank(a.status) - statusRank(b.status) || a.ref.localeCompare(b.ref, "en", { numeric: true }),
	);
}
