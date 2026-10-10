import { describe, expect, test } from "bun:test";
import { areaLabel, checkModuleId, DEFAULT_CONFIG, doersOf, filterFromQuery, filterToQuery, ModuleDataError, type ModuleGraphConfig, moduleSidebar, pageRef, parseModule, parseTrack, subtracksOf, topTracks, type Track, type TrackPage, trackPages } from "../src/index.ts";
import { PEOPLE } from "./fixtures/people.ts";

const CTX = { config: DEFAULT_CONFIG, people: PEOPLE, prefix: "modules" };

test("ModuleDataError: message format", () => {
  expect(new ModuleDataError("modules/2/tracks/bff.md", "do", "пусто").message).toBe("modules/2/tracks/bff.md: do — пусто");
  expect(areaLabel(DEFAULT_CONFIG, "fullstack")).toBe("Фронт + бэк");
});

const FILE = "modules/2/tracks/bff.md";
const valid = (): Record<string, unknown> => ({ title: "BFF", area: "fullstack", do: { iRedTea: "front", MrDuckVC: "back" } });
const track = (data: Record<string, unknown>, id = "bff", body = "") => parseTrack(`modules/2/tracks/${id}.md`, "2", id, data, body, CTX);
const fails = (data: Record<string, unknown>, message: string) => expect(() => track(data)).toThrow(`${FILE}: ${message}`);

