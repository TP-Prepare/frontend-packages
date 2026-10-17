import { greet } from "@tp-prepare/example-core";

export const greetAll = (names: readonly string[]): string[] => names.map(greet);
