import { describe, expect, test } from "bun:test";
import {
  assignTasks,
  moduleTasks,
  moscowDate,
  parseSnapshot,
  sortTasks,
  statusRank,
  noTasksNote,
  tasksWithSubtracks,
  trackProgress,
  type BoardData,
  type BoardSnapshot,
  type BoardTask,
  type ModuleTasks,
} from "../src/index.ts";
import type { Module, Track } from "../src/index.ts";

const task = (over: Record<string, unknown> = {}) => ({
  ref: "frontend#28",
  title: "Форма входа",
  url: "https://github.com/o/frontend/issues/28",
  state: "open",
  status: "In progress",
  sprint: "Sprint 5",
  assignees: ["YarikMix"],
  track: "auth",
  parent: null,
  ...over,
});
const snapshot = (over: Record<string, unknown> = {}) => ({
  takenAt: "2026-10-08T09:00:00Z",
  sprints: [{ title: "Sprint 5", start: "2026-10-13", days: 14 }],
  tasks: [task(), task({ ref: "backend#3", state: "not_planned", status: null, sprint: null, assignees: [], track: null, parent: "backend#1" })],
  ...over,
});

describe("parseSnapshot", () => {
  test("an unparseable takenAt is a SnapshotError", () => {
    expect(() => parseSnapshot(snapshot({ takenAt: "x" }))).toThrow("board.json: takenAt — нужна дата и время в формате ISO");
  });

  test("a sprint start that is not YYYY-MM-DD is a SnapshotError", () => {
    expect(() => parseSnapshot(snapshot({ sprints: [{ title: "Sprint 5", start: "завтра", days: 14 }] }))).toThrow(
      "board.json: sprints[0].start — нужна дата в формате ГГГГ-ММ-ДД",
    );
  });

  test("a valid snapshot is returned equal to the input", () => {
    const input: unknown = snapshot();
    expect<unknown>(parseSnapshot(input)).toEqual(input);
  });

  test("a non-object fails", () => {
    expect(() => parseSnapshot("x")).toThrow("board.json: нужен объект");
  });

  test("missing tasks fails", () => {
    expect(() => parseSnapshot(snapshot({ tasks: undefined }))).toThrow("board.json: tasks — нужен список");
  });

  test("a non-string ref fails with its path", () => {
    expect(() => parseSnapshot(snapshot({ tasks: [task({ ref: 1 })] }))).toThrow("board.json: tasks[0].ref — нужна строка");
  });

  test("an unknown state fails", () => {
    expect(() => parseSnapshot(snapshot({ tasks: [task({ state: "weird" })] }))).toThrow(
      "board.json: tasks[0].state — допустимо: open, closed, not_planned",
    );
  });

  test("a non-number sprint days fails", () => {
    expect(() => parseSnapshot(snapshot({ sprints: [{ title: "Sprint 5", start: "2026-10-13", days: "14" }] }))).toThrow(
      "board.json: sprints[0].days — нужно число",
    );
  });
});

const mkTrack = (id: string, module: string): Track => ({
  id,
  module,
  title: id,
  label: id,
  area: "front",
  do: [],
  mentors: [],
  subtasks: [],
  related: [],
  hasBody: false,
  pages: [],
  url: `/modules/${module}/${id}`,
});
const mkModule = (id: string, sprints: string[], tracks: string[]): Module => ({
  id,
  title: id,
  sprints,
  url: `/modules/${id}/`,
  tracks: tracks.map((t) => mkTrack(t, id)),
});
const modules: Module[] = [
  mkModule("2", ["Sprint 5", "Sprint 6", "Sprint 7", "Sprint 8"], ["bff", "xss"]),
  mkModule("3", ["Sprint 9", "Sprint 10", "Sprint 11", "Sprint 12"], ["bff"]),
];
const sprintStarts = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
const mkTask = (over: Partial<BoardTask> = {}): BoardTask => ({
  ref: "frontend#1",
  title: "t",
  url: "u",
  state: "open",
  status: "Backlog",
  sprint: null,
  assignees: [],
  track: null,
  parent: null,
  ...over,
});
const mkSnap = (tasks: BoardTask[], takenAt = "2026-10-20T10:00:00Z"): BoardSnapshot => ({
  takenAt,
  sprints: sprintStarts.map((start, i) => ({ title: `Sprint ${i + 5}`, start, days: 7 })),
  tasks,
});
const at = (r: Record<string, ModuleTasks>, id: string): ModuleTasks => {
  const found = r[id];
  if (!found) throw new Error(`no module ${id}`);
  return found;
};
const refs = (tasks: BoardTask[]) => tasks.map((t) => t.ref);

