import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, personLoad } from "../src/index.ts";
import { createModulesLoader, loadModuleDir, readBoard, readModules } from "../src/node/index.ts";
import { PEOPLE } from "./fixtures/people.ts";

const REAL = fileURLToPath(new URL("./fixtures/cdd/modules", import.meta.url));

let dir = "";
beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "mg-")), "modules");
  mkdirSync(dir);
  writeFileSync(join(dir, "people.yaml"), readFileSync(join(REAL, "people.yaml"), "utf8"));
});
afterEach(() => rmSync(dirname(dir), { recursive: true, force: true }));

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const BFF = "---\ntitle: BFF\narea: fullstack\ndo:\n  iRedTea: front\n  MrDuckVC: back\n---\n\n## Цель\nтекст\n";

test("reads modules newest first", () => {
  write("index.md", "---\ntitle: Модули\n---\n");
  write("9/index.md", "---\ntitle: Девятый\n---\n");
  write("2/index.md", "---\ntitle: Второй\n---\n");
  write("10/index.md", "---\ntitle: Десятый\nperiod: 13.10 — 09.11\n---\n<ModuleGraph />\n");
  write("10/tracks/bff.md", BFF);
  const modules = readModules(dir);
  expect(modules.map((m) => m.id)).toEqual(["10", "9", "2"]);
  expect(modules[0]?.period).toBe("13.10 — 09.11");
  expect(modules[0]?.tracks.map((t) => [t.id, t.hasBody])).toEqual([["bff", true]]);
  expect(modules[1]?.tracks).toEqual([]);
});

const BFF_PAGES = BFF.replace("---\n\n", "pages: [contract, auth]\n---\n\n");
const page = (title: string) => `---\ntitle: ${title}\n---\n# ${title}\n`;
const october = () => write("2/index.md", "---\ntitle: Октябрь\n---\n");

test("reads track subpages", () => {
  october();
  write("2/tracks/bff.md", BFF_PAGES);
  write("2/tracks/bff/contract.md", page("Контракт"));
  write("2/tracks/bff/auth.md", page("Авторизация и CSRF"));
  write("2/tracks/bff/scheme.png", "png");
  const [bff] = readModules(dir)[0]?.tracks ?? [];
  expect(bff?.pages.map((p) => [p.id, p.title])).toEqual([
    ["contract", "Контракт"],
    ["auth", "Авторизация и CSRF"],
  ]);
});

test("subpage without pages entry", () => {
  october();
  write("2/tracks/bff.md", BFF);
  write("2/tracks/bff/x.md", page("X"));
  expect(() => readModules(dir)).toThrow("modules/2/tracks/bff/x.md: pages — подстраницы нет в pages трека bff.md");
});

test("subpage directory without a track", () => {
  october();
  write("2/tracks/bff.md", BFF);
  write("2/tracks/ghost/a.md", page("A"));
  expect(() => readModules(dir)).toThrow("modules/2/tracks/ghost/a.md: pages — подстраницы нет в pages трека ghost.md");
});

test("missing subpage file", () => {
  october();
  write("2/tracks/bff.md", BFF_PAGES);
  write("2/tracks/bff/auth.md", page("Авторизация и CSRF"));
  expect(() => readModules(dir)).toThrow("modules/2/tracks/bff.md: pages — нет файла bff/contract.md");
});

test("subpage YAML error names the file", () => {
  october();
  write("2/tracks/bff.md", BFF_PAGES);
  write("2/tracks/bff/contract.md", page("Контракт"));
  write("2/tracks/bff/auth.md", "---\ntitle: [x\n---\n");
  expect(() => readModules(dir)).toThrow("modules/2/tracks/bff/auth.md: строка 2 — сломан YAML: ");
});

test("errors name the file from the parent of the modules directory", () => {
  write("2/index.md", "---\ntitle: Октябрь\n---\n");
  write("2/tracks/bff.md", BFF.replace("MrDuckVC", "MrDuck"));
  expect(() => readModules(dir)).toThrow("modules/2/tracks/bff.md: do — логина MrDuck нет в people.yaml");
});

test("YAML syntax errors name the file", () => {
  write("2/index.md", "---\ntitle: Октябрь\n---\n");
  write("2/tracks/bff.md", BFF.replace("  MrDuckVC: back\n", "  MrDuckVC: back\n  iRedTea: back\n"));
  expect(() => readModules(dir)).toThrow("modules/2/tracks/bff.md: строка 7 — сломан YAML: duplicated mapping key");
  write("2/tracks/bff.md", BFF);
  write("2/index.md", "---\ntitle: [Октябрь\n---\n");
  expect(() => readModules(dir)).toThrow("modules/2/index.md: строка 2 — сломан YAML: ");
});