describe("parseTrack", () => {
  test("parses a valid track", () => {
    const t = track(valid(), "bff", "\n  \n");
    expect(t).toEqual({
      id: "bff",
      module: "2",
      title: "BFF",
      label: "BFF",
      area: "fullstack",
      do: [{ login: "iRedTea", side: "front" }, { login: "MrDuckVC", side: "back" }],
      mentors: [],
      subtasks: [],
      related: [],
      hasBody: false,
      pages: [],
      url: "/modules/2/tracks/bff",
    });
  });

  test("parseTrack keeps given pages", () => {
    const page: TrackPage = { id: "auth", title: "Авторизация и CSRF", url: "/modules/2/tracks/bff/auth" };
    const t = parseTrack(FILE, "2", "bff", valid(), "", CTX, [page]);
    expect(t.pages).toEqual([page]);
  });

  test("label, mentors, subtasks, related and body are read", () => {
    const t = track({ ...valid(), label: "Б", mentors: ["YarikMix"], subtasks: ["tRPC"], related: [{ track: "x", why: "y" }] }, "bff", "## Цель");
    expect([t.label, t.mentors, t.subtasks, t.related, t.hasBody]).toEqual(["Б", ["YarikMix"], [{ title: "tRPC", subtasks: [] }], [{ track: "x", why: "y" }], true]);
  });

  test("title is required", () => {
    fails({ ...valid(), title: undefined }, "title — нужна непустая строка");
    fails({ ...valid(), title: "  " }, "title — нужна непустая строка");
  });

  test("area must be known", () => {
    fails({ ...valid(), area: "qa" }, "area — неизвестное направление qa; допустимо: front, back, devops, fullstack, team");
  });

  test("do needs at least one doer", () => {
    fails({ ...valid(), do: {} }, "do — нужен хотя бы один исполнитель: логин → сторона");
    fails({ ...valid(), do: ["iRedTea"] }, "do — нужен хотя бы один исполнитель: логин → сторона");
  });

  test("side must be known", () => {
    fails({ ...valid(), do: { iRedTea: "qa", MrDuckVC: "back" } }, "do.iRedTea — неизвестная сторона qa; допустимо: front, back, devops, team");
  });

  test("unknown login suggests the right case", () => {
    fails({ ...valid(), do: { iredtea: "front", MrDuckVC: "back" } }, "do — логина iredtea нет в people.yaml — может быть, iRedTea?");
    fails({ ...valid(), mentors: ["yarikmix"] }, "mentors — логина yarikmix нет в people.yaml — может быть, YarikMix?");
  });

  test("unknown login", () => {
    fails({ ...valid(), do: { MrDuck: "front", MrDuckVC: "back" } }, "do — логина MrDuck нет в people.yaml");
    fails({ ...valid(), mentors: ["ghost"] }, "mentors — логина ghost нет в people.yaml");
  });

  test("help is replaced by mentors", () => {
    fails({ ...valid(), help: ["YarikMix"] }, "help — поле заменено на mentors");
    fails({ ...valid(), help: [] }, "help — поле заменено на mentors");
  });

  test("a mentor must be a mentor in people.ts", () => {
    fails({ ...valid(), mentors: ["ManInTheCoat"] }, "mentors — ManInTheCoat не ментор: в people.yaml нет mentor: true");
  });

  test("a doer cannot also be a mentor", () => {
    const own = { title: "T", area: "team", do: { YarikMix: "team" }, mentors: ["YarikMix"] };
    expect(() => track(own)).toThrow(`${FILE}: mentors — YarikMix уже исполнитель`);
  });

  test("mentors do not repeat", () => {
    fails({ ...valid(), mentors: ["YarikMix", "YarikMix"] }, "mentors — YarikMix повторяется");
  });

  test("lists must be lists of strings", () => {
    fails({ ...valid(), mentors: "YarikMix" }, "mentors — нужен список");
    fails({ ...valid(), subtasks: "tRPC" }, "subtasks — нужен список");
    fails({ ...valid(), related: { track: "x" } }, "related — нужен список");
    fails({ ...valid(), subtasks: [404] }, "subtasks[0] — нужна строка или { title, subtasks }");
    fails({ ...valid(), mentors: ["YarikMix", 1] }, "mentors[1] — нужна строка");
  });

  test("fullstack needs front and back", () => {
    fails({ ...valid(), do: { iRedTea: "front" } }, "do — у трека «Фронт + бэк» нужны исполнители со сторон front, back");
    fails({ ...valid(), do: { iRedTea: "devops", MrDuckVC: "back" } }, "do — у трека «Фронт + бэк» нужны исполнители со сторон front, back");
  });

  test("related entries need a non-empty why", () => {
    fails({ ...valid(), related: [{ track: "x", why: "" }] }, "related[0].why — нужна непустая строка");
  });

  test("subtasks: string and object read the same", () => {
    const t = track({ ...valid(), subtasks: ["tRPC", { title: "Скиллы", subtasks: ["/apidog"] }, { title: "Orval" }] });
    expect(t.subtasks).toEqual([
      { title: "tRPC", subtasks: [] },
      { title: "Скиллы", subtasks: ["/apidog"] },
      { title: "Orval", subtasks: [] },
    ]);
  });

  test("part_of is read", () => {
    expect(track({ ...valid(), part_of: "service" }).partOf).toBe("service");
    expect("partOf" in track(valid())).toBe(false);
  });

  test("part_of and subtasks are checked", () => {
    fails({ ...valid(), part_of: "" }, "part_of — нужна непустая строка");
    fails({ ...valid(), subtasks: [404] }, "subtasks[0] — нужна строка или { title, subtasks }");
    fails({ ...valid(), subtasks: [{ title: "a", note: "x" }] }, "subtasks[0] — нужна строка или { title, subtasks }");
    fails({ ...valid(), subtasks: [{ title: "" }] }, "subtasks[0].title — нужна непустая строка");
    fails({ ...valid(), subtasks: [{ title: "a", subtasks: [{ title: "b" }] }] }, "subtasks[0].subtasks[0] — нужна строка: вложенность — один уровень");
    fails({ ...valid(), subtasks: ["a", { title: "a" }] }, "subtasks — подзадача «a» повторяется");
    fails({ ...valid(), subtasks: [{ title: "a", subtasks: ["b", "b"] }] }, "subtasks — подзадача «b» повторяется");
    expect(track({ ...valid(), subtasks: ["a", { title: "b", subtasks: ["a"] }] }).subtasks).toHaveLength(2);
  });

  test("id must be lowercase latin, digits and dashes", () => {
    expect(() => track(valid(), "BFF")).toThrow("modules/2/tracks/BFF.md: id — имя файла BFF.md: только строчная латиница, цифры и дефис");
    expect(track(valid(), "2fa").id).toBe("2fa");
  });
});

