import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

test.skipIf(!existsSync(cli))("dist/cli.mjs под node: check на фикстуре", () => {
	const r = spawnSync("node", [cli, "check", "--dir", "test/fixtures/cdd/modules"], { cwd: pkg, encoding: "utf8" });
	expect(r.status).toBe(0);
	expect(r.stdout).toBe("modules ok: 1 модуль, 35 треков\n");
	expect(r.stderr).toBe("");
});

test.skipIf(!existsSync(cli))("dist/cli.mjs: шебанг node и --hook читает stdin", () => {
	expect(readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
	const input = JSON.stringify({ tool_input: { file_path: `${pkg}test/fixtures/cdd/modules/2/index.md` } });
	const r = spawnSync("node", [cli, "check", "--hook"], { cwd: pkg, input, encoding: "utf8" });
	expect(r.status).toBe(0);
	expect(r.stdout + r.stderr).toBe("");
});