test("rejects a stray directory", () => {
  write("drafts/notes.md", "черновик\n");
  expect(() => readModules(dir)).toThrow("modules/drafts: каталог — drafts — нужен номер модуля: 1, 2, 3…");
});

test("requires index.md", () => {
  write("2/tracks/bff.md", BFF);
  expect(() => readModules(dir)).toThrow("modules/2: index.md — нет файла страницы модуля");
});

test("real site/modules is valid", () => {
  const october = readModules(REAL).find((m) => m.id === "2");
  expect(october?.title).toBe("Модуль №2");
  expect(october?.tracks).toHaveLength(35);
  expect(october?.tracks.find((t) => t.id === "bff")?.pages.map((p) => p.title)).toEqual(["Контракт", "Авторизация и CSRF"]);
  const load = Object.fromEntries(personLoad(october!, loadModuleDir(REAL).people).map((l) => [l.login, [l.doing, l.mentoring]]));
  expect(load).toEqual({
    YarikMix: [7, 7],
    blackHATred: [2, 5],
    ManInTheCoat: [10, 0],
    iRedTea: [8, 0],
    GrayMouse9: [5, 0],
    MrDuckVC: [4, 0],
  });
  const track = (id: string) => october!.tracks.find((t) => t.id === id);
  expect([track("notebook-vps")?.area, track("notebook-vps")?.do, track("notebook-vps")?.mentors]).toEqual(["back", [{ login: "MrDuckVC", side: "back" }, { login: "iRedTea", side: "devops" }], []]);
  expect(track("backend-refactor")?.do).toEqual([{ login: "GrayMouse9", side: "back" }]);
  expect([track("monaco")?.mentors, track("monaco")?.subtasks.map((s) => s.title), track("monaco")?.hasBody]).toEqual([
    ["blackHATred"],
    ["Просмотр кода, только чтение", "Ячейки code и text"],
    true,
  ]);
  expect([track("front-harness")?.area, track("front-harness")?.subtasks.map((s) => s.title)]).toEqual(["team", ["chrome-devtools-mcp", "Скиллы", "LSP для агента через MCP", "Контекст всего сервиса для агента"]]);
  expect(track("front-harness")?.pages.map((p) => [p.id, p.title])).toEqual([
    ["lsp-mcp", "LSP для агента через MCP (Codex и Claude Code)"],
    ["service-context", "Контекст всего сервиса для агента фронта"],
  ]);
  expect(track("react")?.subtasks.map((s) => s.title)).toEqual(["refs", "Поддержка SVG", "Portal API"]);
  const libs = track("front-libs");
  expect([libs?.do, libs?.mentors, libs?.related.map((r) => r.track)]).toEqual([[{ login: "ManInTheCoat", side: "front" }], ["YarikMix"], ["react"]]);
  expect([track("bff")?.subtasks.map((s) => s.title), track("bff")?.related.map((r) => r.track)]).toEqual([
    ["tRPC (server)", "Turborepo + bun workspaces", "Orval"],
    [],
  ]);
  const client = track("trpc-client");
  expect([client?.label, client?.area, client?.do, client?.partOf, client?.related.map((r) => r.track)]).toEqual([
    "tRPC (client)",
    "front",
    [{ login: "iRedTea", side: "front" }],
    "bff",
    ["front-libs"],
  ]);
  expect(track("xss-back")).toBeUndefined();
  expect([track("xss")?.subtasks.map((s) => s.title), track("xss")?.related.map((r) => r.track)]).toEqual([
    ["CSP и nosniff в Caddy"],
    ["monaco", "file-exec", "file-search"],
  ]);
  expect([track("ai-review")?.label, track("ai-review")?.subtasks.map((s) => s.title)]).toEqual(["ИИ-код-ревью", []]);
  const testing = track("ai-testing");
  expect([testing?.do, testing?.related.map((r) => r.track)]).toEqual([[{ login: "YarikMix", side: "team" }], ["multibranch"]]);
  expect(track("service-harness")?.label).toBe("Harness сервиса");
  expect(track("front-harness")?.partOf).toBe("service-harness");
  expect(track("front-harness")?.related).toEqual([]);
  expect(track("service-harness")?.subtasks).toEqual([{ title: "Скиллы", subtasks: ["/apidog"] }]);
  const redis = track("redis-sessions");
  expect([redis?.area, redis?.do, redis?.mentors, redis?.related.map((r) => r.track), redis?.subtasks.length]).toEqual([
    "back",
    [{ login: "GrayMouse9", side: "back" }, { login: "iRedTea", side: "devops" }],
    ["blackHATred"],
    ["bff", "profile"],
    4,
  ]);
  expect(track("telegram-alerts")?.label).toBe("Telegram-алерты через webhooks");
  expect(["github-alerts", "apidog-alerts"].map((id) => [track(id)?.label, track(id)?.partOf, track(id)?.do])).toEqual([
    ["GitHub-алерты через webhook", "telegram-alerts", [{ login: "YarikMix", side: "team" }]],
    ["Apidog-алерты через webhook", "telegram-alerts", [{ login: "YarikMix", side: "team" }]],
  ]);
  expect([track("2fa")?.area, track("2fa")?.do, track("2fa")?.mentors]).toEqual(["fullstack", [], ["YarikMix"]]);
  expect(track("xss")?.mentors).toEqual(["YarikMix"]);
  expect([track("file-search")?.area, track("file-search")?.do, track("file-search")?.mentors, track("file-search")?.related.map((r) => r.track)]).toEqual([
    "fullstack",
    [],
    ["blackHATred"],
    [],
  ]);
  expect(["file-search-front", "file-search-back"].map((id) => [track(id)?.label, track(id)?.area, track(id)?.do, track(id)?.partOf])).toEqual([
    ["Поиск по файлу: фронт", "front", [{ login: "ManInTheCoat", side: "front" }], "file-search"],
    ["Поиск по файлу: бэк", "back", [{ login: "MrDuckVC", side: "back" }], "file-search"],
  ]);
  expect(["2fa-front", "2fa-back"].map((id) => [track(id)?.label, track(id)?.area, track(id)?.do, track(id)?.partOf])).toEqual([
    ["2FA: фронт", "front", [{ login: "iRedTea", side: "front" }], "2fa"],
    ["2FA: бэк", "back", [{ login: "GrayMouse9", side: "back" }], "2fa"],
  ]);
  expect(track("bff")?.mentors).toEqual(["YarikMix"]);
  expect([track("profile")?.area, track("profile")?.do, track("profile")?.mentors]).toEqual(["fullstack", [], ["YarikMix"]]);
  expect(["profile-front", "profile-back"].map((id) => [track(id)?.label, track(id)?.area, track(id)?.do, track(id)?.partOf])).toEqual([
    ["Профиль: фронт", "front", [{ login: "ManInTheCoat", side: "front" }], "profile"],
    ["Профиль: бэк", "back", [{ login: "GrayMouse9", side: "back" }], "profile"],
  ]);
  expect([track("figma")?.title, track("figma")?.area, track("figma")?.do]).toEqual(["Figma", "front", [{ login: "ManInTheCoat", side: "front" }]]);
  const grooming = track("runtime-grooming");
  expect([grooming?.do, grooming?.related.map((r) => r.track)]).toEqual([[{ login: "blackHATred", side: "back" }], ["notebook-vps"]]);
  const execGrooming = track("file-exec-grooming");
  expect([execGrooming?.label, execGrooming?.area, execGrooming?.do, execGrooming?.related.map((r) => r.track), execGrooming?.subtasks.length]).toEqual([
    "Техгруминг исполнения файлов",
    "back",
    [{ login: "blackHATred", side: "back" }],
    ["file-exec", "runtime-grooming"],
    5,
  ]);
  expect(grooming?.subtasks.map((s) => s.title)).toEqual([
    "Контейнеры в Selectel: Managed Kubernetes или Docker на своих VM",
    "Изоляция чужого кода",
    "Декомпозиция «Авто-VPS»",
    "Архитектурные схемы",
  ]);
  expect(track("file-exec")?.hasBody).toBe(true);
});

