import { expect, test } from "bun:test";
import { DEFAULT_CONFIG, parsePeople } from "../src/index.ts";

const F = "modules/people.yaml";
const p = (login: string, extra: object = {}) => ({ login, name: "Имя", role: "роль", area: "front", ...extra });
const bad = (data: unknown, msg: string) => expect(() => parsePeople(F, data, DEFAULT_CONFIG)).toThrow(`${F}: ${msg}`);

test("валидный список", () => {
	const list = [p("a", { mentor: true }), p("b")];
	expect(parsePeople(F, list, DEFAULT_CONFIG)).toEqual(list as any);
});

test("ошибки", () => {
	bad([p("a"), p("b"), p("c", { area: "qa" })], "[2].area — неизвестное направление qa; допустимо: front, back, devops, fullstack, team");
	bad([p("a"), p("a")], "[1].login — логин a повторяется");
	bad([p("a", { mentor: false })], "[0].mentor — только true");
	bad([p("a", { name: "" })], "[0].name — нужна непустая строка");
	bad({ a: 1 }, "файл — нужен список людей");
	bad([p("a", { email: "x" })], "[0].email — неизвестный ключ; допустимо: login, name, role, area, mentor");
});