describe("parseModule", () => {
  const t = (id: string, title: string, related: unknown[] = []): Track =>
    track({ title, area: "team", do: { YarikMix: "team" }, related }, id);
  const INDEX = "modules/2/index.md";

  test("builds a module with tracks sorted by title", () => {
    const m = parseModule(INDEX, "2", { title: "Модуль октября 2026" }, [t("b", "Яблоко"), t("a", "Арбуз", [{ track: "b", why: "w" }])], CTX);
    expect(m.id).toBe("2");
    expect(m.url).toBe("/modules/2/");
    expect(m.period).toBeUndefined();
    expect(m.tracks.map((x) => x.id)).toEqual(["a", "b"]);
  });

  test("part_of is checked against the module", () => {
    const p = (id: string, extra: Record<string, unknown> = {}) => track({ title: id, area: "team", do: { YarikMix: "team" }, ...extra }, id);
    const mod = (...tracks: Track[]) => () => parseModule(INDEX, "2", { title: "М" }, tracks, CTX);
    const file = (id: string) => `modules/2/tracks/${id}.md`;
    expect(mod(p("a", { part_of: "x" }))).toThrow(`${file("a")}: part_of — трека x нет в модуле 2`);
    expect(mod(p("a", { part_of: "a" }))).toThrow(`${file("a")}: part_of — трек ссылается сам на себя`);
    expect(mod(p("a"), p("b", { part_of: "a" }), p("c", { part_of: "b" }))).toThrow(`${file("c")}: part_of — b сам подтрек: вложенность — один уровень`);
    expect(mod(p("a"), p("b", { part_of: "a", related: [{ track: "a", why: "w" }] }))).toThrow(
      `${file("b")}: related[0].track — a — родитель или подтрек, связь уже есть через part_of`,
    );
    expect(mod(p("a", { related: [{ track: "b", why: "w" }] }), p("b", { part_of: "a" }))).toThrow(
      `${file("a")}: related[0].track — b — родитель или подтрек, связь уже есть через part_of`,
    );
    expect(mod(p("a"), p("b", { part_of: "a" }))().tracks.find((t) => t.id === "b")?.partOf).toBe("a");
  });

  test("do may be omitted only on a track with subtracks; doersOf takes them from subtracks", () => {
    const mk = (id: string, data: Record<string, unknown>) => track({ title: id, ...data }, id);
    const mod = (...tracks: Track[]) => parseModule(INDEX, "2", { title: "М" }, tracks, CTX);
    const file = (id: string) => `modules/2/tracks/${id}.md`;
    const parent = mk("p", { area: "fullstack" });
    expect(parent.do).toEqual([]);
    expect(() => mod(parent)).toThrow(`${file("p")}: do — нужен хотя бы один исполнитель: логин → сторона, или подтреки через part_of`);
    const front = mk("f", { area: "front", do: { iRedTea: "front" }, part_of: "p" });
    expect(() => mod(parent, front)).toThrow(`${file("p")}: do — у трека «Фронт + бэк» нужны исполнители со сторон front, back`);
    const back = mk("b", { area: "back", do: { GrayMouse9: "back" }, part_of: "p" });
    const m = mod(parent, front, back);
    expect(doersOf(m, m.tracks.find((t) => t.id === "p")!)).toEqual([{ login: "GrayMouse9", side: "back" }, { login: "iRedTea", side: "front" }]);
    expect(doersOf(m, m.tracks.find((t) => t.id === "f")!)).toEqual([{ login: "iRedTea", side: "front" }]);
  });

  test("period is read", () => {
    expect(parseModule(INDEX, "2", { title: "М", period: "13.10 — 09.11" }, [], CTX).period).toBe("13.10 — 09.11");
  });

  test("title is required", () => {
    expect(() => parseModule(INDEX, "2", {}, [], CTX)).toThrow(`${INDEX}: title — нужна непустая строка`);
  });

  test("sprints are read, and default to an empty list", () => {
    expect(parseModule(INDEX, "2", { title: "М", sprints: ["Sprint 5", "Sprint 6"] }, [], CTX).sprints).toEqual(["Sprint 5", "Sprint 6"]);
    expect(parseModule(INDEX, "2", { title: "М" }, [], CTX).sprints).toEqual([]);
  });

  test("sprints are validated", () => {
    expect(() => parseModule(INDEX, "2", { title: "М", sprints: "Sprint 5" }, [], CTX)).toThrow(`${INDEX}: sprints — нужен список`);
    expect(() => parseModule(INDEX, "2", { title: "М", sprints: ["Sprint 5", "Спринт 6"] }, [], CTX)).toThrow(
      `${INDEX}: sprints[1] — нужен формат Sprint N`,
    );
    expect(() => parseModule(INDEX, "2", { title: "М", sprints: ["Sprint 5", "Sprint 5"] }, [], CTX)).toThrow(
      `${INDEX}: sprints — Sprint 5 повторяется`,
    );
  });

  test("related must point to another track of the module", () => {
    expect(() => parseModule(INDEX, "2", { title: "М" }, [t("a", "А", [{ track: "ghost", why: "w" }])], CTX)).toThrow(
      "modules/2/tracks/a.md: related[0].track — трека ghost нет в модуле 2",
    );
    expect(() => parseModule(INDEX, "2", { title: "М" }, [t("a", "А", [{ track: "a", why: "w" }])], CTX)).toThrow(
      "modules/2/tracks/a.md: related[0].track — трек ссылается сам на себя",
    );
  });

  test("module directory is a module number", () => {
    for (const id of ["1", "2", "10"]) expect(() => checkModuleId(id, "modules")).not.toThrow();
    for (const id of ["0", "02", "2026-10", "drafts"]) {
      expect(() => parseModule(`modules/${id}/index.md`, id, { title: "М" }, [], CTX)).toThrow(`modules/${id}: каталог — ${id} — нужен номер модуля: 1, 2, 3…`);
    }
  });
});

