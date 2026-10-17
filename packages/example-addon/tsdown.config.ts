import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// Keep the runtime import: the consumer installs core through dependencies.
	deps: { neverBundle: ["@tp-prepare/example-core"] },
});
