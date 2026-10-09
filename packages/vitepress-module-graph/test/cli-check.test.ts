import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.ts";
import { checkModules, hookModulesDir } from "../src/cli/check.ts";

const REAL = fileURLToPath(new URL("./fixtures/cdd/modules", import.meta.url));
const USAGE = "использование: module-graph check [--dir <папка>] [--hook] | board sync | board snapshot <файл>";

let root = "";
let dir = "";
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "mg-cli-"));
	dir = join(root, "course", "modules");
	mkdirSync(dir, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, text: string): string {
	const full = join(dir, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, text);
	return full;
}

const GOOD = "---\ntitle: BFF\narea: fullstack\ndo:\n  iRedTea: front\n  MrDuckVC: back\n---\n\n## Цель\nтекст\n";
const BAD = "---\ntitle: BFF\narea: fullstack\ndo: {}\n---\n\n## Цель\nтекст\n";

function setup(track: string): string {
	cpSync(join(REAL, "people.yaml"), join(dir, "people.yaml"));
	write("module-graph.yaml", "route: /course/modules/\n");
	write("index.md", "---\ntitle: Модули\n---\n");
	write("2/index.md", "---\ntitle: Октябрь\n---\n");
	return write("2/tracks/bff.md", track);
}

const hookInput = (file: string) => JSON.stringify({ tool_input: { file_path: file } });

async function run(args: string[], stdin = "", cwd = root, env: Record<string, string | undefined> = {}) {
	const out = spyOn(console, "log").mockImplementation(() => {});
	const err = spyOn(console, "error").mockImplementation(() => {});
	try {
		const code = await main(args, env, stdin, cwd);
		return {
			code,
			out: out.mock.calls.map((c) => `${c.join(" ")}\n`).join(""),
			err: err.mock.calls.map((c) => `${c.join(" ")}\n`).join(""),
		};
	} finally {
		out.mockRestore();
		err.mockRestore();
	}
}

test("checkModules: строка успеха", () => {
	setup(GOOD);
	expect(checkModules(dir)).toBe("modules ok: 1 модуль, 1 трек");
});

test("checkModules: сломанный трек бросает с текстом сборки", () => {
	setup(BAD);
	expect(() => checkModules(dir)).toThrow("modules/2/tracks/bff.md: do — нужен хотя бы один исполнитель: логин → сторона");
});

test("hookModulesDir: ближайший предок с people.yaml", () => {
	setup(GOOD);
	expect(hookModulesDir(hookInput(join(dir, "2", "tracks", "bff.md")))).toBe(dir);
	expect(hookModulesDir(hookInput(join(root, "README.md")))).toBeNull();
	expect(hookModulesDir("не json")).toBeNull();
	expect(hookModulesDir("{}")).toBeNull();
	expect(hookModulesDir("null")).toBeNull();
});

test("hookModulesDir: пути Windows нормализуются, exists подменяется", () => {
	const exists = (p: string) => p === "C:/x/site/modules/people.yaml";
	expect(hookModulesDir(hookInput("C:\\x\\site\\modules\\2\\tracks\\bff.md"), exists)).toBe("C:/x/site/modules");
	expect(hookModulesDir(hookInput("C:\\x\\other\\a.md"), exists)).toBeNull();
});

test("hookModulesDir: люди во вложенной папке — берётся ближайшая", () => {
	const exists = (p: string) => p === "/a/people.yaml" || p === "/a/b/people.yaml";
	expect(hookModulesDir(hookInput("/a/b/2/x.md"), exists)).toBe("/a/b");
});

test("check без --dir: site/modules от cwd", async () => {
	cpSync(REAL, join(root, "site", "modules"), { recursive: true });
	expect(await run(["check"])).toEqual({ code: 0, out: "modules ok: 1 модуль, 35 треков\n", err: "" });
});

test("check --dir: относительный путь считается от cwd", async () => {
	const repoRoot = fileURLToPath(new URL("..", import.meta.url));
	expect(await run(["check", "--dir", "test/fixtures/cdd/modules"], "", repoRoot)).toEqual({
		code: 0,
		out: "modules ok: 1 модуль, 35 треков\n",
		err: "",
	});
});

test("check: сломанный трек — код 1, одна строка в stderr", async () => {
	setup(BAD);
	const r = await run(["check", "--dir", dir]);
	expect(r.code).toBe(1);
	expect(r.out).toBe("");
	expect(r.err).toBe("module-graph: modules/2/tracks/bff.md: do — нужен хотя бы один исполнитель: логин → сторона\n");
});

test("check: нет папки модулей — код 1 без стека", async () => {
	const r = await run(["check"]);
	expect(r.code).toBe(1);
	expect(r.err.startsWith("module-graph: ")).toBe(true);
	expect(r.err).not.toMatch(/^\s+at /m);
});

test("--hook: сломанный трек — код 2 и ошибка в stderr без префикса", async () => {
	const file = setup(BAD);
	const r = await run(["check", "--hook"], hookInput(file));
	expect(r.code).toBe(2);
	expect(r.err).toBe("modules/2/tracks/bff.md: do — нужен хотя бы один исполнитель: логин → сторона\n");
	expect(r.out).toBe("");
});

test("--hook: исправный трек — тишина и код 0", async () => {
	const file = setup(GOOD);
	expect(await run(["check", "--hook"], hookInput(file))).toEqual({ code: 0, out: "", err: "" });
});

test("--hook: путь в папке без people.yaml среди предков — тишина и код 0", async () => {
	expect(await run(["check", "--hook"], hookInput(join(root, "README.md")))).toEqual({ code: 0, out: "", err: "" });
});

test("--hook: не JSON и пустой stdin — тишина и код 0", async () => {
	expect(await run(["check", "--hook"], "не json")).toEqual({ code: 0, out: "", err: "" });
	expect(await run(["check", "--hook"], "")).toEqual({ code: 0, out: "", err: "" });
});

test("--hook: сломанный YAML трека — сообщение с путём файла, без стека", async () => {
	const file = setup("---\ntitle: [\n---\n");
	const r = await run(["check", "--hook"], hookInput(file));
	expect(r.code).toBe(2);
	expect(r.err).toContain("bff.md");
	expect(r.err).not.toMatch(/^\s+at /m);
});

test("--hook: сломанный people.yaml — код 2, сообщение без стека", async () => {
	const file = setup(GOOD);
	writeFileSync(join(dir, "people.yaml"), "a: [\n");
	const r = await run(["check", "--hook"], hookInput(file));
	expect(r.code).toBe(2);
	expect(r.out).toBe("");
	expect(r.err.trim()).not.toBe("");
	expect(r.err).not.toMatch(/^\s+at /m);
});

test("неизвестная команда — использование в stderr, код 1", async () => {
	for (const args of [["nope"], [], ["check", "--bad"], ["board"], ["board", "x"], ["check", "--dir"]]) {
		const r = await run(args);
		expect(r.code).toBe(1);
		expect(r.err.startsWith(USAGE)).toBe(true);
	}
});
