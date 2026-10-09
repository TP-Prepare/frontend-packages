import { describe, expect, test } from "bun:test";
import {
  buildGraph,
  DEFAULT_CONFIG,
  defaultFilter,
  type Filter,
  filterFromQuery,
  filterToQuery,
  neighbours,
  nodePaint,
  pageRef,
  parseModule,
  parseTrack,
  personLoad,
  searchMatches,
  subtaskByNodeId,
} from "../src/index.ts";
import { PEOPLE } from "./fixtures/people.ts";

const CTX = { config: DEFAULT_CONFIG, people: PEOPLE, prefix: "modules" };
const DEFAULT_FILTER = defaultFilter(DEFAULT_CONFIG);
const t = (id: string, data: Record<string, unknown>) => parseTrack(`modules/2/tracks/${id}.md`, "2", id, data, "", CTX);
const MODULE = parseModule("modules/2/index.md", "2", { title: "Тест" }, [
  t("multibranch", {
    title: "Multi-branch",
    area: "devops",
    do: { iRedTea: "devops" },
    mentors: ["YarikMix", "blackHATred"],
    related: [{ track: "bff", why: "общий конвейер" }],
  }),
  t("bff", { title: "BFF", area: "fullstack", do: { iRedTea: "front", MrDuckVC: "back" }, subtasks: ["tRPC", "Orval"] }),
  t("ai-review", { title: "ИИ-код-ревью", area: "team", do: { YarikMix: "team" } }),
], CTX);
const graph = (filter: Partial<Filter> = {}) => buildGraph(MODULE, PEOPLE, { ...DEFAULT_FILTER, ...filter });
const ids = (filter: Partial<Filter> = {}) => graph(filter).nodes.map((n) => n.id);
const kinds = (filter: Partial<Filter> = {}) => graph(filter).links.map((l) => l.kind).sort();

describe("buildGraph", () => {
  test("default filter shows everything", () => {
    const tracks = MODULE.tracks.flatMap((tr) => [`track:${tr.id}`, ...tr.subtasks.map((_, i) => `subtask:${tr.id}/${i}`)]);
    expect(ids()).toEqual(["person:YarikMix", "person:blackHATred", "person:iRedTea", "person:MrDuckVC", ...tracks]);
    expect(kinds()).toEqual(["do", "do", "do", "do", "mentor", "mentor", "part", "part", "related"]);
  });

  test("track node carries progress only when total > 0", () => {
    const nodes = buildGraph(MODULE, PEOPLE, DEFAULT_FILTER, { bff: { done: 1, active: 0, total: 2 }, "ai-review": { done: 0, active: 0, total: 0 } }).nodes;
    expect(nodes.find((n) => n.id === "track:bff")?.progress).toEqual({ done: 1, active: 0, total: 2 });
    expect(nodes.filter((n) => n.progress !== undefined).map((n) => n.id)).toEqual(["track:bff"]);
    expect(nodes.find((n) => n.id === "track:multibranch")).not.toHaveProperty("progress");
    expect(nodes.find((n) => n.id === "track:ai-review")).not.toHaveProperty("progress");
  });

  test("links carry side and why", () => {
    const { links } = graph();
    expect(links).toContainEqual({ source: "person:MrDuckVC", target: "track:bff", kind: "do", side: "back" });
    expect(links).toContainEqual({ source: "person:YarikMix", target: "track:multibranch", kind: "mentor" });
    expect(links).toContainEqual({ source: "track:bff", target: "subtask:bff/1", kind: "part" });
    expect(links).toContainEqual({ source: "track:multibranch", target: "track:bff", kind: "related", why: "общий конвейер" });
  });

  test("nodes carry labels, areas and mentors", () => {
    const { nodes } = graph();
    expect(nodes.find((n) => n.id === "person:YarikMix")).toEqual({
      id: "person:YarikMix", kind: "person", label: "Ярослав", title: "Ярослав", area: "front", mentor: true, login: "YarikMix",
    });
    expect(nodes.find((n) => n.id === "subtask:bff/1")).toEqual({ id: "subtask:bff/1", kind: "subtask", label: "Orval", title: "Orval", area: "fullstack", trackId: "bff" });
  });

  test("person filter keeps co-workers", () => {
    expect(ids({ people: ["blackHATred"] })).toEqual(["person:YarikMix", "person:blackHATred", "person:iRedTea", "track:multibranch"]);
  });

  test("hidden mentors layer drops only mentor links", () => {
    expect(kinds({ hide: ["mentors"] })).toEqual(["do", "do", "do", "do", "part", "part", "related"]);
  });

  test("hidden mentors drop mentors and their-only tracks", () => {
    expect(ids({ people: ["blackHATred"], hide: ["mentors"] })).toEqual(["person:blackHATred"]);
  });

  test("area filter", () => {
    expect(ids({ areas: ["team"] })).toEqual(["person:YarikMix", "track:ai-review"]);
  });

  test("nothing matches but the selected person stays", () => {
    expect(graph({ areas: ["team"], people: ["GrayMouse9"] })).toEqual({ nodes: [expect.objectContaining({ id: "person:GrayMouse9" })], links: [] });
  });

  test("layers", () => {
    const g = graph({ hide: ["subtasks", "related"] });
    expect(g.nodes.some((n) => n.kind === "subtask")).toBe(false);
    expect(g.links.some((l) => l.kind === "related" || l.kind === "part")).toBe(false);
  });
});

