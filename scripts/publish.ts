import { fileURLToPath } from "node:url";

type Package = {
	name: string;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

export function getPublishOrder(paths: readonly string[], packages: Record<string, Package>): string[] {
	const released = new Set(paths);
	for (const path of released) {
		if (!Object.hasOwn(packages, path)) throw new Error(`Unknown release path: ${path}`);
	}
	const pathsByName = new Map(Object.entries(packages).map(([path, pkg]) => [pkg.name, path]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const ordered: string[] = [];

	function visit(path: string): void {
		if (visited.has(path)) return;
		if (visiting.has(path)) throw new Error(`Circular dependency: ${path}`);
		visiting.add(path);
		const pkg = packages[path]!;
		for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
			const dependency = pathsByName.get(name);
			if (dependency && released.has(dependency)) visit(dependency);
		}
		visiting.delete(path);
		visited.add(path);
		ordered.push(path);
	}

	for (const path of released) visit(path);
	return ordered;
}

export async function publishReleasedPackages(
	paths: readonly string[],
	packages: Record<string, Package>,
	publish: (path: string) => Promise<void>,
): Promise<void> {
	// Validate the entire graph before the first irreversible registry operation.
	for (const path of getPublishOrder(paths, packages)) await publish(path);
}

if (import.meta.main) {
	try {
		const paths: unknown = JSON.parse(process.env.RELEASED_PATHS ?? "[]");
		if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) {
			throw new Error("RELEASED_PATHS must be a JSON array of package paths");
		}
		const root = new URL("../", import.meta.url);
		const config = await Bun.file(new URL("release-please-config.json", root)).json();
		const packages: Record<string, Package> = {};
		for (const path of Object.keys(config.packages)) {
			packages[path] = await Bun.file(new URL(`${path}/package.json`, root)).json();
		}
		await publishReleasedPackages(paths, packages, async (path) => {
			console.log(`Publishing ${path}`);
			const command = ["npm", "publish"];
			if (process.argv.includes("--dry-run")) command.push("--dry-run");
			const child = Bun.spawn(command, {
				cwd: fileURLToPath(new URL(`${path}/`, root)),
				stdin: "inherit", stdout: "inherit", stderr: "inherit",
			});
			const code = await child.exited;
			if (code !== 0) throw new Error(`npm publish failed for ${path} (exit ${code})`);
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
