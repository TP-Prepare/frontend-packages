import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BoardConfig, type Module, parseSnapshot } from "../src/index.ts";
import { main } from "../src/cli.ts";
import { fetchSnapshot, ownerKind, planOptions, sync, toSnapshot, trackCatalog } from "../src/cli/board.ts";
import fixture from "./fixtures/board-items.json";

const REAL = fileURLToPath(new URL("./fixtures/cdd/modules", import.meta.url));
const OWNER = "Cringe-Driven-Development-Team";

const mod = (id: string, tracks: [string, string][]): Module =>
	({ id, title: id, sprints: [], url: "", tracks: tracks.map(([tid, title]) => ({ id: tid, title })) }) as unknown as Module;

describe("trackCatalog", () => {
	test("описание берётся из самого нового модуля", () => {
		const modules = [mod("2026-2", [["bff", "Новый BFF"]]), mod("2026-1", [["bff", "Старый BFF"], ["db", "БД"]])];
		expect([...trackCatalog(modules)]).toEqual([
			["bff", "Новый BFF"],
			["db", "БД"],
		]);
	});
});

describe("planOptions", () => {
	test("пусто + 2 трека: новые GRAY по алфавиту без id", () => {
		const tracks = new Map([["zeta", "Z"], ["alpha", "A"]]);
		expect(planOptions([], tracks)).toEqual([
			{ name: "alpha", description: "A", color: "GRAY" },
			{ name: "zeta", description: "Z", color: "GRAY" },
		]);
	});

	test("существующее значение вне каталога остаётся со своим id", () => {
		const existing = [{ id: "a", name: "bff", description: "d", color: "BLUE" }];
		expect(planOptions(existing, new Map([["db", "БД"]]))).toEqual([
			{ id: "a", name: "bff", description: "d", color: "BLUE" },
			{ name: "db", description: "БД", color: "GRAY" },
		]);
	});

	test("новое описание: тот же id, цвет сохранён", () => {
		const existing = [{ id: "a", name: "bff", description: "старое", color: "BLUE" }];
		expect(planOptions(existing, new Map([["bff", "новое"]]))).toEqual([
			{ id: "a", name: "bff", description: "новое", color: "BLUE" },
		]);
	});

	test("ничего не изменилось: null", () => {
		const existing = [{ id: "a", name: "bff", description: "BFF", color: "BLUE" }];
		expect(planOptions(existing, new Map([["bff", "BFF"]]))).toBeNull();
	});
});

describe("toSnapshot", () => {
	const snap = toSnapshot(fixture.items, fixture.iterations, "2026-10-08T10:00:00Z", OWNER);

	test("только Issue", () => {
		expect(snap.tasks.map((t) => t.ref)).toEqual(["frontend#12", "backend#15", "frontend#20"]);
	});
	test("поля задачи", () => {
		expect(snap.tasks[0]).toEqual({
			ref: "frontend#12",
			title: "Форма входа",
			url: "https://github.com/Cringe-Driven-Development-Team/frontend/issues/12",
			state: "open",
			status: "In progress",
			sprint: "Sprint 3",
			assignees: ["alice"],
			track: "bff",
			parent: null,
		});
	});
	test("родитель и track null", () => {
		expect(snap.tasks[1]?.parent).toBe("frontend#9");
		expect(snap.tasks[1]?.track).toBeNull();
		expect(snap.tasks[1]?.status).toBeNull();
	});
	test("NOT_PLANNED закрытой -> not_planned", () => {
		expect(snap.tasks[2]?.state).toBe("not_planned");
	});
	test("спринты: активные и завершённые", () => {
		expect(snap.sprints).toEqual([
			{ title: "Sprint 3", start: "2026-10-05", days: 14 },
			{ title: "Sprint 2", start: "2026-09-21", days: 14 },
		]);
	});
	test("результат проходит parseSnapshot", () => {
		expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
	});

	const issue = (number: number, ownerLogin: string, parent: unknown = null) => ({
		content: {
			__typename: "Issue",
			number,
			title: `T${number}`,
			url: `https://github.com/${ownerLogin}/r/issues/${number}`,
			state: "OPEN",
			stateReason: null,
			repository: { name: "2026_2_Cringe_Driven_Development", owner: { login: ownerLogin } },
			assignees: { nodes: [] },
			parent,
		},
		status: null,
		sprint: null,
		track: null,
	});
	const repo = (login: string) => ({ name: "2026_2_Cringe_Driven_Development", owner: { login } });
	const at = "2026-10-08T10:00:00Z";

	test("issue чужого владельца: ref с владельцем", () => {
		const s = toSnapshot([issue(8, "go-park-mail-ru")], fixture.iterations, at, OWNER);
		expect(s.tasks[0]?.ref).toBe("go-park-mail-ru/2026_2_Cringe_Driven_Development#8");
	});
	test("issue владельца доски: ref без владельца", () => {
		const s = toSnapshot([issue(8, OWNER)], fixture.iterations, at, OWNER);
		expect(s.tasks[0]?.ref).toBe("2026_2_Cringe_Driven_Development#8");
	});
	test("владелец доски — board.owner, не зашитая организация", () => {
		const s = toSnapshot([issue(8, "acme"), issue(9, OWNER)], fixture.iterations, at, "acme");
		expect(s.tasks.map((t) => t.ref)).toEqual([
			"2026_2_Cringe_Driven_Development#8",
			`${OWNER}/2026_2_Cringe_Driven_Development#9`,
		]);
	});
	test("родитель из чужой организации: parent с владельцем", () => {
		const s = toSnapshot([issue(5, OWNER, { number: 8, repository: repo("frontend-park-mail-ru") })], fixture.iterations, at, OWNER);
		expect(s.tasks[0]?.parent).toBe("frontend-park-mail-ru/2026_2_Cringe_Driven_Development#8");
	});
	test("одинаковые repo#N из разных организаций дают разные ref", () => {
		const s = toSnapshot([issue(8, "go-park-mail-ru"), issue(8, "frontend-park-mail-ru")], fixture.iterations, at, OWNER);
		expect(new Set(s.tasks.map((t) => t.ref)).size).toBe(2);
	});
});