describe("assignTasks", () => {
  test("track from parent", () => {
    const parent = mkTask({ ref: "frontend#1", track: "bff", sprint: "Sprint 6" });
    const child = mkTask({ ref: "frontend#2", parent: "frontend#1", sprint: "Sprint 6" });
    const r = assignTasks(modules, mkSnap([parent, child]));
    expect(refs(at(r, "2").byTrack.bff ?? [])).toEqual(["frontend#1", "frontend#2"]);
  });

  test("track from the right parent when repo#N would collide across organisations", () => {
    const a = mkTask({ ref: "go/r#8", track: "bff", sprint: "Sprint 6" });
    const b = mkTask({ ref: "fe/r#8", track: "xss", sprint: "Sprint 6" });
    const child = mkTask({ ref: "r#2", parent: "go/r#8", sprint: "Sprint 6" });
    const r = assignTasks(modules, mkSnap([a, b, child]));
    expect(refs(at(r, "2").byTrack.bff ?? [])).toEqual(["go/r#8", "r#2"]);
    expect(refs(at(r, "2").byTrack.xss ?? [])).toEqual(["fe/r#8"]);
  });

  test("a missing parent gives no track", () => {
    const child = mkTask({ ref: "frontend#2", parent: "frontend#99", sprint: "Sprint 6" });
    const r = assignTasks(modules, mkSnap([child]));
    expect(refs(at(r, "2").untracked)).toEqual(["frontend#2"]);
  });

  test("module by sprint", () => {
    const r = assignTasks(modules, mkSnap([mkTask({ track: "bff", sprint: "Sprint 9" })]));
    expect(at(r, "3").byTrack.bff ?? []).toHaveLength(1);
    expect(at(r, "2").byTrack.bff ?? []).toHaveLength(0);
  });

  test("sprint outside modules", () => {
    const r = assignTasks(modules, mkSnap([mkTask({ track: "bff", sprint: "Sprint 3" })]));
    for (const id of ["2", "3"]) {
      expect(at(r, id).byTrack.bff ?? []).toHaveLength(0);
      expect(at(r, id).untracked).toHaveLength(0);
      expect(at(r, id).unknown).toHaveLength(0);
    }
  });

  test("no sprint goes to the current module", () => {
    const r = assignTasks(modules, mkSnap([mkTask({ track: "bff" })], "2026-10-20T10:00:00Z"));
    expect(at(r, "2").byTrack.bff ?? []).toHaveLength(1);
    expect(at(r, "3").byTrack.bff ?? []).toHaveLength(0);
  });

  test("no sprint between modules goes to the newest", () => {
    const r = assignTasks(modules, mkSnap([mkTask({ track: "bff" })], "2026-12-20T10:00:00Z"));
    expect(at(r, "3").byTrack.bff ?? []).toHaveLength(1);
    expect(at(r, "2").byTrack.bff ?? []).toHaveLength(0);
  });

  test("no sprint between modules goes to the newest by number, 10 after 9", () => {
    const nine = mkModule("9", ["Sprint 5", "Sprint 6", "Sprint 7", "Sprint 8"], ["bff"]);
    const ten = mkModule("10", ["Sprint 9", "Sprint 10", "Sprint 11", "Sprint 12"], ["bff"]);
    const r = assignTasks([nine, ten], mkSnap([mkTask({ track: "bff" })], "2026-12-20T10:00:00Z"));
    expect(at(r, "10").byTrack.bff ?? []).toHaveLength(1);
    expect(at(r, "9").byTrack.bff ?? []).toHaveLength(0);
  });

  test("untracked only from module sprints", () => {
    const none = assignTasks(modules, mkSnap([mkTask()]));
    expect(at(none, "2").untracked).toHaveLength(0);
    expect(at(none, "3").untracked).toHaveLength(0);
    const sp = assignTasks(modules, mkSnap([mkTask({ sprint: "Sprint 6" })]));
    expect(at(sp, "2").untracked).toHaveLength(1);
  });

  test("unknown track", () => {
    const r = assignTasks(modules, mkSnap([mkTask({ track: "ghost", sprint: "Sprint 6" })]));
    expect(at(r, "2").unknown).toHaveLength(1);
  });

  test("every module has a key", () => {
    expect(Object.keys(assignTasks(modules, mkSnap([]))).sort()).toEqual(["2", "3"]);
  });
});

