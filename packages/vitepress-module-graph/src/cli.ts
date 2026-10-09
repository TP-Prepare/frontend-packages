#!/usr/bin/env node
// CLI `module-graph`: check, check --hook, board sync, board snapshot. Спека §5.
// Работает под Node ≥ 22 и bun: ни Bun.*, ни import.meta.main.
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleDataError } from "./index.ts";
import { fetchSnapshot, sync, trackCatalog } from "./cli/board.ts";
import { checkModules, hookModulesDir } from "./cli/check.ts";
import { loadModuleDir } from "./node/index.ts";

export { hookModulesDir } from "./cli/check.ts";

const USAGE = "использование: module-graph check [--dir <папка>] [--hook] | board sync | board snapshot <файл>";

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type Parsed = { positional: string[]; dir: string | null; hook: boolean };

function parseArgs(args: readonly string[]): Parsed | null {
	const parsed: Parsed = { positional: [], dir: null, hook: false };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === "--hook") parsed.hook = true;
		else if (arg === "--dir") {
			const value = args[++i];
			if (value === undefined) return null;
			parsed.dir = value;
		} else if (arg.startsWith("--")) return null;
		else parsed.positional.push(arg);
	}
	return parsed;
}

function summary(line: string, env: Record<string, string | undefined>): void {
	console.log(line);
	if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

async function board(dir: string, command: string, path: string | undefined, env: Record<string, string | undefined>): Promise<void> {
	const { config, modules } = loadModuleDir(dir);
	if (!config.board) {
		throw new ModuleDataError(`${dir.split(/[\\/]/).filter(Boolean).pop() ?? "modules"}/module-graph.yaml`, "board", "нет раздела; нужен { owner, project, field }");
	}
	const token = env.GH_TOKEN;
	if (!token) throw new Error("не задан GH_TOKEN");
	if (command === "sync") {
		const added = await sync(token, config.board, trackCatalog(modules));
		summary(`sync: добавлено ${added} значений «${config.board.field}»`, env);
	} else {
		const snapshot = await fetchSnapshot(token, config.board, new Date().toISOString());
		writeFileSync(path as string, `${JSON.stringify(snapshot, null, 2)}\n`);
		summary(`snapshot: ${snapshot.tasks.length} задач`, env);
	}
}

/** Точка входа CLI; возвращает код выхода. `stdin` нужен только `check --hook`. Стек наружу не выходит. */
export async function main(
	args: readonly string[],
	env: Record<string, string | undefined>,
	stdin: string,
	cwd: string,
): Promise<number> {
	const parsed = parseArgs(args);
	const [command, sub, extra] = parsed?.positional ?? [];
	const usage = (): number => {
		console.error(USAGE);
		return 1;
	};
	if (!parsed) return usage();

	if (command === "check" && sub === undefined) {
		if (parsed.hook) {
			const dir = hookModulesDir(stdin);
			if (dir === null) return 0;
			try {
				checkModules(dir);
				return 0;
			} catch (error) {
				console.error(errorText(error));
				return 2;
			}
		}
		try {
			console.log(checkModules(parsed.dir === null ? resolve(cwd, "site", "modules") : resolve(cwd, parsed.dir)));
			return 0;
		} catch (error) {
			console.error(`module-graph: ${errorText(error)}`);
			return 1;
		}
	}

	const isBoard = command === "board" && !parsed.hook;
	if (!isBoard || (sub !== "sync" && sub !== "snapshot") || extra !== undefined && sub === "sync") return usage();
	const path = parsed.positional[2];
	if (sub === "snapshot" && !path) {
		console.error("module-graph: snapshot: укажите путь к файлу");
		return 1;
	}
	try {
		await board(parsed.dir === null ? resolve(cwd, "site", "modules") : resolve(cwd, parsed.dir), sub, path === undefined ? undefined : resolve(cwd, path), env);
		return 0;
	} catch (error) {
		const token = env.GH_TOKEN;
		let message = errorText(error);
		if (token) message = message.split(token).join("***");
		console.error(`module-graph: ${message}`);
		if (env.GITHUB_STEP_SUMMARY) {
			try {
				appendFileSync(env.GITHUB_STEP_SUMMARY, `module-graph: ${message}\n`);
			} catch {
				// сводка необязательна: код возврата важнее
			}
		}
		return 1;
	}
}

// Запуск только как команда: из тестов и по import модуль ничего не делает.
function isEntry(): boolean {
	const argv1 = process.argv[1];
	if (!argv1) return false;
	try {
		return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
}

if (isEntry()) {
	const args = process.argv.slice(2);
	let stdin = "";
	if (args.includes("--hook")) {
		try {
			stdin = readFileSync(0, "utf8");
		} catch {
			stdin = "";
		}
	}
	process.exitCode = await main(args, process.env, stdin, process.cwd());
}