// --- запросы к API: fetch подменён, сети нет ---

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

type Sent = { query: string; variables: Record<string, unknown> };
function stubFetch(responses: unknown[]): Sent[] {
	const sent: Sent[] = [];
	globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
		sent.push(JSON.parse(String(init?.body)) as Sent);
		const body = responses[sent.length - 1];
		if (body === undefined) throw new Error("лишний запрос");
		return new Response(JSON.stringify(body), { status: 200 });
	}) as unknown as typeof fetch;
	return sent;
}

const TOKEN = "secret-token-123";
const board: BoardConfig = { owner: OWNER, project: 1, field: "Трек" };
const tracks = new Map([["bff", "BFF"], ["db", "БД"]]);
const mutations = (sent: Sent[]) => sent.filter((r) => r.query.includes("mutation"));
const org = { data: { repositoryOwner: { __typename: "Organization" } } };
const user = { data: { repositoryOwner: { __typename: "User" } } };
const fieldMissing = {
	errors: [{ type: "NOT_FOUND", path: ["owner", "projectV2", "field"], message: "Could not resolve to a Unions::ProjectV2FieldConfiguration with the name Трек" }],
	data: { owner: { projectV2: { id: "P1", field: null } } },
};
const mutationOk = { data: { ok: {} } };

describe("ownerKind", () => {
	test("Organization -> organization, User -> user", async () => {
		const sent = stubFetch([org, user]);
		expect(await ownerKind(TOKEN, "acme")).toBe("organization");
		expect(await ownerKind(TOKEN, "bob")).toBe("user");
		expect(sent[0]?.query).toContain("repositoryOwner(login: $login) { __typename }");
		expect(sent[1]?.variables).toEqual({ login: "bob" });
	});

	test("владельца нет -> ошибка", async () => {
		stubFetch([{ data: { repositoryOwner: null } }]);
		await expect(ownerKind(TOKEN, "ghost")).rejects.toThrow("владелец ghost не найден");
	});
});

