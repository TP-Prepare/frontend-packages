// Проверка собранного тестового сайта (скрипт test:site, после `vitepress build test/site`).
import { readFileSync } from "node:fs";

const page = (path: string) => readFileSync(new URL(`./.vitepress/dist/${path}`, import.meta.url), "utf8");
const expectations: [string, string][] = [
	["modules/2/index.html", "--mg-area-front:#2c6bd4"],
	["modules/2/index.html", 'href="/modules/2/tracks/bff"'],
	["modules/2/tracks/bff.html", "Трек · Фронт + бэк"],
	["modules/2/tracks/bff.html", "--mg-area-fullstack:#c9445a"],
	["modules/2/tracks/bff/contract.html", 'href="/modules/2/tracks/bff"'],
	["modules/index.html", 'href="/modules/2/"'],
];
const missing = expectations.filter(([path, text]) => !page(path).includes(text));
for (const [path, text] of missing) console.error(`test:site: в ${path} нет «${text}»`);
if (missing.length > 0) process.exit(1);
console.log(`test:site ok: ${expectations.length} проверок`);
