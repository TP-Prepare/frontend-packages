import { expect, test } from "bun:test";
import { getPublishOrder, publishReleasedPackages } from "./publish.ts";

const packages = {
	"packages/core": { name: "@example/core" },
	"packages/addon": {
		name: "@example/addon",
		dependencies: { "@example/core": "^1.0.0", external: "^2.0.0" },
	},
	"packages/other": { name: "@example/other" },
};

test("publishes a released dependency before its consumer regardless of input order", () => {
	expect(getPublishOrder(["packages/addon", "packages/other", "packages/core"], packages)).toEqual([
		"packages/core", "packages/addon", "packages/other",
	]);
});

test("does not publish a dependency that was not released", () => {
	expect(getPublishOrder(["packages/addon"], packages)).toEqual(["packages/addon"]);
});

test("rejects an unknown release path before publishing anything", async () => {
	const published: string[] = [];
	await expect(publishReleasedPackages(["packages/core", "../unknown"], packages, async (path) => {
		published.push(path);
	})).rejects.toThrow("Unknown release path");
	expect(published).toEqual([]);
});

test("rejects circular runtime dependencies", () => {
	expect(() => getPublishOrder(["packages/a", "packages/b"], {
		"packages/a": { name: "a", dependencies: { b: "1.0.0" } },
		"packages/b": { name: "b", dependencies: { a: "1.0.0" } },
	})).toThrow("Circular dependency");
});

test("waits for dependency publication to finish before starting the consumer", async () => {
	const events: string[] = [];
	await publishReleasedPackages(["packages/addon", "packages/core"], packages, async (path) => {
		events.push(`start ${path}`);
		await Bun.sleep(1);
		events.push(`end ${path}`);
	});
	expect(events).toEqual([
		"start packages/core", "end packages/core", "start packages/addon", "end packages/addon",
	]);
});

test("stops when a dependency cannot be published", async () => {
	const published: string[] = [];
	await expect(publishReleasedPackages(["packages/addon", "packages/core"], packages, async (path) => {
		published.push(path);
		throw new Error("Registry rejected publish");
	})).rejects.toThrow("Registry rejected publish");
	expect(published).toEqual(["packages/core"]);
});