describe("sync", () => {
	test("поля нет (NOT_FOUND на field) -> createProjectV2Field со всеми значениями", async () => {
		const sent = stubFetch([org, fieldMissing, mutationOk]);
		expect(await sync(TOKEN, board, tracks)).toBe(2);
		const [m] = mutations(sent);
		expect(m?.query).toContain("createProjectV2Field");
		expect(m?.variables.input).toEqual({
			projectId: "P1",
			dataType: "SINGLE_SELECT",
			name: "Трек",
			singleSelectOptions: [
				{ name: "bff", description: "BFF", color: "GRAY" },
				{ name: "db", description: "БД", color: "GRAY" },
			],
		});
	});

	test("organization: запрос через organization(login:), пользователь — через user(login:)", async () => {
		const asOrg = stubFetch([org, fieldMissing, mutationOk]);
		await sync(TOKEN, board, tracks);
		expect(asOrg[1]?.query).toContain("owner: organization(login: $login)");
		expect(asOrg[1]?.variables).toEqual({ login: OWNER, number: 1 });
		const asUser = stubFetch([user, fieldMissing, mutationOk]);
		await sync(TOKEN, board, tracks);
		expect(asUser[1]?.query).toContain("owner: user(login: $login)");
		expect(asUser[1]?.query).not.toContain("organization(");
	});

	test("board.field: имя поля в запросе и в мутации", async () => {
		const sent = stubFetch([org, fieldMissing, mutationOk]);
		await sync(TOKEN, { ...board, field: "Track" }, tracks);
		expect(sent[1]?.query).toContain('field(name: "Track")');
		expect(sent[1]?.query).not.toContain("Трек");
		expect((mutations(sent)[0]?.variables.input as { name: string }).name).toBe("Track");
	});

	test("NOT_FOUND на projectV2 -> ошибка, мутаций нет", async () => {
		const sent = stubFetch([org, { errors: [{ type: "NOT_FOUND", path: ["owner", "projectV2"], message: "x" }], data: { owner: { projectV2: null } } }]);
		await expect(sync(TOKEN, board, tracks)).rejects.toThrow();
		expect(mutations(sent)).toHaveLength(0);
	});

	test("NOT_FOUND на field без id проекта -> ошибка, мутаций нет", async () => {
		const sent = stubFetch([org, { errors: fieldMissing.errors, data: { owner: { projectV2: { field: null } } } }]);
		await expect(sync(TOKEN, board, tracks)).rejects.toThrow();
		expect(mutations(sent)).toHaveLength(0);
	});

	test("прочая ошибка -> ошибка, мутаций нет", async () => {
		const sent = stubFetch([org, { errors: [{ type: "SERVICE_UNAVAILABLE", message: "boom" }], data: { owner: { projectV2: { id: "P1", field: null } } } }]);
		await expect(sync(TOKEN, board, tracks)).rejects.toThrow("boom");
		expect(mutations(sent)).toHaveLength(0);
	});

	test("поле есть: updateProjectV2Field с id существующего и новым без id", async () => {
		const field = { id: "F1", options: [{ id: "a", name: "bff", description: "BFF", color: "BLUE" }] };
		const sent = stubFetch([org, { data: { owner: { projectV2: { id: "P1", field } } } }, mutationOk]);
		expect(await sync(TOKEN, board, tracks)).toBe(1);
		const [m] = mutations(sent);
		expect(m?.query).toContain("updateProjectV2Field");
		expect(m?.variables.input).toEqual({
			fieldId: "F1",
			singleSelectOptions: [
				{ id: "a", name: "bff", description: "BFF", color: "BLUE" },
				{ name: "db", description: "БД", color: "GRAY" },
			],
		});
	});

	test("у поля нет списка options -> ошибка, мутаций нет", async () => {
		const sent = stubFetch([org, { data: { owner: { projectV2: { id: "P1", field: { id: "F1" } } } } }]);
		await expect(sync(TOKEN, board, tracks)).rejects.toThrow("options");
		expect(mutations(sent)).toHaveLength(0);
	});

	test("менять нечего -> мутации нет", async () => {
		const field = { id: "F1", options: [{ id: "a", name: "bff", description: "BFF", color: "BLUE" }, { id: "b", name: "db", description: "БД", color: "RED" }] };
		const sent = stubFetch([org, { data: { owner: { projectV2: { id: "P1", field } } } }]);
		expect(await sync(TOKEN, board, tracks)).toBe(0);
		expect(mutations(sent)).toHaveLength(0);
	});
});

describe("fetchSnapshot", () => {
	const page = (nodes: unknown[], hasNextPage: boolean, endCursor: string | null) => ({
		data: { owner: { projectV2: { field: fixture.iterations, items: { pageInfo: { hasNextPage, endCursor }, nodes } } } },
	});

	test("две страницы: узлы собраны, второй запрос с after", async () => {
		const [i1, i2, , draft] = fixture.items;
		const sent = stubFetch([org, page([i1, draft], true, "CUR1"), page([i2], false, null)]);
		const snap = await fetchSnapshot(TOKEN, board, "2026-10-08T10:00:00Z");
		expect(snap.tasks.map((t) => t.ref)).toEqual(["frontend#12", "backend#15"]);
		expect(snap.sprints).toHaveLength(2);
		expect(sent).toHaveLength(3);
		expect(sent[1]?.variables.after).toBeNull();
		expect(sent[2]?.variables.after).toBe("CUR1");
	});

	test("пользователь: user(login:), поле board.field в выборке карточек", async () => {
		const sent = stubFetch([user, page([], false, null)]);
		await fetchSnapshot(TOKEN, { owner: "bob", project: 2, field: "Track" }, "2026-10-08T10:00:00Z");
		expect(sent[1]?.query).toContain("owner: user(login: $login)");
		expect(sent[1]?.query).toContain('fieldValueByName(name: "Track")');
		expect(sent[1]?.variables).toEqual({ login: "bob", number: 2, after: null });
	});
});

