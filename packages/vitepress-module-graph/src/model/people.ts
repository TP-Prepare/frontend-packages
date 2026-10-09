import type { ModuleGraphConfig } from "./config.ts";
import { ModuleDataError } from "./errors.ts";

export type Person = { login: string; name: string; role: string; area: string; mentor?: true };

const KEYS = ["login", "name", "role", "area", "mentor"] as const;

/** Разбирает уже прочитанный YAML `people.yaml`. */
export function parsePeople(file: string, data: unknown, config: ModuleGraphConfig): Person[] {
	if (!Array.isArray(data)) throw new ModuleDataError(file, "файл", "нужен список людей");
	const areas = config.areas.map((a) => a.key);
	const seen = new Set<string>();
	return data.map((raw: unknown, i) => {
		const at = `[${i}]`;
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			throw new ModuleDataError(file, at, "нужен словарь login, name, role, area");
		}
		const r = raw as Record<string, unknown>;
		for (const k of Object.keys(r)) {
			if (!(KEYS as readonly string[]).includes(k)) {
				throw new ModuleDataError(file, `${at}.${k}`, `неизвестный ключ; допустимо: ${KEYS.join(", ")}`);
			}
		}
		for (const k of ["login", "name", "role"] as const) {
			const v = r[k];
			if (typeof v !== "string" || v.trim() === "") throw new ModuleDataError(file, `${at}.${k}`, "нужна непустая строка");
		}
		const login = r.login as string;
		if (seen.has(login)) throw new ModuleDataError(file, `${at}.login`, `логин ${login} повторяется`);
		seen.add(login);
		const area = r.area;
		if (typeof area !== "string" || area.trim() === "") throw new ModuleDataError(file, `${at}.area`, "нужна непустая строка");
		if (!areas.includes(area)) {
			throw new ModuleDataError(file, `${at}.area`, `неизвестное направление ${area}; допустимо: ${areas.join(", ")}`);
		}
		const person: Person = { login, name: r.name as string, role: r.role as string, area };
		if (r.mentor !== undefined) {
			if (r.mentor !== true) throw new ModuleDataError(file, `${at}.mentor`, "только true");
			person.mentor = true;
		}
		return person;
	});
}