describe("trackPages", () => {
  const TRACK = "modules/2/tracks/bff.md";
  const pages = (declared: unknown, found: { name: string; title: unknown }[]) => trackPages(TRACK, "2", "bff", declared, found, CTX);

  test("returns pages in declared order with titles and urls", () => {
    expect(pages(["contract", "auth"], [{ name: "auth", title: "Авторизация и CSRF" }, { name: "contract", title: "Контракт" }])).toEqual([
      { id: "contract", title: "Контракт", url: "/modules/2/tracks/bff/contract" },
      { id: "auth", title: "Авторизация и CSRF", url: "/modules/2/tracks/bff/auth" },
    ]);
  });

  test("no pages and no files — empty", () => {
    expect(pages(undefined, [])).toEqual([]);
  });

  test("pages must be a list of ids", () => {
    expect(() => pages("contract", [])).toThrow(`${TRACK}: pages — нужен список`);
    expect(() => pages([1], [])).toThrow(`${TRACK}: pages[0] — нужна строка`);
    expect(() => pages(["Contract"], [])).toThrow(`${TRACK}: pages[0] — Contract: только строчная латиница, цифры и дефис`);
  });

  test("duplicate page", () => {
    expect(() => pages(["auth", "auth"], [{ name: "auth", title: "А" }])).toThrow(`${TRACK}: pages — auth повторяется`);
  });

  test("declared page without a file", () => {
    expect(() => pages(["contract"], [])).toThrow(`${TRACK}: pages — нет файла bff/contract.md`);
  });

  test("file not in pages", () => {
    expect(() => pages(undefined, [{ name: "x", title: "X" }])).toThrow("modules/2/tracks/bff/x.md: pages — подстраницы нет в pages трека bff.md");
  });

  test("page needs a title", () => {
    expect(() => pages(["auth"], [{ name: "auth", title: " " }])).toThrow("modules/2/tracks/bff/auth.md: title — нужна непустая строка");
  });
});