// --- main: board … ---

let root = "";
let dir = "";
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "mg-board-"));
	dir = join(root, "site", "modules");
	cpSync(REAL, dir, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function withBoard(yaml = `board:\n  owner: ${OWNER}\n  project: 1\n  field: Track\n`): void {
	writeFileSync(join(dir, "module-graph.yaml"), yaml);
}

async function run(args: string[], env: Record<string, string | undefined> = {}) {
	const out = spyOn(console, "log").mockImplementation(() => {});
	const err = spyOn(console, "error").mockImplementation(() => {});
	try {
		const code = await main(args, env, "", root);
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

describe("main board", () => {
	test("без раздела board -> код 1 и подсказка", async () => {
		const r = await run(["board", "sync"], { GH_TOKEN: TOKEN });
		expect(r.code).toBe(1);
		expect(r.err).toBe("module-graph: modules/module-graph.yaml: board — нет раздела; нужен { owner, project, field }\n");
	});

	test("без GH_TOKEN -> код 1", async () => {
		withBoard();
		const r = await run(["board", "sync"]);
		expect(r.code).toBe(1);
		expect(r.err).toBe("module-graph: не задан GH_TOKEN\n");
	});

	test("BOARD_* не читаются", async () => {
		withBoard();
		const sent = stubFetch([org, fieldMissing, mutationOk]);
		await run(["board", "sync"], { GH_TOKEN: TOKEN, BOARD_OWNER: "other", BOARD_PROJECT: "7" });
		expect(sent[0]?.variables).toEqual({ login: OWNER });
		expect(sent[1]?.variables).toEqual({ login: OWNER, number: 1 });
	});

	test("snapshot без пути -> код 1", async () => {
		withBoard();
		const r = await run(["board", "snapshot"], { GH_TOKEN: TOKEN });
		expect(r.code).toBe(1);
		expect(r.err).toContain("укажите путь к файлу");
	});

	test("sync: каталог из модулей, итог с board.field", async () => {
		withBoard();
		const sent = stubFetch([org, fieldMissing, mutationOk]);
		const r = await run(["board", "sync"], { GH_TOKEN: TOKEN });
		expect(r).toEqual({ code: 0, out: "sync: добавлено 35 значений «Track»\n", err: "" });
		const input = mutations(sent)[0]?.variables.input as { name: string; singleSelectOptions: unknown[] };
		expect(input.name).toBe("Track");
		expect(input.singleSelectOptions).toHaveLength(35);
	});

	test("snapshot: файл записан, итог в stdout и GITHUB_STEP_SUMMARY", async () => {
		withBoard();
		const [i1] = fixture.items;
		stubFetch([org, { data: { owner: { projectV2: { field: fixture.iterations, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [i1] } } } } }]);
		const summaryFile = join(root, "summary.md");
		writeFileSync(summaryFile, "");
		const out = join(root, "board.json");
		const r = await run(["board", "snapshot", out], { GH_TOKEN: TOKEN, GITHUB_STEP_SUMMARY: summaryFile });
		expect(r).toEqual({ code: 0, out: "snapshot: 1 задач\n", err: "" });
		expect(parseSnapshot(JSON.parse(readFileSync(out, "utf8"))).tasks).toHaveLength(1);
		expect(readFileSync(summaryFile, "utf8")).toBe("snapshot: 1 задач\n");
	});

	test("ошибка API -> код 1, токена нет в stderr", async () => {
		withBoard();
		stubFetch([{ errors: [{ type: "FORBIDDEN", message: `bad credentials ${TOKEN}` }], data: null }]);
		const r = await run(["board", "snapshot", "/dev/null"], { GH_TOKEN: TOKEN });
		expect(r.code).toBe(1);
		expect(r.err).toBe("module-graph: GitHub API: bad credentials ***\n");
		expect(r.err).not.toContain(TOKEN);
	});

	test("ошибка API -> строка в GITHUB_STEP_SUMMARY без токена", async () => {
		withBoard();
		stubFetch([{ errors: [{ type: "FORBIDDEN", message: `bad credentials ${TOKEN}` }], data: null }]);
		const file = join(root, "summary.md");
		mkdirSync(root, { recursive: true });
		writeFileSync(file, "");
		const r = await run(["board", "snapshot", "/dev/null"], { GH_TOKEN: TOKEN, GITHUB_STEP_SUMMARY: file });
		expect(r.code).toBe(1);
		const written = readFileSync(file, "utf8");
		expect(written).toContain("module-graph:");
		expect(written).not.toContain(TOKEN);
	});
});
