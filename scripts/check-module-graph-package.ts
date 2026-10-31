import { strict as assert } from "node:assert";
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = join(root, "packages/vitepress-module-graph");
const temporaryParent = realpathSync(tmpdir());
const consumer = mkdtempSync(join(temporaryParent, "module-graph-package-check-"));

function run(command: string[], cwd = consumer): string {
	const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(`${command.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
	}
	return result.stdout.toString();
}

try {
	const archive = process.argv[2]
		? resolve(process.argv[2])
		: resolve(pkg, run(["bun", "pm", "pack", "--destination", consumer, "--quiet"], pkg).trim());
	assert(existsSync(archive), `Missing archive: ${archive}`);
	writeFileSync(join(consumer, "package.json"), JSON.stringify({
		private: true,
		type: "module",
		dependencies: {
			"@tp-prepare/vitepress-module-graph": archive,
			vitepress: "2.0.0-alpha.21",
			vue: "3.5.43",
		},
	}));
	run(["bun", "install", "--ignore-scripts"]);
	const installed = join(consumer, "node_modules/@tp-prepare/vitepress-module-graph");
	assert(!lstatSync(installed).isSymbolicLink(), "Package must not be a workspace symlink");
	const files = [
		"dist/index.mjs", "dist/index.d.mts", "dist/node/index.mjs", "dist/node/index.d.mts",
		"dist/theme/style.css", "dist/theme/AreaStyle.vue",
		...["GraphCanvas", "TrackList", "ModuleList", "TrackMeta", "NodeCard", "ModuleGraph", "GraphFilters", "TaskList"]
			.map((name) => `dist/theme/components/${name}.vue`),
	];
	for (const file of files) {
		const path = join(installed, file);
		assert(existsSync(path), `Missing installed file: ${file}`);
		assert(realpathSync(path).startsWith(`${consumer}${sep}`), `File escaped consumer: ${file}`);
	}
	const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
	assert.equal(manifest.peerDependencies.vitepress, "2.0.0-alpha.21");
	// Copy only source fixtures: the consumer must install and build its own dependencies.
	cpSync(join(pkg, "test/site"), join(consumer, "site"), {
		recursive: true,
		filter: (source) => !["node_modules", "cache", "dist"].includes(basename(source)),
	});
	// The fixture's typecheck config extends the workspace; this consumer has no workspace parent.
	writeFileSync(join(consumer, "site/tsconfig.json"), JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "bundler" } }));
	writeFileSync(join(consumer, "check.mjs"), `
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { defaultFilter } from "@tp-prepare/vitepress-module-graph";
import { createModulesLoader } from "@tp-prepare/vitepress-module-graph/node";
const loader = createModulesLoader(pathToFileURL(resolve("site/modules/modules.data.ts")).href);
assert(loader.watch.includes("./people.yaml"));
const data = loader.load();
assert.equal(data.modules[0].title, "Модуль №2");
assert(data.modules[0].tracks.some((track) => track.id === "bff"));
assert(defaultFilter(data.config).areas.includes("fullstack"));
`);
	run(["node", "check.mjs"]);
	assert.match(run(["node", join(installed, "dist/cli.mjs"), "check", "--dir", "site/modules"]), /modules ok:/);
	// The fixture config supplies ssr.noExternal; building also exercises the .vue theme export.
	run(["node", "node_modules/vitepress/bin/vitepress.js", "build", "site"]);
	run(["bun", "site/check.ts"]);
	const base = process.env.SITE_BASE ?? "/";
	const expectations: [string, string][] = [
		["modules/index.html", "Модуль №2"],
		["modules/2/tracks/bff.html", `href="${base}modules/2/tracks/bff/contract"`],
		["modules/2/tracks/bff/contract.html", "Контракт"],
	];
	for (const [file, text] of expectations) {
		assert(readFileSync(join(consumer, "site/.vitepress/dist", file), "utf8").includes(text), `${file}: missing ${text}`);
	}
	console.log("Module-graph tarball installs outside the workspace; model, node, CLI and VitePress site pass.");
} finally {
	if (dirname(consumer) !== temporaryParent) throw new Error(`Unexpected temporary path: ${consumer}`);
	rmSync(consumer, { recursive: true, force: true });
}