describe("moduleSidebar", () => {
  test("nests subpages under their track", () => {
    const sub = (id: string, title: string): TrackPage => ({ id, title, url: `/modules/2/tracks/bff/${id}` });
    const bff = parseTrack(FILE, "2", "bff", valid(), "", CTX, [sub("contract", "Контракт"), sub("auth", "Авторизация и CSRF")]);
    const xss = track({ title: "XSS", area: "front", do: { iRedTea: "front" } }, "xss");
    const m = parseModule("modules/2/index.md", "2", { title: "Октябрь" }, [bff, xss], CTX);
    expect(moduleSidebar([m])).toEqual([
      {
        text: "Октябрь",
        collapsed: false,
        items: [
          { text: "Граф", link: "/modules/2/" },
          {
            text: "BFF",
            link: "/modules/2/tracks/bff",
            collapsed: false,
            items: [
              { text: "Контракт", link: "/modules/2/tracks/bff/contract" },
              { text: "Авторизация и CSRF", link: "/modules/2/tracks/bff/auth" },
            ],
          },
          { text: "XSS", link: "/modules/2/tracks/xss" },
        ],
      },
    ]);
  });
  test("modules go in ascending order and each one collapses", () => {
    // readModules отдаёт свежий модуль первым (архив); в меню модули идут по порядку: №2, затем №3
    const m3 = parseModule("modules/3/index.md", "3", { title: "Модуль №3" }, [], CTX);
    const m2 = parseModule("modules/2/index.md", "2", { title: "Модуль №2" }, [], CTX);
    const modules = [m3, m2];
    expect(moduleSidebar(modules).map((s) => [s.text, s.collapsed])).toEqual([
      ["Модуль №2", false],
      ["Модуль №3", false],
    ]);
    expect(modules.map((m) => m.id)).toEqual(["3", "2"]);
  });
  test("subtrack is nested under its parent after the parent's subpages", () => {
    const sub = (track: string, id: string, title: string): TrackPage => ({ id, title, url: `/modules/2/tracks/${track}/${id}` });
    const svc = parseTrack("modules/2/tracks/svc.md", "2", "svc", { title: "Сервис", area: "team", do: { YarikMix: "team" } }, "", CTX, [sub("svc", "plan", "План")]);
    const front = parseTrack("modules/2/tracks/front.md", "2", "front", { title: "Фронт", area: "front", do: { ManInTheCoat: "front" }, part_of: "svc" }, "", CTX, [sub("front", "lsp", "LSP")]);
    const m = parseModule("modules/2/index.md", "2", { title: "Октябрь" }, [svc, front], CTX);
    expect(moduleSidebar([m])[0]?.items).toEqual([
      { text: "Граф", link: "/modules/2/" },
      {
        text: "Сервис",
        link: "/modules/2/tracks/svc",
        collapsed: false,
        items: [
          { text: "План", link: "/modules/2/tracks/svc/plan" },
          { text: "Фронт", link: "/modules/2/tracks/front", collapsed: false, items: [{ text: "LSP", link: "/modules/2/tracks/front/lsp" }] },
        ],
      },
    ]);
    expect(topTracks(m).map((t) => t.id)).toEqual(["svc"]);
    expect(subtracksOf(m, "svc").map((t) => t.id)).toEqual(["front"]);
  });
});

