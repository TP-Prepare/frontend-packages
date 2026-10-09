import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/**/*.ts", "!src/**/*.d.ts"],
	unbundle: true,
	format: ["esm"],
	dts: true,
	clean: true,
});
