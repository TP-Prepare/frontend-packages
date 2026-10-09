// Пакет для тестового сайта — копией в test/site/node_modules, как после `npm install` у потребителя.
// Через node_modules Vite выносит пакет из SSR-сборки во внешние, и без ssr.noExternal сборка падает
// на .vue; симлинк workspace (путь без node_modules) эту ошибку прячет.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const pkg = new URL("../../", import.meta.url);
const target = new URL("./node_modules/@tp-prepare/vitepress-module-graph/", import.meta.url);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(new URL("package.json", pkg), new URL("package.json", target));
cpSync(new URL("dist/", pkg), new URL("dist/", target), { recursive: true });