describe("настройки: направления, стороны, спринты, маршрут", () => {
  const ml: ModuleGraphConfig = {
    ...DEFAULT_CONFIG,
    areas: [
      { key: "ml", label: "ML", color: "#112233", dark: "#445566", needs: ["data", "back"] },
      { key: "core", label: "Ядро", color: "#112233", dark: "#445566", needs: [] },
    ],
    sides: [{ key: "data", label: "данные" }, { key: "back", label: "бэк" }],
  };
  const mlCtx = { config: ml, people: PEOPLE, prefix: "modules" };
  const mlTrack = (data: Record<string, unknown>) => parseTrack(FILE, "2", "bff", { title: "ML", area: "ml", ...data }, "", mlCtx);

  test("needs: у направления должны быть все стороны", () => {
    expect(() => mlTrack({ do: { iRedTea: "data" } })).toThrow(`${FILE}: do — у трека «ML» нужны исполнители со сторон data, back`);
    expect(mlTrack({ do: { iRedTea: "data", MrDuckVC: "back" } }).area).toBe("ml");
  });

  test("needs: подтрек закрывает сторону родителя", () => {
    const mk = (id: string, data: Record<string, unknown>) => parseTrack(`modules/2/tracks/${id}.md`, "2", id, { title: id, ...data }, "", mlCtx);
    const p = mk("bff", { area: "ml" });
    const data = mk("d", { area: "core", do: { iRedTea: "data" }, part_of: "bff" });
    const back = mk("b", { area: "core", do: { MrDuckVC: "back" }, part_of: "bff" });
    expect(p.do).toEqual([]);
    expect(() => parseModule("modules/2/index.md", "2", { title: "М" }, [p, data], mlCtx)).toThrow(`${FILE}: do — у трека «ML» нужны исполнители со сторон data, back`);
    expect(parseModule("modules/2/index.md", "2", { title: "М" }, [p, data, back], mlCtx).tracks).toHaveLength(3);
  });

  test("неизвестное направление перечисляет ключи конфига", () => {
    expect(() => track({ ...valid(), area: "ml" })).toThrow(`${FILE}: area — неизвестное направление ml; допустимо: front, back, devops, fullstack, team`);
    expect(() => parseTrack(FILE, "2", "bff", { title: "T", area: "front" }, "", mlCtx)).toThrow("area — неизвестное направление front; допустимо: ml, core");
  });

  test("sprint: формат из настроек", () => {
    const ctx = { ...CTX, config: { ...DEFAULT_CONFIG, sprint: "Спринт {n}" } };
    const mod = (sprints: string[]) => parseModule("modules/2/index.md", "2", { title: "М", sprints }, [], ctx);
    expect(mod(["Спринт 3"]).sprints).toEqual(["Спринт 3"]);
    expect(() => mod(["Sprint 3"])).toThrow("modules/2/index.md: sprints[0] — нужен формат Спринт N");
  });

  test("sprint: служебные символы шаблона экранируются", () => {
    const ctx = { ...CTX, config: { ...DEFAULT_CONFIG, sprint: "S.{n}" } };
    expect(() => parseModule("modules/2/index.md", "2", { title: "М", sprints: ["SX3"] }, [], ctx)).toThrow("нужен формат S.N");
  });

  test("prefix заменяет modules в путях ошибок", () => {
    const ctx = { ...CTX, prefix: "course" };
    expect(() => checkModuleId("x", "course")).toThrow("course/x: каталог");
    expect(() => parseModule("course/2/index.md", "2", { title: "М" }, [parseTrack("course/2/tracks/a.md", "2", "a", { title: "A", area: "team", do: { YarikMix: "team" }, related: [{ track: "z", why: "w" }] }, "", ctx)], ctx)).toThrow(
      "course/2/tracks/a.md: related[0].track",
    );
    expect(() => trackPages("course/2/tracks/a.md", "2", "a", undefined, [{ name: "x", title: "X" }], ctx)).toThrow("course/2/tracks/a/x.md: pages");
  });

  test("route задаёт адреса", () => {
    const config = { ...DEFAULT_CONFIG, route: "/course/modules/" };
    const ctx = { ...CTX, config };
    const page = trackPages(FILE, "2", "bff", ["auth"], [{ name: "auth", title: "А" }], ctx);
    expect(page[0]?.url).toBe("/course/modules/2/tracks/bff/auth");
    const tr = parseTrack(FILE, "2", "bff", valid(), "", ctx);
    expect(tr.url).toBe("/course/modules/2/tracks/bff");
    expect(parseModule("modules/2/index.md", "2", { title: "М" }, [], ctx).url).toBe("/course/modules/2/");
    expect(pageRef("course/modules/2/tracks/bff.md", config)).toEqual({ module: "2", track: "bff" });
    expect(pageRef("modules/2/index.md", config)).toBeNull();
  });

  test("фильтр строится по направлениям из настроек", () => {
    expect(filterFromQuery("?area=ml", PEOPLE, ml).areas).toEqual(["ml"]);
    expect(filterFromQuery("?area=front", PEOPLE, ml).areas).toEqual(["ml", "core"]);
    expect(filterToQuery({ people: [], areas: ["ml", "core"], hide: [] }, ml)).toBe("");
  });
});

describe("route: / (корень сайта)", () => {
  const root: ModuleGraphConfig = { ...DEFAULT_CONFIG, route: "/" };
  const rootCtx = { config: root, people: PEOPLE, prefix: "modules" };

  test("pageRef: модуль, трек и подстраница без префикса", () => {
    expect(pageRef("2/index.md", root)).toEqual({ module: "2" });
    expect(pageRef("2/tracks/bff.md", root)).toEqual({ module: "2", track: "bff" });
    expect(pageRef("2/tracks/bff/auth.md", root)).toEqual({ module: "2", track: "bff", page: "auth" });
  });

  test("pageRef: /modules/ и /course/modules/ работают как раньше", () => {
    expect(pageRef("modules/2/index.md", { ...DEFAULT_CONFIG, route: "/modules/" })).toEqual({ module: "2" });
    const c = { ...DEFAULT_CONFIG, route: "/course/modules/" };
    expect(pageRef("course/modules/2/tracks/bff.md", c)).toEqual({ module: "2", track: "bff" });
  });

  test("url трека и модуля без двойного слэша", () => {
    const t = parseTrack(FILE, "2", "bff", { title: "T", area: "front", do: { iRedTea: "front" } }, "", rootCtx);
    expect(t.url).toBe("/2/tracks/bff");
    expect(parseModule("2/index.md", "2", { title: "М" }, [t], rootCtx).url).toBe("/2/");
  });
});
