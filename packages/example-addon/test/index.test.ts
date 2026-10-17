import { expect, test } from "bun:test";
import { greetAll } from "../src/index.ts";

test("greets every name through the core package, preserving order", () => {
	expect(greetAll(["Alice", "Боб"])).toEqual(["Hello, Alice!", "Hello, Боб!"]);
});

test("an empty list produces no greetings", () => {
	expect(greetAll([])).toEqual([]);
});
