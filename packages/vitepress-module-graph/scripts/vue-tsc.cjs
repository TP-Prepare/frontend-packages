// vue-tsc на TypeScript 6: у typescript 7 (tsc репозитория) нет JS API, а vue-tsc работает через него.
// Пакет @typescript/typescript6 ставит TypeScript 6 рядом, не подменяя tsc 7.
require("vue-tsc").run(require.resolve("@typescript/typescript6/lib/tsc"));