describe("trackProgress", () => {
  test("counts done, active and total without not_planned", () => {
    const tasks = [
      mkTask({ status: "Done" }),
      mkTask({ state: "closed", status: "Backlog" }),
      mkTask({ status: "In review" }),
      mkTask({ status: "Ready" }),
      mkTask({ state: "not_planned", status: "In progress" }),
    ];
    expect(trackProgress(tasks)).toEqual({ done: 2, active: 1, total: 4 });
  });
});

describe("sortTasks", () => {
  test("status groups in order, not_planned last, ref inside a group", () => {
    const tasks = [
      mkTask({ ref: "a#1", status: "Done" }),
      mkTask({ ref: "a#2", status: "In progress", state: "not_planned" }),
      mkTask({ ref: "a#4", status: null }),
      mkTask({ ref: "a#3", status: "Backlog" }),
      mkTask({ ref: "a#5", status: "Weird" }),
      mkTask({ ref: "a#6", status: "In review" }),
      mkTask({ ref: "a#7", status: "In progress" }),
    ];
    expect(refs(sortTasks(tasks))).toEqual(["a#7", "a#6", "a#3", "a#4", "a#5", "a#1", "a#2"]);
  });
});

describe("statusRank", () => {
  test("STATUS_ORDER, unknown status right after Backlog, null as Backlog", () => {
    expect(statusRank("In progress")).toBeLessThan(statusRank("In review"));
    expect(statusRank("In review")).toBeLessThan(statusRank("Ready"));
    expect(statusRank("Ready")).toBeLessThan(statusRank("Backlog"));
    expect(statusRank("Backlog")).toBeLessThan(statusRank("Weird"));
    expect(statusRank("Weird")).toBeLessThan(statusRank("Done"));
    expect(statusRank(null)).toBe(statusRank("Backlog"));
  });
});

describe("moscowDate", () => {
  test("converts to Moscow date", () => {
    expect(moscowDate("2026-10-11T21:30:00Z")).toBe("2026-10-12");
  });
});

describe("moduleTasks", () => {
  const board: BoardData = { takenAt: "2026-10-08T09:00:00Z", byModule: assignTasks(modules, mkSnap([])) };
  const [withSprints] = modules;
  const noSprints: Module = { ...(withSprints as Module), id: "2026-09", sprints: [] };

  test("no snapshot gives null", () => {
    expect(moduleTasks(null, withSprints as Module)).toBeNull();
  });
  test("a module without sprints gives null even with a snapshot", () => {
    expect(moduleTasks(board, noSprints)).toBeNull();
  });
  test("a module with sprints gives its tasks, or an empty set when the snapshot has none for it", () => {
    expect(moduleTasks(board, withSprints as Module)).toBe(board.byModule["2"] as ModuleTasks);
    expect(moduleTasks({ ...board, byModule: {} }, withSprints as Module)).toEqual({ byTrack: {}, untracked: [], unknown: [] });
  });
});

test("tasksWithSubtracks: parent sums subtracks, others only own", () => {
  const m: Module = { ...mkModule("2", [], ["svc", "front", "xss"]) };
  m.tracks[1] = { ...m.tracks[1]!, partOf: "svc" };
  const a = mkTask({ ref: "frontend#1" });
  const b = mkTask({ ref: "frontend#2" });
  expect(tasksWithSubtracks(m, { front: [b] }, "svc")).toEqual([b]);
  expect(tasksWithSubtracks(m, { svc: [a], front: [b] }, "svc")).toEqual([a, b]);
  expect(tasksWithSubtracks(m, { svc: [a], front: [b] }, "front")).toEqual([b]);
  expect(tasksWithSubtracks(m, {}, "xss")).toEqual([]);
});

test("noTasksNote: parent without own tasks points to subtracks", () => {
  expect(noTasksNote(3)).toBe("Своих задач нет — задачи в подтреках");
  expect(noTasksNote(0)).toBe("Задач пока нет: их привязывают на груминге полем «Трек» на доске");
  expect(noTasksNote(0, "Трек")).toBe(noTasksNote(0));
  expect(noTasksNote(0, "Track")).toBe("Задач пока нет: их привязывают на груминге полем «Track» на доске");
  expect(noTasksNote(3, "Track")).toBe("Своих задач нет — задачи в подтреках");
});
