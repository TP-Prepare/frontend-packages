// Дымовая проверка `vitepress dev` на тестовом сайте (скрипт test:site, после install.ts).
// В dev Vite заранее собирает `…/theme` в .vitepress/cache/deps со своей копией data.mjs, а .vue берут
// data.mjs из node_modules: ключ provide/inject определён в двух модулях. Проверяем, что все .vue
// отдаются и что каждое определение ключа — общий Symbol.for, иначе компоненты не видят данных.
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const pkg = fileURLToPath(new URL("../../", import.meta.url));
const KEY_RE = /Symbol(\.for)?\(\s*["']module-graph["']\s*\)/g;
const IMPORT_RE = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const OURS = /@tp-prepare[/_]vitepress-module-graph/;

function start(): Promise<{ server: ChildProcess; base: string }> {
	const server = spawn("vitepress", ["dev", "test/site", "--port", "0"], { cwd: pkg, stdio: ["ignore", "pipe", "pipe"] });
	return new Promise((resolve, reject) => {
		let out = "";
		const timer = setTimeout(() => reject(new Error(`dev-сервер не запустился за 60 с:\n${out}`)), 60_000);
		const onData = (chunk: Buffer) => {
			out += chunk.toString();
			const port = /localhost:(\d+)/.exec(out.replace(/\x1b\[[0-9;]*m/g, ""))?.[1];
			if (port) {
				clearTimeout(timer);
				resolve({ server, base: `http://localhost:${port}` });
			}
		};
		server.stdout?.on("data", onData);
		server.stderr?.on("data", onData);
		server.on("exit", (code) => reject(new Error(`dev-сервер завершился с кодом ${code}:\n${out}`)));
	});
}

async function get(base: string, path: string): Promise<string> {
	const res = await fetch(base + path);
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.text();
}

// Модули пакета, достижимые из темы сайта: обход импортов, пока Vite отдаёт их без ошибок.
async function crawl(base: string): Promise<Map<string, string>> {
	const seen = new Map<string, string>();
	const queue = ["/.vitepress/theme/index.ts"];
	while (queue.length > 0) {
		const path = queue.shift() as string;
		if (seen.has(path)) continue;
		const text = await get(base, path);
		seen.set(path, text);
		for (const m of text.matchAll(IMPORT_RE)) {
			const next = m[1] ?? m[2];
			if (next?.startsWith("/") && OURS.test(next) && !next.includes("?vue&type=style")) queue.push(next);
		}
	}
	return seen;
}

const { server, base } = await start();
let failed = false;
try {
	await get(base, "/modules/2/");
	// Первый обход запускает оптимизацию зависимостей; после неё у собранных файлов другой ?v= — повторяем.
	let modules: Map<string, string> | null = null;
	for (let attempt = 1; !modules; attempt++) {
		try {
			modules = await crawl(base);
		} catch (error) {
			if (attempt >= 5) throw error;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	const vue = [...modules.keys()].filter((p) => /\.vue(\?|$)/.test(p));
	const keys = [...modules.values()].flatMap((text) => [...text.matchAll(KEY_RE)]);
	const problems = [
		...(vue.length < 9 ? [`отдано ${vue.length} .vue из 9`] : []),
		...(keys.length === 0 ? ["не найдено определение ключа module-graph"] : []),
		...keys.filter((k) => !k[1]).map((k) => `ключ не общий: ${k[0]} — у пред-сборки и .vue будут разные ключи`),
	];
	for (const p of problems) console.error(`test:site dev: ${p}`);
	failed = problems.length > 0;
	if (!failed) console.log(`test:site dev ok: ${modules.size} модулей пакета, ${vue.length} .vue, определений ключа: ${keys.length}`);
} finally {
	await new Promise((resolve) => {
		const force = setTimeout(() => server.kill("SIGKILL"), 5000);
		server.once("exit", () => resolve(clearTimeout(force)));
		server.kill();
	});
}
if (failed) process.exit(1);