const SNAPSHOT = {
  takenAt: "2026-10-14T09:00:00Z",
  sprints: [{ title: "Sprint 5", start: "2026-10-13", days: 14 }],
  tasks: [
    { ref: "frontend#1", title: "Задача", url: "https://x/1", state: "open", status: "Ready", sprint: "Sprint 5", assignees: [], track: "bff", parent: null },
  ],
};

function boardModules() {
  write("2/index.md", "---\ntitle: Октябрь\nsprints: [Sprint 5]\n---\n");
  write("2/tracks/bff.md", BFF);
  return readModules(dir);
}

test("readBoard: no file gives null", () => {
  expect(readBoard(join(dir, "board.json"), boardModules())).toBeNull();
});

test("readBoard: broken JSON warns and gives null", () => {
  const modules = boardModules();
  write("board.json", "{ не json");
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(readBoard(join(dir, "board.json"), modules)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^board\.json: .+ — задачи не показаны$/);
  } finally {
    warn.mockRestore();
  }
});

test("readBoard: wrong shape warns and gives null", () => {
  const modules = boardModules();
  write("board.json", JSON.stringify({ takenAt: 1 }));
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(readBoard(join(dir, "board.json"), modules)).toBeNull();
    expect(String(warn.mock.calls[0]?.[0])).toBe("board.json: takenAt — нужна строка — задачи не показаны");
  } finally {
    warn.mockRestore();
  }
});

