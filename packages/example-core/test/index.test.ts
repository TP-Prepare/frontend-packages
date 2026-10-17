import { expect, test } from "bun:test";
import { greet } from "../src/index.ts";

test.each([
	["  Alice  ", "Hello, Alice!"],
	["\tБоб\n", "Hello, Боб!"],
])("trims surrounding whitespace in %j", (name, greeting) => {
	expect(greet(name)).toBe(greeting);
});
