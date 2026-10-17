import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Install the actual npm tarballs outside the workspace so symlinks cannot hide
// missing dist files, broken exports, or an unpublished workspace: dependency.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryParent = resolve(tmpdir());
const consumer = mkdtempSync(join(temporaryParent, "frontend-package-check-"));

function run(command: string[], cwd: string): string {
	const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(`${command.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
	}
	return result.stdout.toString();
}

try {
	const archives: string[] = [];
	for (const name of ["example-core", "example-addon"]) {
		const [packed] = JSON.parse(run(
			["npm", "pack", "--json", "--pack-destination", consumer],
			join(root, "packages", name),
		)) as { filename: string; files: { path: string }[] }[];
		assert(packed, `npm pack returned no archive for ${name}`);
		const files = packed.files.map((file) => file.path);
		assert(files.includes("dist/index.mjs"), `${name}: missing JavaScript export`);
		assert(files.includes("dist/index.d.mts"), `${name}: missing TypeScript declarations`);
		assert(!files.some((file) => file.startsWith("src/")), `${name}: packed source files`);
		archives.push(join(consumer, packed.filename));
	}
	writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
	run(["npm", "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", ...archives], consumer);
	writeFileSync(join(consumer, "check.mjs"), `
import { strict as assert } from "node:assert";
import { greet } from "@tp-prepare/example-core";
import { greetAll } from "@tp-prepare/example-addon";
assert.equal(greet("Alice"), "Hello, Alice!");
assert.deepEqual(greetAll(["Alice", "Bob"]), ["Hello, Alice!", "Hello, Bob!"]);
`);
	run(["node", "check.mjs"], consumer);
	const installedCore = join(consumer, "node_modules", "@tp-prepare", "example-core");
	assert(installedCore.startsWith(`${consumer}${process.platform === "win32" ? "\\" : "/"}`));
	rmSync(installedCore, { recursive: true, force: true });
	const withoutCore = Bun.spawnSync([
		"node", "--input-type=module", "--eval", 'import "@tp-prepare/example-addon";',
	], { cwd: consumer, stdout: "pipe", stderr: "pipe" });
	assert.notEqual(withoutCore.exitCode, 0, "addon must depend on the installed core, not a bundled copy");
	assert.match(withoutCore.stderr.toString(), /ERR_MODULE_NOT_FOUND/);
	assert.match(withoutCore.stderr.toString(), /@tp-prepare\/example-core/);
	console.log("Both npm tarballs install offline and run under Node.js; addon requires the installed core.");
} finally {
	if (dirname(consumer) !== temporaryParent) throw new Error(`Unexpected temporary path: ${consumer}`);
	rmSync(consumer, { recursive: true, force: true });
}
