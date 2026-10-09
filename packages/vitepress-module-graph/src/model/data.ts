import type { BoardData } from "./board.ts";
import type { ModuleGraphConfig } from "./config.ts";
import type { Module } from "./modules.ts";
import type { Person } from "./people.ts";

/** Всё, что загрузчик отдаёт страницам: настройки, люди, модули с треками и снимок доски. */
export type ModuleGraphData = { config: ModuleGraphConfig; people: Person[]; modules: Module[]; board: BoardData | null };