test("neighbours of a person include subtasks of their tracks", () => {
  const n = neighbours(graph(), "person:MrDuckVC");
  expect([...n].sort()).toEqual(["person:MrDuckVC", "subtask:bff/0", "subtask:bff/1", "track:bff"]);
  expect([...neighbours(graph(), "track:ai-review")].sort()).toEqual(["person:YarikMix", "track:ai-review"]);
});

const NESTED = parseModule("modules/2/index.md", "2", { title: "Тест" }, [
  t("service", { title: "Сервис", area: "team", do: { YarikMix: "team" }, subtasks: [{ title: "Скиллы", subtasks: ["/apidog"] }] }),
  t("front", { title: "Фронт", area: "front", do: { ManInTheCoat: "front" }, part_of: "service" }),
], CTX);
const nested = (filter: Partial<Filter> = {}) => buildGraph(NESTED, PEOPLE, { ...DEFAULT_FILTER, ...filter });

test("sub link and nested subtasks", () => {
  const g = nested();
  expect(g.links.filter((l) => l.kind === "sub")).toEqual([{ source: "track:service", target: "track:front", kind: "sub" }]);
  expect(g.links.filter((l) => l.kind === "part")).toEqual([
    { source: "track:service", target: "subtask:service/0", kind: "part" },
    { source: "subtask:service/0", target: "subtask:service/0/0", kind: "part" },
  ]);
  expect(g.nodes.find((n) => n.id === "subtask:service/0/0")).toMatchObject({ kind: "subtask", label: "/apidog", trackId: "service" });
});

test("layers and filters for sub", () => {
  expect(nested({ hide: ["subtasks"] }).nodes.some((n) => n.kind === "subtask")).toBe(false);
  expect(nested({ hide: ["related"] }).links.some((l) => l.kind === "sub")).toBe(true);
  expect(nested({ areas: ["front"] }).links.some((l) => l.kind === "sub")).toBe(false);
  expect(nested({ areas: ["front"] }).nodes.map((n) => n.id)).toContain("track:front");
});

test("neighbours: person gets nested subtasks, parent gets subtrack", () => {
  expect([...neighbours(nested(), "person:YarikMix")].sort()).toEqual(["person:YarikMix", "subtask:service/0", "subtask:service/0/0", "track:service"]);
  expect(neighbours(nested(), "track:service").has("track:front")).toBe(true);
});

test("subtaskByNodeId", () => {
  expect(subtaskByNodeId(NESTED, "subtask:service/0")).toMatchObject({ title: "Скиллы", children: ["/apidog"], parent: null });
  expect(subtaskByNodeId(NESTED, "subtask:service/0/0")).toMatchObject({ title: "/apidog", children: [], parent: { index: 0, title: "Скиллы" } });
  expect(subtaskByNodeId(NESTED, "subtask:service/0/5")).toBeNull();
  expect(subtaskByNodeId(NESTED, "subtask:nope/0")).toBeNull();
});

test("searchMatches", () => {
  expect(searchMatches(graph().nodes, "orval")).toEqual(new Set(["subtask:bff/1"]));
  expect(searchMatches(graph().nodes, "  ")).toEqual(new Set());
});

describe("query", () => {
  test("round-trip", () => {
    const filter: Filter = { people: ["iRedTea", "GrayMouse9"], areas: ["devops", "fullstack"], hide: ["subtasks"] };
    const query = filterToQuery(filter, DEFAULT_CONFIG);
    expect(query).toBe("?people=iRedTea,GrayMouse9&area=devops,fullstack&hide=subtasks");
    expect(filterFromQuery(query, PEOPLE, DEFAULT_CONFIG)).toEqual(filter);
    expect(filterToQuery(DEFAULT_FILTER, DEFAULT_CONFIG)).toBe("");
    expect(filterFromQuery("", PEOPLE, DEFAULT_CONFIG)).toEqual(DEFAULT_FILTER);
  });

  test("stale query is ignored", () => {
    expect(filterFromQuery("?people=ghost&area=zzz&hide=foo", PEOPLE, DEFAULT_CONFIG)).toEqual(DEFAULT_FILTER);
    expect(filterFromQuery("?people=ghost,iRedTea", PEOPLE, DEFAULT_CONFIG).people).toEqual(["iRedTea"]);
    expect(filterFromQuery("?hide=help", PEOPLE, DEFAULT_CONFIG).hide).toEqual([]);
    expect(filterFromQuery("?hide=mentors", PEOPLE, DEFAULT_CONFIG).hide).toEqual(["mentors"]);
  });
});

