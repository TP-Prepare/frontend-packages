import { expect, test } from "bun:test";

const read = async (rel: string) =>
	(await Bun.file(new URL(rel, import.meta.url)).json()) as any;

test("манифест пакета", async () => {
	const pkg = await read("../package.json");
	expect(pkg.name).toBe("@tp-prepare/vitepress-module-graph");
	// версию двигает release-please — проверяем форму, а не число
	expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
	expect(pkg.engines.node).toBe(">=22");
	expect(pkg.bin["module-graph"]).toBe("dist/cli.mjs");
	for (const key of [".", "./node", "./theme", "./style.css"]) {
		expect(pkg.exports).toHaveProperty([key]);
	}
	expect(pkg.files).toEqual(["dist"]);
	expect(pkg.publishConfig.access).toBe("public");
	expect(pkg.peerDependencies).toEqual({ vitepress: "^1.6", vue: "^3.5" });
	// без homepage npm ведёт ссылку Homepage в корень монорепы, а не на README пакета
	expect(pkg.homepage).toBe(
		"https://github.com/TP-Prepare/frontend-packages/tree/main/packages/vitepress-module-graph#readme",
	);
});

test("release-please", async () => {
	const cfg = await read("../../../release-please-config.json");
	const entry = cfg.packages["packages/vitepress-module-graph"];
	expect(entry.component).toBe("vitepress-module-graph");
	expect(cfg.plugins.map((p: any) => p.type)).toContain("node-workspace");
	const manifest = await read("../../../.release-please-manifest.json");
	const pkg = await read("../package.json");
	expect(manifest["packages/vitepress-module-graph"]).toBe(pkg.version);
});
