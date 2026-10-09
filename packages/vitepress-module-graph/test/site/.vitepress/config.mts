// Тестовый сайт пакета: подключение как у потребителя (README, «Подключение»), данные — копия фикстуры cdd.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { moduleSidebar, readModules } from "@tp-prepare/vitepress-module-graph/node";

export default defineConfig({
	lang: "ru-RU",
	title: "module-graph",
	cleanUrls: true,
	// Фикстура — страницы сайта docs: ссылки на его разделы (/architecture/ и др.) здесь ведут в никуда.
	ignoreDeadLinks: true,
	// Пакет отдаёт .vue как есть: без этой строки Vite оставляет его внешним в SSR-сборке и Node падает на .vue.
	vite: { ssr: { noExternal: ["@tp-prepare/vitepress-module-graph"] } },
	themeConfig: {
		sidebar: {
			"/modules/": moduleSidebar(readModules(fileURLToPath(new URL("../modules", import.meta.url)))),
		},
	},
});