test("readBoard: unparseable takenAt warns and gives null", () => {
  const modules = boardModules();
  write("board.json", JSON.stringify({ ...SNAPSHOT, takenAt: "x" }));
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(readBoard(join(dir, "board.json"), modules)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe("board.json: takenAt — нужна дата и время в формате ISO — задачи не показаны");
  } finally {
    warn.mockRestore();
  }
});

test("readBoard: valid snapshot is split by module", () => {
  const modules = boardModules();
  write("board.json", JSON.stringify(SNAPSHOT));
  const board = readBoard(join(dir, "board.json"), modules);
  expect(board?.takenAt).toBe(SNAPSHOT.takenAt);
  expect(board?.byModule["2"]?.byTrack.bff?.map((x) => x.ref)).toEqual(["frontend#1"]);
});

test("real october module has four sprints", () => {
  expect(readModules(REAL).find((m) => m.id === "2")?.sprints).toEqual(["Sprint 5", "Sprint 6", "Sprint 7", "Sprint 8"]);
});

test("people.yaml is required", () => {
  rmSync(join(dir, "people.yaml"));
  expect(() => loadModuleDir(dir)).toThrow("modules/people.yaml: файл — нет файла");
});

test("people.yaml syntax error names the line without a stack", () => {
  write("people.yaml", "- login: a\n  name: [");
  let message = "";
  try {
    loadModuleDir(dir);
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message.startsWith("modules/people.yaml: строка 2 — сломан YAML:")).toBe(true);
  expect(message).not.toContain("\n    at ");
});

test("module-graph.yaml with its own sprint template is read", () => {
  write("module-graph.yaml", 'sprint: "Спринт {n}"\n');
  write("2/index.md", "---\ntitle: Октябрь\nsprints: [Спринт 1]\n---\n");
  const data = loadModuleDir(dir);
  expect(data.modules[0]?.sprints).toEqual(["Спринт 1"]);
  expect(data.config.sprint).toBe("Спринт {n}");
});

test("track frontmatter syntax error counts lines of the file", () => {
  write("2/index.md", "---\ntitle: Октябрь\n---\n");
  write("2/tracks/x.md", "---\ntitle: x\narea: [\n---\n");
  expect(() => readModules(dir)).toThrow("modules/2/tracks/x.md: строка 3 — сломан YAML:");
});

test("createModulesLoader watches the module files and loads the directory", () => {
  write("10/index.md", "---\ntitle: Десятый\n---\n");
  write("2/index.md", "---\ntitle: Второй\n---\n");
  const loader = createModulesLoader(pathToFileURL(join(dir, "modules.data.ts")).href);
  expect(loader.watch).toEqual(expect.arrayContaining(["./people.yaml", "./module-graph.yaml", "./board.json", "./*/index.md", "./*/tracks/**/*.md"]));
  expect(loader.load().modules[0]?.id).toBe("10");
});

test.each([[""], ["\n"], ["# только комментарий\n"], ["  \n# a\n\n"]])("module-graph.yaml without content gives defaults: %j", (text) => {
  write("module-graph.yaml", text);
  expect(loadModuleDir(dir).config).toEqual(DEFAULT_CONFIG);
});

test.each([[""], ["# пусто\n"]])("empty people.yaml says a list is needed: %j", (text) => {
  write("people.yaml", text);
  expect(() => loadModuleDir(dir)).toThrow("modules/people.yaml: файл — нужен список людей");
});
