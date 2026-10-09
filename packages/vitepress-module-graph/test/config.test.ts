import { expect, test } from "bun:test";
import { areaCss, areaLabel, DEFAULT_CONFIG, parseConfig, sideLabel } from "../src/index.ts";

const F = "modules/module-graph.yaml";
const area = { label: "А", color: "#111111", dark: "#222222" };

test("файла нет — значения по умолчанию", () => {
	const c = parseConfig(F, undefined);
	expect(c).toEqual(DEFAULT_CONFIG);
	expect(parseConfig(F, null)).toEqual(DEFAULT_CONFIG);
	expect(c.areas.map((a) => a.key)).toEqual(["front", "back", "devops", "fullstack", "team"]);
	expect(c.areas.find((a) => a.key === "fullstack")?.needs).toEqual(["front", "back"]);
	expect(c.areas.find((a) => a.key === "front")).toMatchObject({ label: "Фронт", color: "#2c6bd4", dark: "#5f95f1" });
	expect(c.areas.find((a) => a.key === "team")).toMatchObject({ label: "Инструменты команды", color: "#6b7c1c", dark: "#a9ba5c" });
	expect(c.sides.map((s) => s.key)).toEqual(["front", "back", "devops", "team"]);
	expect(c.route).toBe("/modules/");
	expect(c.sprint).toBe("Sprint {n}");
	expect(c.board).toBeNull();
	expect(areaLabel(c, "fullstack")).toBe("Фронт + бэк");
	expect(sideLabel(c, "team")).toBe("команда");
});

test("areas из файла — в порядке файла, sides по умолчанию", () => {
	const c = parseConfig(F, { areas: { zeta: area, alpha: area } });
	expect(c.areas.map((a) => a.key)).toEqual(["zeta", "alpha"]);
	expect(c.sides).toEqual(DEFAULT_CONFIG.sides);
});

test("ключ-число отвергается", () => {
	expect(() => parseConfig(F, { areas: { "1": area } })).toThrow(
		`${F}: areas.1 — ключ: строчная латиница, цифры и дефис, первая — буква`,
	);
});

test("needs проверяется после разрешения sides", () => {
	expect(() => parseConfig(F, { sides: { web: "веб" } })).toThrow(
		`${F}: areas.fullstack.needs — нет стороны front; допустимо: web`,
	);
});

test("ошибки", () => {
	const bad = (data: unknown, msg: string) => expect(() => parseConfig(F, data)).toThrow(`${F}: ${msg}`);
	bad({ colour: 1 }, "colour — неизвестный ключ; допустимо: route, areas, sides, sprint, board");
	bad({ areas: { front: { ...area, colr: 1 } } }, "areas.front.colr — неизвестный ключ; допустимо: label, color, dark, needs");
	bad({ areas: { front: { ...area, color: "red" } } }, "areas.front.color — нужен цвет #rrggbb");
	bad({ areas: { Front: area } }, "areas.Front — ключ: строчная латиница, цифры и дефис, первая — буква");
	bad({ route: "modules" }, "route — нужен путь с / в начале и в конце");
	bad({ sprint: "Sprint" }, "sprint — нужен шаблон с одним {n}");
	bad({ board: { owner: "x" } }, "board.project — нужно целое число от 1");
	bad({ areas: {} }, "areas — нужно хотя бы одно направление");
	bad([1], "файл — нужен словарь настроек");
});

test("board из файла", () => {
	const c = parseConfig(F, { board: { owner: "o", project: 3, field: "Трек" } });
	expect(c.board).toEqual({ owner: "o", project: 3, field: "Трек" });
});

test("areaCss", () => {
	const css = areaCss(DEFAULT_CONFIG);
	expect(css).toContain(":where(:root){--mg-area-front:#2c6bd4;");
	expect(css).toContain(":where(html.dark){--mg-area-front:#5f95f1;");
	expect(css).not.toContain("\n");
});