test("personLoad", () => {
  const load = personLoad(MODULE, PEOPLE);
  expect(load.map((l) => l.login)).toEqual(PEOPLE.map((p) => p.login));
  expect(load.find((l) => l.login === "YarikMix")).toEqual({ login: "YarikMix", doing: 1, mentoring: 1 });
  expect(load.find((l) => l.login === "ManInTheCoat")).toEqual({ login: "ManInTheCoat", doing: 0, mentoring: 0 });
});

test("pageRef: module and track pages by relative path", () => {
  expect(pageRef("modules/2/index.md", DEFAULT_CONFIG)).toEqual({ module: "2" });
  expect(pageRef("modules/2/tracks/2fa.md", DEFAULT_CONFIG)).toEqual({ module: "2", track: "2fa" });
  expect(pageRef("modules/index.md", DEFAULT_CONFIG)).toBeNull();
  expect(pageRef("bff/index.md", DEFAULT_CONFIG)).toBeNull();
  expect(pageRef("modules/2/tracks/bff/contract.md", DEFAULT_CONFIG)).toEqual({ module: "2", track: "bff", page: "contract" });
  expect(pageRef("modules/2/tracks/bff/a/b.md", DEFAULT_CONFIG)).toBeNull();
});

test("nodePaint: people are neutral, tracks and subtasks take the track area", () => {
  expect(nodePaint({ kind: "person", area: "front" })).toEqual({ neutral: true });
  expect(nodePaint({ kind: "track", area: "devops" })).toEqual({ neutral: false, area: "devops", alpha: 1 });
  expect(nodePaint({ kind: "subtask", area: "back" })).toEqual({ neutral: false, area: "back", alpha: 0.75 });
});

test("parent without do: no person links to it, a person filter on a subtrack keeps it", () => {
  const m = parseModule("modules/2/index.md", "2", { title: "Тест" }, [
    t("twofa", { title: "2FA", area: "fullstack" }),
    t("twofa-front", { title: "2FA: фронт", area: "front", do: { iRedTea: "front" }, part_of: "twofa" }),
    t("twofa-back", { title: "2FA: бэк", area: "back", do: { GrayMouse9: "back" }, part_of: "twofa" }),
  ], CTX);
  const g = (filter: Partial<Filter> = {}) => buildGraph(m, PEOPLE, { ...DEFAULT_FILTER, ...filter });
  expect(g().links.filter((l) => l.target === "track:twofa")).toEqual([]);
  expect(g().links.filter((l) => l.kind === "do").map((l) => `${l.source}>${l.target}`)).toEqual([
    "person:GrayMouse9>track:twofa-back",
    "person:iRedTea>track:twofa-front",
  ]);
  const byDenis = g({ people: ["iRedTea"] });
  expect(byDenis.nodes.map((n) => n.id)).toEqual(["person:iRedTea", "track:twofa", "track:twofa-front"]);
  expect(byDenis.links.some((l) => l.kind === "sub" && l.target === "track:twofa-front")).toBe(true);
  expect(personLoad(m, PEOPLE).filter((l) => l.doing > 0)).toEqual([
    { login: "iRedTea", doing: 1, mentoring: 0 },
    { login: "GrayMouse9", doing: 1, mentoring: 0 },
  ]);
});

test("a mentor of a parent without do gets a mentor link and keeps the parent in their filter", () => {
  const m = parseModule("modules/2/index.md", "2", { title: "Тест" }, [
    t("prof", { title: "Профиль", area: "fullstack", mentors: ["YarikMix"] }),
    t("prof-front", { title: "Профиль: фронт", area: "front", do: { ManInTheCoat: "front" }, part_of: "prof" }),
    t("prof-back", { title: "Профиль: бэк", area: "back", do: { GrayMouse9: "back" }, part_of: "prof" }),
  ], CTX);
  const g = (filter: Partial<Filter> = {}) => buildGraph(m, PEOPLE, { ...DEFAULT_FILTER, ...filter });
  expect(g().links).toContainEqual({ source: "person:YarikMix", target: "track:prof", kind: "mentor" });
  expect(g({ people: ["YarikMix"] }).nodes.map((n) => n.id)).toEqual(["person:YarikMix", "track:prof"]);
});
