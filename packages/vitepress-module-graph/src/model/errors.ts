/** Ошибка в данных модуля: роняет сборку с файлом и полем. */
export class ModuleDataError extends Error {
	constructor(file: string, field: string, problem: string) {
		super(`${file}: ${field} — ${problem}`);
		this.name = "ModuleDataError";
	}
}
